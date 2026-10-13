import { useState } from 'react';
import { View, Switch } from '../rn';
import { useMutation } from '@tanstack/react-query';
import { Screen, Header, Panel } from '../ui/Layout';
import { T } from '../ui/Text';
import { useToast } from '../ui/Feedback';
import { colors } from '@shared/theme/tokens';
import { useApp } from '../app/AppContext';

const ROWS = {
  user: [
    ['push', 'Push notifications', 'Booking, payment and trip updates on this phone'],
    ['sms', 'SMS', 'Confirmations and reminders by text'],
    ['email', 'Email', 'Invoices and receipts'],
    ['promotional', 'Offers & news', 'Deals, festival offers and new cities'],
  ],
  vendor: [
    ['push', 'Push notifications', 'Booking requests, returns and payouts'],
    ['sms', 'SMS', 'New booking requests by text'],
    ['email', 'Email', 'Payout receipts and account updates'],
    ['promotional', 'Host tips & news', 'Product updates and earning tips'],
  ],
};

export function NotificationPrefsScreen() {
  const { api, realm, auth } = useApp();
  const toast = useToast();
  const [prefs, setPrefs] = useState({ push: true, sms: true, email: true, promotional: true, ...auth.account?.notificationPrefs });
  const save = useMutation({
    mutationFn: (next) => api.put(`/api/v1/${realm}/me/notification-prefs`, next),
    onSuccess: (p) => auth.setAccount({ ...auth.account, notificationPrefs: p }),
    onError: (e) => { toast(e.message, 'danger'); setPrefs(auth.account.notificationPrefs); },
  });
  const toggle = (k) => { const next = { ...prefs, [k]: !prefs[k] }; setPrefs(next); save.mutate(next); };
  const rows = ROWS[realm];
  return (
    <Screen header={<Header title="Notification settings" />}>
      <Panel padded={false} className="mt-4">
        {rows.map(([k, title, sub], i) => (
          <View key={k} className={`flex-row items-center px-4 py-3.5 ${i < rows.length - 1 ? 'border-b border-line' : ''}`}>
            <View className="mr-3 flex-1"><T variant="body" className="font-semibold">{title}</T><T variant="caption" tone="subtle">{sub}</T></View>
            <Switch value={!!prefs[k]} onValueChange={() => toggle(k)} trackColor={{ true: colors.brand[300], false: colors.ink[200] }} thumbColor={prefs[k] ? colors.brand[500] : '#fff'} accessibilityLabel={title} />
          </View>
        ))}
      </Panel>
      <T variant="caption" tone="subtle" className="mx-4 mt-3">Security codes and essential messages are always sent.</T>
    </Screen>
  );
}
