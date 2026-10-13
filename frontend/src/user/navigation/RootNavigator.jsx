import { RouterProvider } from 'react-router/dom';
import { Compass, CalendarClock, LifeBuoy, UserRound } from 'lucide-react';
import { createMobileRouter } from '@/mobile/nav';
import { PhoneScreen, OtpScreen, CmsPageScreen, FaqScreen, NotificationsScreen, NotificationPrefsScreen, TicketScreen, NewTicketScreen, placeholder } from '@/mobile/screens';
import { DEV_ROUTES, DEV_SCREENS } from '@/mobile/dev';
import { ROUTES, ACCESS } from './routes';
import { Guard } from './Guard';

/**
 * Screen registry. PHASE 2: replace each `placeholder(...)` with the ported screen component
 * (e.g. `Explore: HomeScreen`). Names and params must match the native navigator.
 */
const SCREENS = {
  Phone: PhoneScreen,
  Otp: OtpScreen,
  CmsPage: CmsPageScreen,
  ProfileSetup: placeholder('Complete your profile'),

  Explore: placeholder('Explore'),
  Trips: placeholder('Trips'),
  Help: placeholder('Help'),
  Account: placeholder('Account'),

  CitySelect: { component: placeholder('Choose city', { back: true }), animation: 'slide_from_bottom' },
  Search: placeholder('Search results', { back: true }),
  Vehicle: placeholder('Car details', { back: true }),
  Checkout: placeholder('Checkout', { back: true }),
  Trip: placeholder('Trip', { back: true }),
  Pickup: placeholder('Pickup', { back: true }),
  Return: placeholder('Return', { back: true }),
  Review: placeholder('Review', { back: true }),
  Kyc: placeholder('Verify licence', { back: true }),
  EditProfile: placeholder('Edit profile', { back: true }),
  Addresses: placeholder('Saved addresses', { back: true }),
  AddressForm: placeholder('Address', { back: true }),
  Wallet: placeholder('Wallet', { back: true }),
  Referral: placeholder('Refer & earn', { back: true }),
  PaymentHistory: placeholder('Payments', { back: true }),
  SavedMethods: placeholder('Saved methods', { back: true }),
  Notifications: NotificationsScreen,
  NotificationPrefs: NotificationPrefsScreen,
  DeleteAccount: placeholder('Delete account', { back: true }),
  Offers: placeholder('Offers', { back: true }),
  Ticket: TicketScreen,
  NewTicket: NewTicketScreen,
  Roadside: placeholder('Roadside help', { back: true }),
  Faq: FaqScreen,
};

const TABS = {
  Main: {
    screens: ['Explore', 'Trips', 'Help', 'Account'],
    icons: { Explore: Compass, Trips: CalendarClock, Help: LifeBuoy, Account: UserRound },
  },
};

const screens = Object.fromEntries(Object.entries(SCREENS).map(([name, s]) => {
  const def = typeof s === 'function' ? { component: s } : s;
  return [name, { ...def, access: ACCESS[name] || 'auth' }];
}));
Object.assign(screens, DEV_SCREENS);

export const router = createMobileRouter({ basename: '/user', routes: { ...ROUTES, ...DEV_ROUTES }, screens, tabs: TABS, initial: 'Main', Guard });

export function RootNavigator() {
  return <RouterProvider router={router} />;
}
