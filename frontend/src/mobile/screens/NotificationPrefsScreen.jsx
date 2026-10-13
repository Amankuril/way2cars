import { useState } from 'react';
import { View, Switch } from '../rn';
import { useMutation } from '@tanstack/react-query';
import { Smartphone, MessageSquareText, Mail, Megaphone, ShieldCheck } from 'lucide-react';
import { Screen } from '../ui/Layout';
import { T } from '../ui/Text';
import { useToast } from '../ui/Feedback';
import { Card, SectionHeader, IconTile } from '../ui/Surfaces';
import { HeroHeader } from '../ui/Blocks';
import { FadeInView } from '../ui/Motion';
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
const ICON = { push: [Smartphone, 'brand'], sms: [MessageSquareText, 'accent'], email: [Mail, 'success'], promotional: [Megaphone, 'warning'] };
const GROUPS = [['Channels', 'How we reach you about your account', ['push', 'sms', 'email']], ['Marketing', null, ['promotional']]];

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
    <Screen tone="hero">
      <HeroHeader eyebrow="Settings" title="Notification settings" subtitle="Choose how you hear from us." className="pb-7" />
      {GROUPS.map(([group, sub, keys], gi) => {
        const list = rows.filter(([k]) => keys.includes(k));
        return (
          <FadeInView key={group} index={gi} className="mt-6">
            <SectionHeader title={group} subtitle={sub || undefined} />
            <Card className="mx-4">
              {list.map(([k, title, desc], i) => {
                const [Icon, tone] = ICON[k];
                return (
                  <View key={k} className={`min-h-[64px] flex-row items-center px-4 py-3.5 ${i < list.length - 1 ? 'border-b border-line' : ''}`}>
                    <IconTile icon={Icon} tone={tone} size={40} />
                    <View className="ml-3.5 mr-3 flex-1"><T variant="body" className="font-semibold">{title}</T><T variant="caption" tone="subtle" className="mt-0.5">{desc}</T></View>
                    <Switch value={!!prefs[k]} onValueChange={() => toggle(k)} trackColor={{ true: colors.brand[300], false: colors.ink[200] }} thumbColor={prefs[k] ? colors.brand[500] : '#fff'} accessibilityLabel={title} />
                  </View>
                );
              })}
            </Card>
          </FadeInView>
        );
      })}
      <FadeInView index={2} className="mx-4 mt-5 flex-row items-start rounded-xl bg-ink-100 px-3.5 py-3">
        <ShieldCheck size={16} color={colors.ink[600]} strokeWidth={2.2} style={{ marginTop: 1 }} />
        <T variant="caption" tone="muted" className="ml-2 flex-1">Security codes and essential messages are always sent.</T>
      </FadeInView>
    </Screen>
  );
}
