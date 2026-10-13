/**
 * Host app route table: native screen name → URL (under /vendor). Mirrors
 * apps/vendor/src/navigation/RootNavigator.jsx + MainTabs.jsx.
 */
export const ROUTES = {
  // signed out
  Phone: '/login',
  Otp: '/login/verify',
  CmsPage: '/pages/:slug',
  // onboarding (status onboarding/rejected)
  Onboarding: '/onboarding',
  ProfileStep: '/onboarding/profile',
  BusinessStep: '/onboarding/business',
  KycStep: '/onboarding/kyc',
  BankStep: '/onboarding/bank',
  // common (any signed-in host)
  Faq: '/help/faq',
  Help: '/help',
  Ticket: '/help/tickets/:id',
  NewTicket: '/help/tickets/new',
  Notifications: '/notifications',
  // bottom tabs (group "Main")
  Today: '/',
  Bookings: '/bookings',
  Fleet: '/fleet',
  Earnings: '/earnings',
  Account: '/account',
  // approved hosts only
  Booking: '/bookings/:id',
  DamageClaim: '/bookings/:id/damage-claim',
  VehicleForm: '/fleet/vehicle-form/:id?',
  Vehicle: '/fleet/:id',
  VehiclePhotos: '/fleet/:id/photos',
  VehicleDocuments: '/fleet/:id/documents',
  Calendar: '/fleet/:id/calendar',
  PricingCalendar: '/fleet/:id/pricing',
  Payouts: '/earnings/payouts',
  Ledger: '/earnings/ledger',
  Reviews: '/account/reviews',
  NotificationPrefs: '/account/notifications',
};

/**
 * guest: signed-out only · public: anyone · onboarding: signed in (any status) ·
 * approved: signed in and past onboarding (default) · onboardingOnly: the Onboarding hub.
 */
export const ACCESS = {
  Phone: 'guest', Otp: 'guest', CmsPage: 'public',
  Onboarding: 'onboardingOnly',
  ProfileStep: 'onboarding', BusinessStep: 'onboarding', KycStep: 'onboarding', BankStep: 'onboarding',
  Faq: 'onboarding', Help: 'onboarding', Ticket: 'onboarding', NewTicket: 'onboarding', Notifications: 'onboarding',
};
