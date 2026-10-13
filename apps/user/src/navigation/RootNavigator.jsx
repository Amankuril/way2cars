import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Loading } from '@shared/native';
import { useAuth } from '../auth/AuthContext';
import { MainTabs } from './MainTabs';
import { PhoneScreen } from '../screens/auth/PhoneScreen';
import { OtpScreen } from '../screens/auth/OtpScreen';
import { ProfileSetupScreen } from '../screens/auth/ProfileSetupScreen';
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
import { NotificationsScreen } from '../screens/account/NotificationsScreen';
import { NotificationPrefsScreen } from '../screens/account/NotificationPrefsScreen';
import { CmsPageScreen } from '../screens/account/CmsPageScreen';
import { DeleteAccountScreen } from '../screens/account/DeleteAccountScreen';
import { OffersScreen } from '../screens/home/OffersScreen';
import { TicketScreen } from '../screens/support/TicketScreen';
import { NewTicketScreen } from '../screens/support/NewTicketScreen';
import { RoadsideScreen } from '../screens/support/RoadsideScreen';
import { FaqScreen } from '../screens/support/FaqScreen';

const Stack = createNativeStackNavigator();
const opts = { headerShown: false, animation: 'slide_from_right' };

export function RootNavigator() {
  const { status, account } = useAuth();
  if (status === 'restoring') return <Loading />;

  if (status === 'signedOut') {
    return (
      <Stack.Navigator screenOptions={opts}>
        <Stack.Screen name="Phone" component={PhoneScreen} />
        <Stack.Screen name="Otp" component={OtpScreen} />
        <Stack.Screen name="CmsPage" component={CmsPageScreen} />
      </Stack.Navigator>
    );
  }
  if (!account?.profileCompleted) {
    return (
      <Stack.Navigator screenOptions={opts}>
        <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
        <Stack.Screen name="CmsPage" component={CmsPageScreen} />
      </Stack.Navigator>
    );
  }
  return (
    <Stack.Navigator screenOptions={opts}>
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen name="CitySelect" component={CitySelectScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="Search" component={SearchResultsScreen} />
      <Stack.Screen name="Vehicle" component={VehicleScreen} />
      <Stack.Screen name="Checkout" component={CheckoutScreen} />
      <Stack.Screen name="Trip" component={TripDetailScreen} />
      <Stack.Screen name="Pickup" component={PickupScreen} />
      <Stack.Screen name="Return" component={ReturnScreen} />
      <Stack.Screen name="Review" component={ReviewScreen} />
      <Stack.Screen name="Kyc" component={KycScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="Addresses" component={AddressesScreen} />
      <Stack.Screen name="AddressForm" component={AddressFormScreen} />
      <Stack.Screen name="Wallet" component={WalletScreen} />
      <Stack.Screen name="Referral" component={ReferralScreen} />
      <Stack.Screen name="PaymentHistory" component={PaymentHistoryScreen} />
      <Stack.Screen name="SavedMethods" component={SavedMethodsScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="NotificationPrefs" component={NotificationPrefsScreen} />
      <Stack.Screen name="CmsPage" component={CmsPageScreen} />
      <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} />
      <Stack.Screen name="Offers" component={OffersScreen} />
      <Stack.Screen name="Ticket" component={TicketScreen} />
      <Stack.Screen name="NewTicket" component={NewTicketScreen} />
      <Stack.Screen name="Roadside" component={RoadsideScreen} />
      <Stack.Screen name="Faq" component={FaqScreen} />
    </Stack.Navigator>
  );
}
