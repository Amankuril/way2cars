import { RouterProvider } from 'react-router/dom';
import { LayoutDashboard, CalendarClock, CarFront, Wallet, UserRound } from 'lucide-react';
import { createMobileRouter } from '@/mobile/nav';
import { PhoneScreen, OtpScreen, CmsPageScreen, FaqScreen, NotificationsScreen, NotificationPrefsScreen, TicketScreen, NewTicketScreen, placeholder } from '@/mobile/screens';
import { DEV_ROUTES, DEV_SCREENS } from '@/mobile/dev';
import { ROUTES, ACCESS } from './routes';
import { Guard } from './Guard';

/** Screen registry. PHASE 2: replace each `placeholder(...)` with the ported screen. */
const SCREENS = {
  Phone: PhoneScreen,
  Otp: OtpScreen,
  CmsPage: CmsPageScreen,

  Onboarding: placeholder('Become a host'),
  ProfileStep: placeholder('Your details', { back: true }),
  BusinessStep: placeholder('Business details', { back: true }),
  KycStep: placeholder('Verify identity', { back: true }),
  BankStep: placeholder('Bank account', { back: true }),

  Faq: FaqScreen,
  Help: placeholder('Help', { back: true }),
  Ticket: TicketScreen,
  NewTicket: NewTicketScreen,
  Notifications: NotificationsScreen,

  Today: placeholder('Today'),
  Bookings: placeholder('Bookings'),
  Fleet: placeholder('Fleet'),
  Earnings: placeholder('Earnings'),
  Account: placeholder('Account'),

  Booking: placeholder('Booking', { back: true }),
  DamageClaim: placeholder('Damage claim', { back: true }),
  VehicleForm: placeholder('Car details', { back: true }),
  Vehicle: placeholder('Car', { back: true }),
  VehiclePhotos: placeholder('Photos', { back: true }),
  VehicleDocuments: placeholder('Documents', { back: true }),
  Calendar: placeholder('Availability', { back: true }),
  PricingCalendar: placeholder('Pricing', { back: true }),
  Payouts: placeholder('Payouts', { back: true }),
  Ledger: placeholder('Ledger', { back: true }),
  Reviews: placeholder('Reviews', { back: true }),
  NotificationPrefs: NotificationPrefsScreen,
};

const TABS = {
  Main: {
    screens: ['Today', 'Bookings', 'Fleet', 'Earnings', 'Account'],
    icons: { Today: LayoutDashboard, Bookings: CalendarClock, Fleet: CarFront, Earnings: Wallet, Account: UserRound },
  },
};

const screens = Object.fromEntries(Object.entries(SCREENS).map(([name, s]) => {
  const def = typeof s === 'function' ? { component: s } : s;
  return [name, { ...def, access: ACCESS[name] || 'approved' }];
}));
Object.assign(screens, DEV_SCREENS);

export const router = createMobileRouter({ basename: '/vendor', routes: { ...ROUTES, ...DEV_ROUTES }, screens, tabs: TABS, initial: 'Main', Guard });

export function RootNavigator() {
  return <RouterProvider router={router} />;
}
