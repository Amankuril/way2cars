/** Admin RBAC. Permissions are checked server-side on every admin route. */
export const ROLE_PERMISSIONS = {
  super_admin: ['*'],
  operations: [
    'dashboard.read', 'users.read', 'users.manage', 'vendors.read', 'vendors.manage', 'kyc.review',
    'vehicles.read', 'vehicles.manage', 'vehicles.review', 'catalog.manage', 'bookings.read', 'bookings.manage',
    'trips.manage', 'support.manage', 'reports.read', 'payments.read', 'reviews.manage',
  ],
  kyc_reviewer: ['dashboard.read', 'users.read', 'vendors.read', 'kyc.review', 'vehicles.read', 'vehicles.review'],
  finance: [
    'dashboard.read', 'users.read', 'vendors.read', 'bookings.read', 'payments.read', 'refunds.manage',
    'payouts.manage', 'reports.read', 'vendors.bank.review',
  ],
  support: ['dashboard.read', 'users.read', 'vendors.read', 'vehicles.read', 'bookings.read', 'support.manage', 'reviews.manage'],
  content: ['dashboard.read', 'cms.manage', 'coupons.manage', 'banners.manage', 'catalog.manage'],
};

export function hasPermission(role, permission) {
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes('*') || perms.includes(permission);
}

export const permissionsFor = (role) => ROLE_PERMISSIONS[role] || [];
