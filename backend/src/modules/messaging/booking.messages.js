import { env } from '../../config/env.js';
import { logger } from '../../core/logger.js';
import { formatIst } from '../../core/time.js';
import { pct } from '../../core/money.js';
import { Booking } from '../bookings/booking.model.js';
import { User } from '../users/user.model.js';
import { getSettings } from '../settings/settings.service.js';
import { sendWhatsappTemplate, whatsappLink } from '../../integrations/whatsapp.js';
import { sendBookingSms } from '../../integrations/sms.js';

/**
 * Booking confirmation sent on WhatsApp and SMS: trip details plus the rules that apply (speed limit,
 * extra-km / late / fuel charges, deposit, conduct rules). The same content is shown in the apps and
 * offered to staff as a pre-filled WhatsApp message when no provider is configured.
 */

const rupees = (paise) => `₹${Math.round((paise || 0) / 100).toLocaleString('en-IN')}`;

/** Structured terms for one booking (also returned to the renter app and admin). */
export function bookingTerms(b, settings) {
  const p = b.pricing || {};
  const t = settings.trip;
  const deposit = b.deposit?.type && b.deposit.type !== 'cash'
    ? `${b.deposit.type === 'bike' ? 'Bike' : 'Laptop'} (${[b.deposit.collateral?.make, b.deposit.collateral?.model, b.deposit.collateral?.year].filter(Boolean).join(' ')}) handed over at pickup, returned after the car is handed back`
    : `${rupees(p.depositPaise)} refundable, returned after the car is inspected`;
  return {
    speedLimitKmph: settings.bookingTerms.speedLimitKmph,
    kmAllowance: p.unlimitedKm ? 'Unlimited km' : `${p.includedKm} km included`,
    extraKmCharge: p.unlimitedKm ? null : `${rupees(p.extraKmChargePaise)} per extra km`,
    lateReturn: `${rupees(pct(p.hourlyPaise || 0, t.lateFeeMultiplierBps))} per hour after a ${t.lateGraceMinutes}-minute grace period`,
    fuel: `${rupees(t.fuelChargePerEighthPaise)} per 1/8 tank short at return`,
    deposit,
    rules: settings.bookingTerms.rules || [],
    termsUrl: `${env.APP_PUBLIC_URL.replace(/\/$/, '')}/user/pages/terms-and-conditions`,
  };
}

const placeText = (b) => (b.pickup?.type === 'hub' ? `${b.pickup.name}, ${b.pickup.address}` : b.pickup?.address || 'Shared in the app after confirmation');

/** Plain-text confirmation (WhatsApp click-to-send fallback and admin preview). */
export function bookingConfirmationText(b, user, settings) {
  const terms = bookingTerms(b, settings);
  const paid = Math.max(0, (b.payment?.paidPaise || 0) - (b.payment?.refundedPaise || 0));
  const lines = [
    `Hi ${user?.name || 'there'}, your WAY2CARS booking is confirmed ✅`,
    '',
    `Booking: ${b.ref}`,
    `Car: ${b.vehicleSnapshot?.title} (${b.vehicleSnapshot?.registrationNumber})`,
    `Pickup: ${formatIst(b.startAt)}`,
    `Return: ${formatIst(b.endAt)}`,
    `Pickup at: ${placeText(b)}`,
    ...(b.dropoff?.type === 'hub' ? [`Drop-off at: ${b.dropoff.name}, ${b.dropoff.address}`] : []),
    `Paid: ${rupees(paid)}${b.balance?.status === 'due' ? ` · Balance ${rupees(b.balance.duePaise)} due by ${formatIst(b.balance.dueAt)}` : ''}`,
    '',
    'Trip rules & charges:',
    `• Speed limit: ${terms.speedLimitKmph} km/h`,
    `• ${terms.kmAllowance}${terms.extraKmCharge ? `; ${terms.extraKmCharge}` : ''}`,
    `• Late return: ${terms.lateReturn}`,
    `• Fuel: ${terms.fuel}`,
    `• Security deposit: ${terms.deposit}`,
    ...terms.rules.map((r) => `• ${r}`),
    '',
    `Full terms: ${terms.termsUrl}`,
    ...(settings.support.phone ? [`Help: ${settings.support.phone}`] : []),
  ];
  return lines.join('\n');
}

const shortTerms = (terms) => [`Speed limit ${terms.speedLimitKmph} km/h`, terms.kmAllowance, terms.extraKmCharge, `Late return ${terms.lateReturn.split(' after')[0]}`].filter(Boolean).join('; ');

/**
 * Sends the confirmation on every enabled channel and logs the outcome on the booking. Channels that
 * already succeeded are skipped unless `force` (staff resend). Never throws.
 */
export async function sendBookingConfirmation(bookingId, { force = false } = {}) {
  try {
    const [b, settings] = await Promise.all([Booking.findById(bookingId).lean(), getSettings()]);
    if (!b) return [];
    const user = await User.findById(b.userId).select('name phone').lean();
    if (!user?.phone) return [];
    const sent = new Set((b.messages || []).filter((m) => m.kind === 'booking_confirmation' && m.status === 'sent').map((m) => m.channel));
    const terms = bookingTerms(b, settings);
    const paid = Math.max(0, (b.payment?.paidPaise || 0) - (b.payment?.refundedPaise || 0));
    const results = [];
    if (settings.messaging.bookingWhatsapp && (force || !sent.has('whatsapp'))) {
      const r = await sendWhatsappTemplate(user.phone, [user.name || 'there', b.ref, b.vehicleSnapshot?.title, formatIst(b.startAt), formatIst(b.endAt), placeText(b), rupees(paid), shortTerms(terms), terms.termsUrl]);
      results.push({ channel: 'whatsapp', kind: 'booking_confirmation', ...r, at: new Date() });
    }
    if (settings.messaging.bookingSms && (force || !sent.has('sms'))) {
      const r = await sendBookingSms(user.phone, { name: user.name || 'Customer', ref: b.ref, vehicle: b.vehicleSnapshot?.title, start: formatIst(b.startAt), end: formatIst(b.endAt), link: terms.termsUrl });
      results.push({ channel: 'sms', kind: 'booking_confirmation', ...r, at: new Date() });
    }
    if (results.length) await Booking.updateOne({ _id: b._id }, { $push: { messages: { $each: results.map(({ channel, kind, status, error, providerRef, at }) => ({ channel, kind, status, error, providerRef, at })), $slice: -20 } } });
    return results;
  } catch (err) {
    logger.error({ err, bookingId }, 'booking confirmation messages failed');
    return [];
  }
}

/** Staff-facing preview + click-to-send WhatsApp link. */
export async function confirmationPreview(b) {
  const [settings, user] = await Promise.all([getSettings(), User.findById(b.userId).select('name phone').lean()]);
  const text = bookingConfirmationText(b, user, settings);
  return { text, whatsappUrl: user?.phone ? whatsappLink(user.phone, text) : null, terms: bookingTerms(b, settings) };
}
