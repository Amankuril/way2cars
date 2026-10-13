import { useState } from 'react';
import { View, Switch } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { Screen, Header, T, Panel, useToast } from '@shared/native';
import { colors } from '@shared/theme/tokens';
import { api } from '../../api';
import { useAuth } from '../../auth/AuthContext';

const ROWS = [
  ['push', 'Push notifications', 'Booking, payment and trip updates on this phone'],
  ['sms', 'SMS', 'Confirmations and reminders by text'],
  ['email', 'Email', 'Invoices and receipts'],
  ['promotional', 'Offers & news', 'Deals, festival offers and new cities'],
];

export function NotificationPrefsScreen() {
  const { account, setAccount } = useAuth();
  const toast = useToast();
  const [prefs, setPrefs] = useState({ push: true, sms: true, email: true, promotional: true, ...account.notificationPrefs });
  const save = useMutation({
    mutationFn: (next) => api.put('/api/v1/user/me/notification-prefs', next),
    onSuccess: (p) => setAccount({ ...account, notificationPrefs: p }),
    onError: (e) => { toast(e.message, 'danger'); setPrefs(account.notificationPrefs); },
  });
  const toggle = (k) => { const next = { ...prefs, [k]: !prefs[k] }; setPrefs(next); save.mutate(next); };
  return (
    <Screen header={<Header title="Notification settings" />}>
      <Panel padded={false} className="mt-4">
        {ROWS.map(([k, title, sub], i) => (
          <View key={k} className={`flex-row items-center px-4 py-3.5 ${i < ROWS.length - 1 ? 'border-b border-line' : ''}`}>
            <View className="mr-3 flex-1"><T variant="body" className="font-semibold">{title}</T><T variant="caption" tone="subtle">{sub}</T></View>
            <Switch value={!!prefs[k]} onValueChange={() => toggle(k)} trackColor={{ true: colors.brand[300], false: colors.ink[200] }} thumbColor={prefs[k] ? colors.brand[500] : '#fff'} accessibilityLabel={title} />
          </View>
        ))}
      </Panel>
      <T variant="caption" tone="subtle" className="mx-4 mt-3">Security codes and essential trip messages are always sent.</T>
    </Screen>
  );
}
