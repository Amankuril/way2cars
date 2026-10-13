import { useEffect, useState } from 'react';
import { View } from './rn';
import { T } from './ui';
import NetInfo from './app/netinfo';

/** Same banner as the native apps' OfflineBanner (no status-bar inset on the web). */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => NetInfo.addEventListener((s) => setOffline(s.isConnected === false)), []);
  if (!offline) return null;
  return (
    <View className="absolute left-0 right-0 top-0 z-40 bg-ink-900 px-4 pb-2 pt-3">
      <T variant="caption" tone="inverse">You’re offline. Showing saved information.</T>
    </View>
  );
}
