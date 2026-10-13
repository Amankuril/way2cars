import { RouterProvider } from 'react-router/dom';
import { LayoutDashboard, CalendarClock, CarFront, Wallet, UserRound } from 'lucide-react';
import { createMobileRouter } from '@/mobile/nav';
import { PhoneScreen, OtpScreen, CmsPageScreen, FaqScreen, NotificationsScreen, NotificationPrefsScreen, TicketScreen, NewTicketScreen } from '@/mobile/screens';
import { DEV_ROUTES, DEV_SCREENS } from '@/mobile/dev';
import { ROUTES, ACCESS } from './routes';
import { Guard } from './Guard';
import { OnboardingScreen } from '../screens/onboarding/OnboardingScreen';
import { ProfileStepScreen } from '../screens/onboarding/ProfileStepScreen';
import { BusinessStepScreen } from '../screens/onboarding/BusinessStepScreen';
import { KycStepScreen } from '../screens/onboarding/KycStepScreen';
import { BankStepScreen } from '../screens/onboarding/BankStepScreen';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { BookingsScreen } from '../screens/bookings/BookingsScreen';
import { BookingDetailScreen } from '../screens/bookings/BookingDetailScreen';
import { DamageClaimScreen } from '../screens/bookings/DamageClaimScreen';
import { FleetScreen } from '../screens/fleet/FleetScreen';
import { VehicleFormScreen } from '../screens/fleet/VehicleFormScreen';
import { VehicleDetailScreen } from '../screens/fleet/VehicleDetailScreen';
import { VehiclePhotosScreen } from '../screens/fleet/VehiclePhotosScreen';
import { VehicleDocumentsScreen } from '../screens/fleet/VehicleDocumentsScreen';
import { CalendarScreen } from '../screens/fleet/CalendarScreen';
import { PricingCalendarScreen } from '../screens/fleet/PricingCalendarScreen';
import { EarningsScreen } from '../screens/earnings/EarningsScreen';
import { PayoutsScreen } from '../screens/earnings/PayoutsScreen';
import { LedgerScreen } from '../screens/earnings/LedgerScreen';
import { AccountScreen } from '../screens/account/AccountScreen';
import { ReviewsScreen } from '../screens/account/ReviewsScreen';
import { HelpScreen } from '../screens/account/HelpScreen';

/** Screen registry: native screen name → ported screen (apps/vendor/src/navigation/RootNavigator.jsx + MainTabs.jsx). */
const SCREENS = {
  Phone: PhoneScreen,
  Otp: OtpScreen,
  CmsPage: CmsPageScreen,

  Onboarding: OnboardingScreen,
  ProfileStep: ProfileStepScreen,
  BusinessStep: BusinessStepScreen,
  KycStep: KycStepScreen,
  BankStep: BankStepScreen,

  Faq: FaqScreen,
  Help: HelpScreen,
  Ticket: TicketScreen,
  NewTicket: NewTicketScreen,
  Notifications: NotificationsScreen,

  Today: DashboardScreen,
  Bookings: BookingsScreen,
  Fleet: FleetScreen,
  Earnings: EarningsScreen,
  Account: AccountScreen,

  Booking: BookingDetailScreen,
  DamageClaim: DamageClaimScreen,
  VehicleForm: VehicleFormScreen,
  Vehicle: VehicleDetailScreen,
  VehiclePhotos: VehiclePhotosScreen,
  VehicleDocuments: VehicleDocumentsScreen,
  Calendar: CalendarScreen,
  PricingCalendar: PricingCalendarScreen,
  Payouts: PayoutsScreen,
  Ledger: LedgerScreen,
  Reviews: ReviewsScreen,
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
