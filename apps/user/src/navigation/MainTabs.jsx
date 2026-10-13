import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Compass, CalendarClock, LifeBuoy, UserRound } from 'lucide-react-native';
import { colors } from '@shared/theme/tokens';
import { NavTabBar } from '@shared/native';
import { HomeScreen } from '../screens/home/HomeScreen';
import { TripsScreen } from '../screens/trips/TripsScreen';
import { HelpScreen } from '../screens/support/HelpScreen';
import { AccountScreen } from '../screens/account/AccountScreen';

const Tab = createBottomTabNavigator();
const icon = (Icon) => ({ color, focused }) => <Icon size={22} color={color} strokeWidth={focused ? 2.4 : 2} />;

export function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <NavTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand[600],
        tabBarInactiveTintColor: colors.ink[500],
        tabBarStyle: { height: 62, paddingTop: 6, paddingBottom: 8, borderTopColor: colors.line, backgroundColor: colors.surface },
        tabBarLabelStyle: { fontFamily: 'Manrope', fontWeight: '600', fontSize: 11 },
      }}
    >
      <Tab.Screen name="Explore" component={HomeScreen} options={{ tabBarIcon: icon(Compass) }} />
      <Tab.Screen name="Trips" component={TripsScreen} options={{ tabBarIcon: icon(CalendarClock) }} />
      <Tab.Screen name="Help" component={HelpScreen} options={{ tabBarIcon: icon(LifeBuoy) }} />
      <Tab.Screen name="Account" component={AccountScreen} options={{ tabBarIcon: icon(UserRound) }} />
    </Tab.Navigator>
  );
}
