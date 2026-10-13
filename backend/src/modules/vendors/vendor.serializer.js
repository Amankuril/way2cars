import { vendorNextStep } from '../auth/auth.service.js';

export function serializeVendor(v) {
  if (!v) return null;
  return {
    id: v._id,
    phone: v.phone,
    name: v.name || '',
    email: v.email || '',
    businessType: v.businessType,
    businessName: v.businessName || '',
    gstin: v.gstin || '',
    address: v.address || null,
    cityId: v.cityId || null,
    status: v.status,
    statusReason: v.statusReason || null,
    completedSteps: v.completedSteps || [],
    nextStep: vendorNextStep(v),
    kyc: { status: v.kyc?.status || 'not_submitted', rejectionReason: v.kyc?.rejectionReason || null },
    hasBankAccount: Boolean(v.bankAccountId),
    wallet: v.wallet,
    rating: v.rating,
    notificationPrefs: v.notificationPrefs,
    createdAt: v.createdAt,
  };
}
