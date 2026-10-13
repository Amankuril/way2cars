/** Shapes a user account for its owner. Never includes internal fields. */
export function serializeUser(u) {
  if (!u) return null;
  return {
    id: u._id,
    phone: u.phone,
    name: u.name || '',
    email: u.email || '',
    dateOfBirth: u.dateOfBirth || null,
    avatarFileId: u.avatarFileId || null,
    status: u.status,
    profileCompleted: Boolean(u.profileCompleted),
    addresses: (u.addresses || []).map((a) => ({
      id: a._id, label: a.label, line1: a.line1, line2: a.line2, landmark: a.landmark, city: a.city,
      state: a.state, pincode: a.pincode, location: a.location?.coordinates ? { lng: a.location.coordinates[0], lat: a.location.coordinates[1] } : null,
      isDefault: a.isDefault,
    })),
    kyc: { status: u.kyc?.status || 'not_submitted', rejectionReason: u.kyc?.rejectionReason || null, submittedAt: u.kyc?.submittedAt || null, licenceExpiry: u.kyc?.licenceExpiry || null },
    walletBalancePaise: u.walletBalancePaise || 0,
    referralCode: u.referralCode,
    notificationPrefs: u.notificationPrefs,
    stats: u.stats,
    homeCityId: u.homeCityId || null,
    createdAt: u.createdAt,
  };
}
