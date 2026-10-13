import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { LayoutDashboard, CalendarClock, CarFront, Wallet, UserRound } from 'lucide-react-native';
import { colors } from '@shared/theme/tokens';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { BookingsScreen } from '../screens/bookings/BookingsScreen';
import { FleetScreen } from '../screens/fleet/FleetScreen';
import { EarningsScreen } from '../screens/earnings/EarningsScreen';
import { AccountScreen } from '../screens/account/AccountScreen';

const Tab = createBottomTabNavigator();
const icon = (Icon) => ({ color, focused }) => <Icon size={22} color={color} strokeWidth={focused ? 2.4 : 2} />;

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand[600],
        tabBarInactiveTintColor: colors.ink[500],
        tabBarStyle: { height: 62, paddingTop: 6, paddingBottom: 8, borderTopColor: colors.line, backgroundColor: colors.surface },
        tabBarLabelStyle: { fontFamily: 'Manrope', fontWeight: '600', fontSize: 11 },
      }}
    >
      <Tab.Screen name="Today" component={DashboardScreen} options={{ tabBarIcon: icon(LayoutDashboard) }} />
      <Tab.Screen name="Bookings" component={BookingsScreen} options={{ tabBarIcon: icon(CalendarClock) }} />
      <Tab.Screen name="Fleet" component={FleetScreen} options={{ tabBarIcon: icon(CarFront) }} />
      <Tab.Screen name="Earnings" component={EarningsScreen} options={{ tabBarIcon: icon(Wallet) }} />
      <Tab.Screen name="Account" component={AccountScreen} options={{ tabBarIcon: icon(UserRound) }} />
    </Tab.Navigator>
  );
}
