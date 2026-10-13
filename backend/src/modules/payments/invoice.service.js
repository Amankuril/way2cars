import PDFDocument from 'pdfkit';
import { nextSequence, financialYear } from '../../core/counters.js';
import { formatIst } from '../../core/time.js';
import { Invoice } from './payment.model.js';
import { User } from '../users/user.model.js';
import { City } from '../catalog/catalog.model.js';
import { getSettings } from '../settings/settings.service.js';

const SAC = '996601'; // rental services of road vehicles with operator excluded — configurable in settings

function gstSplit(gstPaise, bps, supplierState, supplyState) {
  const intra = !supplierState || !supplyState || supplierState === supplyState;
  if (!intra) return { bps, cgstPaise: 0, sgstPaise: 0, igstPaise: gstPaise, totalPaise: gstPaise };
  const half = Math.floor(gstPaise / 2);
  return { bps, cgstPaise: half, sgstPaise: gstPaise - half, igstPaise: 0, totalPaise: gstPaise };
}

/** Creates the tax invoice for a captured payment (one per payment; idempotent on paymentId). */
export async function issueInvoice({ booking, payment, type }, session) {
  const existing = await Invoice.findOne({ paymentId: payment._id }).session(session).lean();
  if (existing) return existing;
  const [settings, user, city] = await Promise.all([
    getSettings(),
    User.findById(booking.userId).select('name phone email').session(session).lean(),
    City.findById(booking.cityId).select('gstStateCode').session(session).lean(),
  ]);
  const fy = financialYear();
  const seq = await nextSequence(`invoice:${fy}`, session);
  const number = `W2C/${fy}/${String(seq).padStart(6, '0')}`;
  const sac = settings.tax.sacCode || SAC;
  let lines = [];
  let taxable = 0;
  let gst = 0;
  let nonTaxable = [];
  let total = 0;
  let wallet = 0;

  if (type === 'booking') {
    const p = booking.pricing;
    lines = [
      { description: `Self-drive rental — ${booking.vehicleSnapshot.title} (${p.hours} h)`, sac, amountPaise: p.rentalPaise },
      ...(p.discountPaise ? [{ description: `Discount${p.couponCode ? ` (${p.couponCode})` : ''}`, sac, amountPaise: -p.discountPaise }] : []),
      ...(p.deliveryFeePaise ? [{ description: 'Doorstep delivery', sac, amountPaise: p.deliveryFeePaise }] : []),
      ...(p.convenienceFeePaise ? [{ description: 'Convenience fee', sac, amountPaise: p.convenienceFeePaise }] : []),
    ];
    taxable = p.taxablePaise;
    gst = p.gstPaise;
    nonTaxable = p.depositPaise ? [{ description: 'Refundable security deposit', amountPaise: p.depositPaise }] : [];
    total = p.totalPaise;
    wallet = p.walletAppliedPaise;
  } else if (type === 'extension') {
    const ext = booking.extensions.find((e) => String(e._id) === String(payment.extensionId));
    lines = [{ description: `Trip extension to ${formatIst(ext.requestedEndAt)} (${ext.pricing.hours} h)`, sac, amountPaise: ext.pricing.rentalPaise }];
    taxable = ext.pricing.rentalPaise;
    gst = ext.pricing.gstPaise;
    total = ext.pricing.totalPaise;
  } else {
    const s = booking.settlement;
    lines = [
      ...(s.extraKmPaise ? [{ description: `Extra kilometres (${s.extraKm} km)`, sac, amountPaise: s.extraKmPaise }] : []),
      ...(s.fuelPaise ? [{ description: 'Fuel shortfall', sac, amountPaise: s.fuelPaise }] : []),
      ...(s.lateFeePaise ? [{ description: `Late return (${s.lateHours} h)`, sac, amountPaise: s.lateFeePaise }] : []),
      ...(s.damagePaise ? [{ description: 'Damage charges', sac, amountPaise: s.damagePaise }] : []),
      { description: 'Less: adjusted against security deposit', sac, amountPaise: -(s.totalDeductionsPaise - s.outstandingPaise) },
    ];
    taxable = s.outstandingPaise;
    total = s.outstandingPaise;
  }

  const [inv] = await Invoice.create([{
    number,
    bookingId: booking._id,
    paymentId: payment._id,
    userId: booking.userId,
    type,
    billedTo: { name: user?.name, phone: user?.phone, email: user?.email },
    lines,
    taxablePaise: taxable,
    gst: gstSplit(gst, booking.pricing.gstBps, settings.tax.stateCode, city?.gstStateCode),
    nonTaxable,
    totalPaise: total,
    walletAppliedPaise: wallet,
    paidPaise: payment.amountPaise,
    supplier: { legalName: settings.tax.legalName, gstin: settings.tax.gstin, address: settings.tax.registeredAddress, stateCode: settings.tax.stateCode },
  }], { session });
  return inv;
}

const inr = (p) => `Rs ${(p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Streams a PDF rendering of an invoice. */
export function renderInvoicePdf(inv, booking, out) {
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Invoice ${inv.number}`, Author: inv.supplier.legalName } });
  doc.pipe(out);
  const ink = '#1D2C32';
  const muted = '#64748B';
  doc.fillColor(ink).font('Helvetica-Bold').fontSize(20).text('WAY2CARS', { continued: false });
  doc.font('Helvetica').fontSize(9).fillColor(muted).text(inv.supplier.legalName);
  if (inv.supplier.address) doc.text(inv.supplier.address);
  if (inv.supplier.gstin) doc.text(`GSTIN: ${inv.supplier.gstin}`);
  doc.moveDown();
  doc.fillColor(ink).font('Helvetica-Bold').fontSize(14).text(inv.type === 'settlement' ? 'Tax Invoice — Trip Settlement' : 'Tax Invoice');
  doc.font('Helvetica').fontSize(10).fillColor(ink);
  doc.text(`Invoice no: ${inv.number}`);
  doc.text(`Date: ${formatIst(inv.issuedAt, { withTime: false })}`);
  doc.text(`Booking: ${booking.ref}`);
  doc.text(`Trip: ${formatIst(booking.startAt)} — ${formatIst(booking.endAt)}`);
  doc.moveDown();
  doc.font('Helvetica-Bold').text('Billed to');
  doc.font('Helvetica').text(inv.billedTo.name || 'Customer');
  if (inv.billedTo.phone) doc.text(`+91 ${inv.billedTo.phone}`);
  if (inv.billedTo.email) doc.text(inv.billedTo.email);
  doc.moveDown();

  const row = (label, amount, { bold = false, color = ink } = {}) => {
    const y = doc.y;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(color).text(label, 48, y, { width: 360 });
    doc.text(amount, 400, y, { width: 147, align: 'right' });
    doc.moveDown(0.4);
  };
  doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('#E2E8F0').stroke().moveDown(0.5);
  for (const l of inv.lines) row(`${l.description}${l.sac ? `  (SAC ${l.sac})` : ''}`, inr(l.amountPaise));
  doc.moveTo(48, doc.y).lineTo(547, doc.y).stroke().moveDown(0.5);
  row('Taxable value', inr(inv.taxablePaise), { bold: true });
  if (inv.gst?.totalPaise) {
    const pctLabel = (inv.gst.bps / 100).toFixed(2);
    if (inv.gst.igstPaise) row(`IGST @ ${pctLabel}%`, inr(inv.gst.igstPaise));
    else {
      row(`CGST @ ${(inv.gst.bps / 200).toFixed(2)}%`, inr(inv.gst.cgstPaise));
      row(`SGST @ ${(inv.gst.bps / 200).toFixed(2)}%`, inr(inv.gst.sgstPaise));
    }
  }
  for (const n of inv.nonTaxable || []) row(`${n.description} (not taxable)`, inr(n.amountPaise));
  doc.moveTo(48, doc.y).lineTo(547, doc.y).stroke().moveDown(0.5);
  row('Invoice total', inr(inv.totalPaise), { bold: true });
  if (inv.walletAppliedPaise) row('Paid from WAY2CARS wallet', inr(inv.walletAppliedPaise), { color: muted });
  row('Paid online', inr(inv.paidPaise), { color: muted });
  doc.moveDown(2).fontSize(8).fillColor(muted).text('This is a computer-generated invoice and does not require a signature.', { align: 'center' });
  doc.end();
}
