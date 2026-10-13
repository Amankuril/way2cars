import { RouterProvider } from 'react-router/dom';
import { Compass, CalendarClock, LifeBuoy, UserRound } from 'lucide-react';
import { createMobileRouter } from '@/mobile/nav';
import { PhoneScreen, OtpScreen, CmsPageScreen, FaqScreen, NotificationsScreen, NotificationPrefsScreen, TicketScreen, NewTicketScreen } from '@/mobile/screens';
import { ProfileSetupScreen } from '../screens/auth/ProfileSetupScreen';
import { HomeScreen } from '../screens/home/HomeScreen';
import { TripsScreen } from '../screens/trips/TripsScreen';
import { HelpScreen } from '../screens/support/HelpScreen';
import { AccountScreen } from '../screens/account/AccountScreen';
import { CitySelectScreen } from '../screens/home/CitySelectScreen';
import { SearchResultsScreen } from '../screens/search/SearchResultsScreen';
import { VehicleScreen } from '../screens/vehicle/VehicleScreen';
import { CheckoutScreen } from '../screens/booking/CheckoutScreen';
import { TripDetailScreen } from '../screens/trips/TripDetailScreen';
import { PickupScreen } from '../screens/trips/PickupScreen';
import { ReturnScreen } from '../screens/trips/ReturnScreen';
import { ReviewScreen } from '../screens/trips/ReviewScreen';
import { KycScreen } from '../screens/account/KycScreen';
import { EditProfileScreen } from '../screens/account/EditProfileScreen';
import { AddressesScreen } from '../screens/account/AddressesScreen';
import { AddressFormScreen } from '../screens/account/AddressFormScreen';
import { WalletScreen } from '../screens/account/WalletScreen';
import { ReferralScreen } from '../screens/account/ReferralScreen';
import { PaymentHistoryScreen } from '../screens/account/PaymentHistoryScreen';
import { SavedMethodsScreen } from '../screens/account/SavedMethodsScreen';
import { DeleteAccountScreen } from '../screens/account/DeleteAccountScreen';
import { OffersScreen } from '../screens/home/OffersScreen';
import { RoadsideScreen } from '../screens/support/RoadsideScreen';
import { DEV_ROUTES, DEV_SCREENS } from '@/mobile/dev';
import { ROUTES, ACCESS } from './routes';
import { Guard } from './Guard';

/**
 * Screen registry: native screen name → ported component (apps/user/src/navigation/RootNavigator.jsx
 * + MainTabs.jsx). Names and params match the native navigator.
 */
const SCREENS = {
  Phone: PhoneScreen,
  Otp: OtpScreen,
  CmsPage: CmsPageScreen,
  ProfileSetup: ProfileSetupScreen,

  Explore: HomeScreen,
  Trips: TripsScreen,
  Help: HelpScreen,
  Account: AccountScreen,

  CitySelect: { component: CitySelectScreen, animation: 'slide_from_bottom' },
  Search: SearchResultsScreen,
  Vehicle: VehicleScreen,
  Checkout: CheckoutScreen,
  Trip: TripDetailScreen,
  Pickup: PickupScreen,
  Return: ReturnScreen,
  Review: ReviewScreen,
  Kyc: KycScreen,
  EditProfile: EditProfileScreen,
  Addresses: AddressesScreen,
  AddressForm: AddressFormScreen,
  Wallet: WalletScreen,
  Referral: ReferralScreen,
  PaymentHistory: PaymentHistoryScreen,
  SavedMethods: SavedMethodsScreen,
  Notifications: NotificationsScreen,
  NotificationPrefs: NotificationPrefsScreen,
  DeleteAccount: DeleteAccountScreen,
  Offers: OffersScreen,
  Ticket: TicketScreen,
  NewTicket: NewTicketScreen,
  Roadside: RoadsideScreen,
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
