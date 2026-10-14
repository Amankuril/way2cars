import { describe, it, expect, beforeAll } from 'vitest';
import { api, useDb, auth, tokenFor, upload } from './helpers.js';
import { Vendor, VendorBankAccount } from '../src/modules/vendors/vendor.model.js';
import { AdminUser } from '../src/modules/admin/admin.model.js';
import { City } from '../src/modules/catalog/catalog.model.js';
import { KycSubmission } from '../src/modules/kyc/kyc.model.js';

useDb();

const ctx = {};

/** Takes a host through profile, business, KYC and bank, then submits the application. */
async function onboard(phone) {
  const vendor = await Vendor.create({ phone });
  const v = await tokenFor('vendor', vendor);
  await api().put('/api/v1/vendor/me/profile').set(auth(v)).send({ name: 'Asha Rao', email: `${phone}@example.com` }).expect(200);
  await api().put('/api/v1/vendor/me/business').set(auth(v)).send({ businessType: 'individual', cityId: String(ctx.city._id), address: { line1: '12 MG Road', city: 'Indore', state: 'Madhya Pradesh', pincode: '452001' } }).expect(200);
  await api().post('/api/v1/vendor/me/kyc').set(auth(v)).send({
    idProofType: 'aadhaar', idProofNumber: '123412341234', idProofFrontFileId: await upload('vendor', v, 'kyc_document'),
    panNumber: 'ABCDE1234F', panFileId: await upload('vendor', v, 'kyc_document', { pdf: true }), selfieFileId: await upload('vendor', v, 'kyc_selfie'), dateOfBirth: '1985-04-01',
  }).expect(201);
  await api().put('/api/v1/vendor/me/bank').set(auth(v)).send({ accountHolderName: 'Asha Rao', accountNumber: '123456789012', confirmAccountNumber: '123456789012', ifsc: 'HDFC0001234', proofFileId: await upload('vendor', v, 'bank_proof') }).expect(200);
  await api().post('/api/v1/vendor/me/onboarding/submit').set(auth(v)).expect(200);
  return vendor;
}

beforeAll(async () => {
  ctx.city = await City.create({ name: 'Indore', slug: 'indore-review', center: { type: 'Point', coordinates: [75.86, 22.72] }, serviceRadiusKm: 30 });
  const admin = await AdminUser.create({ email: 'hosts@test.in', name: 'Hosts', role: 'super_admin', passwordHash: 'x' });
  ctx.admin = await tokenFor('admin', admin);
});

describe('one-step host review', () => {
  it('approves KYC, bank and the host together', async () => {
    const vendor = await onboard('9811100001');
    const res = await api().post(`/api/v1/admin/vendors/${vendor._id}/review`).set(auth(ctx.admin)).send({ decision: 'approve' }).expect(200);
    expect(res.body.data.status).toBe('approved');
    const [fresh, bank, kyc] = await Promise.all([
      Vendor.findById(vendor._id).lean(),
      VendorBankAccount.findOne({ vendorId: vendor._id, isActive: true }).lean(),
      KycSubmission.findOne({ subjectType: 'vendor', subjectId: vendor._id }).lean(),
    ]);
    expect(fresh.kyc.status).toBe('approved');
    expect(bank.verification.status).toBe('verified');
    expect(kyc.status).toBe('approved');
    expect(kyc.review.checks).toMatchObject({ idValid: true, selfieMatches: true, ageEligible: true });
  });

  it('only reviews hosts that are waiting for review', async () => {
    const approved = await Vendor.findOne({ phone: '9811100001' });
    const res = await api().post(`/api/v1/admin/vendors/${approved._id}/review`).set(auth(ctx.admin)).send({ decision: 'approve' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE');
  });

  it('needs a reason to reject', async () => {
    const vendor = await onboard('9811100002');
    ctx.pending = vendor;
    const res = await api().post(`/api/v1/admin/vendors/${vendor._id}/review`).set(auth(ctx.admin)).send({ decision: 'reject' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REASON_REQUIRED');
  });

  it('rejects and reopens the KYC and bank steps for the host to fix', async () => {
    const id = ctx.pending._id;
    const res = await api().post(`/api/v1/admin/vendors/${id}/review`).set(auth(ctx.admin))
      .send({ decision: 'reject', reason: 'Selfie is blurry and the bank proof does not match the name.', reopen: { kyc: true, bank: true } }).expect(200);
    expect(res.body.data.status).toBe('rejected');
    const [fresh, bank, kyc] = await Promise.all([
      Vendor.findById(id).lean(),
      VendorBankAccount.findOne({ vendorId: id, isActive: true }).lean(),
      KycSubmission.findOne({ subjectType: 'vendor', subjectId: id }).lean(),
    ]);
    expect(fresh.statusReason).toMatch(/blurry/);
    expect(fresh.completedSteps).not.toContain('kyc');
    expect(fresh.completedSteps).not.toContain('bank');
    expect(kyc.status).toBe('rejected');
    expect(bank.verification.status).toBe('rejected');
  });
});
