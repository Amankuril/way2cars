import { View, Linking } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { Phone, MessageCircle, Mail, LifeBuoy, HelpCircle, Plus, Siren, CalendarClock, CreditCard, RotateCcw, Car, ShieldAlert, UserRound, ShieldCheck, Banknote, MessagesSquare } from 'lucide-react-native';
import { Screen, T, Card, ListItem, SectionHeader, HeroHeader, ActionTile, IconTile, Pill, Button, FadeInView, PressableScale, SkeletonRow, EmptyState, ErrorState, cn } from '@shared/native';
import { shadows } from '@shared/theme/tokens';
import { ago } from '@shared/lib/format';
import { TICKET_STATUS, TICKET_CATEGORY } from '@shared/lib/labels';
import { api } from '../../api';

const CATEGORY_ICON = { booking: CalendarClock, payment: CreditCard, refund: RotateCcw, vehicle_issue: Car, damage_dispute: ShieldAlert, account: UserRound, kyc: ShieldCheck, payout: Banknote, roadside: Siren, other: MessageCircle };
const STATUS_TILE = { open: 'brand', in_progress: 'accent', awaiting_customer: 'warning', resolved: 'success', closed: 'neutral' };

function TicketRow({ t, index, onPress }) {
  const st = TICKET_STATUS[t.status] || TICKET_STATUS.open;
  return (
    <FadeInView index={index} className="mx-4 mb-3">
      <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={`${t.subject}, ${st.label}${t.unread ? ', new reply' : ''}`} className="flex-row rounded-2xl bg-surface p-4" style={{ boxShadow: shadows.card }}>
        <View>
          <IconTile icon={CATEGORY_ICON[t.category] || MessageCircle} tone={STATUS_TILE[t.status] || 'brand'} size={42} />
          {t.unread ? <View className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-brand-500" /> : null}
        </View>
        <View className="ml-3.5 flex-1">
          <View className="flex-row items-start">
            <T variant="label" numberOfLines={2} className={cn('flex-1 pr-2 text-[14px]', t.unread && 'font-extrabold')}>{t.subject}</T>
            <T variant="caption" tone={t.unread ? 'brand' : 'subtle'} className={cn(t.unread && 'font-bold')}>{ago(t.lastMessageAt || t.createdAt)}</T>
          </View>
          <T variant="caption" tone="subtle" className="mt-0.5">{TICKET_CATEGORY[t.category]}{t.ref ? ` · #${t.ref}` : ''}</T>
          <View className="mt-2.5 flex-row items-center">
            <Pill label={st.label} tone={st.tone} />
            {t.unread ? <T variant="caption" tone="brand" className="ml-2 font-bold">New reply</T> : null}
          </View>
        </View>
      </PressableScale>
    </FadeInView>
  );
}

export function HelpScreen({ navigation }) {
  const contact = useQuery({ queryKey: ['support-contact'], queryFn: () => api.get('/api/v1/user/support/contact'), staleTime: 10 * 60_000 });
  const tickets = useQuery({ queryKey: ['tickets'], queryFn: () => api.get('/api/v1/user/support/tickets', { limit: 20 }) });
  const active = useQuery({ queryKey: ['trips', 'active'], queryFn: () => api.get('/api/v1/user/bookings', { tab: 'active', limit: 1 }) });
  useFocusEffect(useCallback(() => { tickets.refetch(); }, [])); // eslint-disable-line react-hooks/exhaustive-deps
  const c = contact.data || {};
  const ongoing = active.data?.find((b) => b.status === 'ongoing');
  const newTicket = () => navigation.navigate('NewTicket');

  return (
    <Screen tone="hero" edges={['top']} refreshing={tickets.isRefetching} onRefresh={tickets.refetch}>
      <HeroHeader back={false} eyebrow="Help & support" title="How can we help?" subtitle={`We’re here ${c.hours || '24×7'} for anything about your trips.`} className="pb-16" />

      <FadeInView style={{ marginTop: -44 }} className="flex-row px-3">
        {c.phone ? <View className="flex-1 px-1"><ActionTile icon={Phone} label="Call support" caption={c.hours || '24×7'} onPress={() => Linking.openURL(`tel:${c.phone}`)} /></View> : null}
        <View className="flex-1 px-1"><ActionTile icon={HelpCircle} tone="accent" label="FAQs" caption="Quick answers" onPress={() => navigation.navigate('Faq')} /></View>
        <View className="flex-1 px-1"><ActionTile icon={MessagesSquare} tone="success" label="New conversation" onPress={newTicket} /></View>
      </FadeInView>

      {ongoing ? (
        <FadeInView index={1} className="mx-4 mt-5">
          <Card className="border border-danger-100 p-4">
            <View className="flex-row items-center">
              <IconTile icon={Siren} tone="danger" size={44} />
              <View className="ml-3 flex-1"><T variant="label" className="text-[15px]">Trouble on the road?</T><T variant="caption" tone="muted" className="mt-0.5" numberOfLines={1}>{ongoing.vehicle?.title} · Ref {ongoing.ref}</T></View>
            </View>
            <Button title="Get roadside assistance" variant="danger" block className="mt-3" onPress={() => navigation.navigate('Roadside', { bookingId: ongoing.id })} />
          </Card>
        </FadeInView>
      ) : null}

      <View className="mt-7">
        <SectionHeader title="Your conversations" subtitle={tickets.data?.length ? 'Replies from our team show up here' : undefined} actionLabel="New" onAction={newTicket} />
        {tickets.isLoading ? (
          <Card className="mx-4">{[0, 1, 2].map((i) => <SkeletonRow key={i} />)}</Card>
        ) : tickets.error ? (
          <ErrorState error={tickets.error} onRetry={tickets.refetch} />
        ) : tickets.data?.length ? (
          tickets.data.map((t, i) => <TicketRow key={t.id} t={t} index={i} onPress={() => navigation.navigate('Ticket', { id: t.id })} />)
        ) : (
          <Card className="mx-4">
            <EmptyState className="px-6 py-8" icon={MessageCircle} title="No conversations yet" message="Start one if you need help." action={<Button title="Start a conversation" icon={Plus} variant="tonal" onPress={newTicket} />} />
          </Card>
        )}
      </View>

      <View className="mt-7">
        <SectionHeader title="Contact us" />
        <FadeInView index={2}>
          <Card className="mx-4 overflow-hidden">
            {c.phone ? <ListItem icon={Phone} title="Call support" subtitle={c.phone} onPress={() => Linking.openURL(`tel:${c.phone}`)} /> : null}
            {c.whatsapp ? <ListItem icon={MessageCircle} iconTone="success" title="WhatsApp" subtitle={c.whatsapp} onPress={() => Linking.openURL(`https://wa.me/${c.whatsapp.replace(/\D/g, '')}`)} /> : null}
            {c.email ? <ListItem icon={Mail} iconTone="accent" title="Email" subtitle={c.email} onPress={() => Linking.openURL(`mailto:${c.email}`)} /> : null}
            <ListItem icon={LifeBuoy} iconTone="danger" title="Emergency" subtitle={`Police / ambulance: ${c.emergencyPhone || '112'}`} onPress={() => Linking.openURL(`tel:${c.emergencyPhone || '112'}`)} />
            <ListItem icon={HelpCircle} iconTone="neutral" title="FAQs" subtitle="Bookings, payments, deposits" last onPress={() => navigation.navigate('Faq')} />
          </Card>
        </FadeInView>
      </View>
    </Screen>
  );
}
