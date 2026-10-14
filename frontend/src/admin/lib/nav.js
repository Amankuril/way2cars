import {
  LayoutDashboard, CalendarRange, LifeBuoy, ShieldCheck, Car, Building2, Users, Wallet, BarChart3,
  TicketPercent, Image, Megaphone, FileText, HelpCircle, Tags, Star, Settings, UserCog, ScrollText,
  PlugZap, KeyRound, UserCheck, ClipboardCheck,
} from 'lucide-react';

/**
 * Sidebar structure. `perm` hides items the signed-in admin cannot use (the API enforces the
 * same permissions server-side). Paths are relative to the /admin basename.
 */
export const NAV = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', to: '/', icon: LayoutDashboard, perm: 'dashboard.read', end: true }],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Bookings', to: '/bookings', icon: CalendarRange, perm: 'bookings.read' },
      { label: 'Support', to: '/support', icon: LifeBuoy, perm: 'support.manage' },
    ],
  },
  {
    label: 'Host management',
    items: [
      { label: 'Host requests', to: '/hosts/requests', icon: UserCheck, perm: 'vendors.read' },
      { label: 'Hosts', to: '/hosts', icon: Building2, perm: 'vendors.read' },
    ],
  },
  {
    label: 'Fleet',
    items: [
      { label: 'Vehicle requests', to: '/vehicles/requests', icon: ClipboardCheck, perm: 'vehicles.read' },
      { label: 'Vehicles', to: '/vehicles', icon: Car, perm: 'vehicles.read' },
    ],
  },
  {
    label: 'Customers',
    items: [
      { label: 'Users', to: '/users', icon: Users, perm: 'users.read' },
      { label: 'Renter KYC', to: '/renter-kyc', icon: ShieldCheck, perm: 'kyc.review' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Payouts', to: '/payouts', icon: Wallet, perm: 'payouts.manage' },
      { label: 'Reports', to: '/reports', icon: BarChart3, perm: 'reports.read' },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { label: 'Coupons', to: '/coupons', icon: TicketPercent, perm: 'coupons.manage' },
      { label: 'Banners', to: '/banners', icon: Image, perm: 'banners.manage' },
      { label: 'Broadcast', to: '/broadcast', icon: Megaphone, perm: 'coupons.manage' },
    ],
  },
  {
    label: 'Content',
    items: [
      { label: 'Pages', to: '/content/pages', icon: FileText, perm: 'cms.manage' },
      { label: 'FAQs', to: '/content/faqs', icon: HelpCircle, perm: 'cms.manage' },
      { label: 'Catalog', to: '/catalog', icon: Tags, perm: 'catalog.manage' },
    ],
  },
  {
    label: 'Moderation',
    items: [{ label: 'Reviews', to: '/reviews', icon: Star, perm: 'reviews.manage' }],
  },
  {
    label: 'System',
    items: [
      { label: 'Settings', to: '/system/settings', icon: Settings, perm: 'settings.manage' },
      { label: 'Admin accounts', to: '/system/admins', icon: UserCog, perm: 'admins.manage' },
      { label: 'Audit log', to: '/system/audit', icon: ScrollText, perm: 'audit.read' },
      { label: 'Integrations', to: '/system/integrations', icon: PlugZap, perm: 'settings.manage' },
      { label: 'My security', to: '/account/security', icon: KeyRound, perm: null },
    ],
  },
];

/** Finds the nav group + item for a pathname (longest matching prefix). */
export function matchNav(pathname) {
  let best = null;
  for (const group of NAV) {
    for (const item of group.items) {
      const hit = item.to === '/' ? pathname === '/' : pathname === item.to || pathname.startsWith(`${item.to}/`);
      if (hit && (!best || item.to.length > best.item.to.length)) best = { group, item };
    }
  }
  return best;
}

export const ROLE_LABEL = {
  super_admin: 'Super admin',
  operations: 'Operations',
  kyc_reviewer: 'KYC reviewer',
  finance: 'Finance',
  support: 'Support',
  content: 'Content',
};
