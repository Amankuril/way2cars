import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation from '@react-native-community/geolocation';

/** Current position or null (permission denied / unavailable). */
export async function currentPosition({ timeout = 8000 } = {}) {
  if (Platform.OS === 'android') {
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, {
      title: 'Location', message: 'Allow location to find nearby cars, pin pickup points and share your position with roadside assistance.', buttonPositive: 'Allow',
    });
    if (r !== PermissionsAndroid.RESULTS.GRANTED) return null;
  }
  return new Promise((resolve) => {
    Geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout, maximumAge: 120000 },
    );
  });
}
