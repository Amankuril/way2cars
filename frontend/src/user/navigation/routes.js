/**
 * Renter app route table: native screen name → URL (under /user). Mirrors
 * apps/user/src/navigation/RootNavigator.jsx + MainTabs.jsx. Keep names identical to native so
 * `navigation.navigate('Trip', { id })` ports unchanged.
 */
export const ROUTES = {
  // signed out
  Phone: '/login',
  Otp: '/login/verify',
  CmsPage: '/pages/:slug',
  // profile gate
  ProfileSetup: '/welcome',
  // bottom tabs (group "Main")
  Explore: '/',
  Trips: '/trips',
  Help: '/help',
  Account: '/account',
  // stack
  CitySelect: '/city',
  Search: '/search',
  Vehicle: '/cars/:id',
  Checkout: '/checkout/:vehicleId',
  Trip: '/trips/:id',
  Pickup: '/trips/:id/pickup',
  Return: '/trips/:id/return',
  Review: '/trips/:id/review',
  Kyc: '/account/kyc',
  EditProfile: '/account/profile',
  Addresses: '/account/addresses',
  AddressForm: '/account/addresses/edit',
  Wallet: '/account/wallet',
  Referral: '/account/referral',
  PaymentHistory: '/account/payments',
  SavedMethods: '/account/saved-methods',
  Notifications: '/notifications',
  NotificationPrefs: '/account/notifications',
  DeleteAccount: '/account/delete',
  Offers: '/offers',
  Ticket: '/help/tickets/:id',
  NewTicket: '/help/tickets/new',
  Roadside: '/help/roadside/:bookingId',
  Faq: '/help/faq',
};

/** Screens reachable without a session. Everything else requires sign-in. */
export const ACCESS = { Phone: 'guest', Otp: 'guest', CmsPage: 'public' };
