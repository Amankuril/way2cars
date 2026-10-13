import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Loading } from '@shared/native';
import { PhoneScreen, OtpScreen, CmsPageScreen, FaqScreen, NotificationsScreen, NotificationPrefsScreen, TicketScreen, NewTicketScreen } from '@shared/native/screens';
import { useAuth } from '../auth/AuthContext';
import { MainTabs } from './MainTabs';
import { OnboardingScreen } from '../screens/onboarding/OnboardingScreen';
import { ProfileStepScreen } from '../screens/onboarding/ProfileStepScreen';
import { BusinessStepScreen } from '../screens/onboarding/BusinessStepScreen';
import { KycStepScreen } from '../screens/onboarding/KycStepScreen';
import { BankStepScreen } from '../screens/onboarding/BankStepScreen';
import { BookingDetailScreen } from '../screens/bookings/BookingDetailScreen';
import { DamageClaimScreen } from '../screens/bookings/DamageClaimScreen';
import { VehicleFormScreen } from '../screens/fleet/VehicleFormScreen';
import { VehicleDetailScreen } from '../screens/fleet/VehicleDetailScreen';
import { VehiclePhotosScreen } from '../screens/fleet/VehiclePhotosScreen';
import { VehicleDocumentsScreen } from '../screens/fleet/VehicleDocumentsScreen';
import { CalendarScreen } from '../screens/fleet/CalendarScreen';
import { PricingCalendarScreen } from '../screens/fleet/PricingCalendarScreen';
import { PayoutsScreen } from '../screens/earnings/PayoutsScreen';
import { LedgerScreen } from '../screens/earnings/LedgerScreen';
import { ReviewsScreen } from '../screens/account/ReviewsScreen';
import { HelpScreen } from '../screens/account/HelpScreen';

const Stack = createNativeStackNavigator();
const opts = { headerShown: false, animation: 'slide_from_right' };

const common = (
  <>
    <Stack.Screen name="CmsPage" component={CmsPageScreen} />
    <Stack.Screen name="Faq" component={FaqScreen} />
    <Stack.Screen name="Help" component={HelpScreen} />
    <Stack.Screen name="Ticket" component={TicketScreen} />
    <Stack.Screen name="NewTicket" component={NewTicketScreen} />
    <Stack.Screen name="Notifications" component={NotificationsScreen} />
  </>
);

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
  const onboarding = ['onboarding', 'rejected'].includes(account?.status);
  return (
    <Stack.Navigator screenOptions={opts}>
      {onboarding ? <Stack.Screen name="Onboarding" component={OnboardingScreen} /> : <Stack.Screen name="Main" component={MainTabs} />}
      <Stack.Screen name="ProfileStep" component={ProfileStepScreen} />
      <Stack.Screen name="BusinessStep" component={BusinessStepScreen} />
      <Stack.Screen name="KycStep" component={KycStepScreen} />
      <Stack.Screen name="BankStep" component={BankStepScreen} />
      {common}
      {!onboarding ? (
        <>
          <Stack.Screen name="Booking" component={BookingDetailScreen} />
          <Stack.Screen name="DamageClaim" component={DamageClaimScreen} />
          <Stack.Screen name="VehicleForm" component={VehicleFormScreen} />
          <Stack.Screen name="Vehicle" component={VehicleDetailScreen} />
          <Stack.Screen name="VehiclePhotos" component={VehiclePhotosScreen} />
          <Stack.Screen name="VehicleDocuments" component={VehicleDocumentsScreen} />
          <Stack.Screen name="Calendar" component={CalendarScreen} />
          <Stack.Screen name="PricingCalendar" component={PricingCalendarScreen} />
          <Stack.Screen name="Payouts" component={PayoutsScreen} />
          <Stack.Screen name="Ledger" component={LedgerScreen} />
          <Stack.Screen name="Reviews" component={ReviewsScreen} />
          <Stack.Screen name="NotificationPrefs" component={NotificationPrefsScreen} />
        </>
      ) : null}
    </Stack.Navigator>
  );
}
