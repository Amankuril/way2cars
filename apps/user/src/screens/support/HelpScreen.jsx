import { View, Linking, FlatList } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { Phone, MessageCircle, Mail, LifeBuoy, HelpCircle, Plus, Siren } from 'lucide-react-native';
import { Screen, T, Panel, ListItem, Section, Pill, Button, Loading } from '@shared/native';
import { ago } from '@shared/lib/format';
import { TICKET_STATUS, TICKET_CATEGORY } from '@shared/lib/labels';
import { api } from '../../api';

export function HelpScreen({ navigation }) {
  const contact = useQuery({ queryKey: ['support-contact'], queryFn: () => api.get('/api/v1/user/support/contact'), staleTime: 10 * 60_000 });
  const tickets = useQuery({ queryKey: ['tickets'], queryFn: () => api.get('/api/v1/user/support/tickets', { limit: 20 }) });
  const active = useQuery({ queryKey: ['trips', 'active'], queryFn: () => api.get('/api/v1/user/bookings', { tab: 'active', limit: 1 }) });
  useFocusEffect(useCallback(() => { tickets.refetch(); }, [])); // eslint-disable-line react-hooks/exhaustive-deps
  const c = contact.data || {};
  const ongoing = active.data?.find((b) => b.status === 'ongoing');

  return (
    <Screen edges={['top']} refreshing={tickets.isRefetching} onRefresh={tickets.refetch}>
      <View className="px-4 pt-4"><T variant="title">Help & support</T><T variant="bodySm" tone="muted" className="mt-1">We’re here {c.hours || '24×7'} for anything about your trips.</T></View>

      {ongoing ? (
        <Panel className="mt-4 border-danger-100 bg-danger-50">
          <View className="flex-row items-center">
            <Siren size={22} color="#C6342C" />
            <View className="ml-3 flex-1"><T variant="label">Trouble on the road?</T><T variant="caption" tone="muted">{ongoing.vehicle?.title} · Ref {ongoing.ref}</T></View>
          </View>
          <Button title="Get roadside assistance" variant="danger" block className="mt-3" onPress={() => navigation.navigate('Roadside', { bookingId: ongoing.id })} />
        </Panel>
      ) : null}

      <Section title="Contact us">
        <Panel padded={false}>
          {c.phone ? <ListItem icon={Phone} title="Call support" subtitle={c.phone} onPress={() => Linking.openURL(`tel:${c.phone}`)} /> : null}
          {c.whatsapp ? <ListItem icon={MessageCircle} title="WhatsApp" subtitle={c.whatsapp} onPress={() => Linking.openURL(`https://wa.me/${c.whatsapp.replace(/\D/g, '')}`)} /> : null}
          {c.email ? <ListItem icon={Mail} title="Email" subtitle={c.email} onPress={() => Linking.openURL(`mailto:${c.email}`)} /> : null}
          <ListItem icon={LifeBuoy} title="Emergency" subtitle={`Police / ambulance: ${c.emergencyPhone || '112'}`} onPress={() => Linking.openURL(`tel:${c.emergencyPhone || '112'}`)} />
          <ListItem icon={HelpCircle} title="FAQs" subtitle="Bookings, payments, deposits" last onPress={() => navigation.navigate('Faq')} />
        </Panel>
      </Section>

      <Section title="Your conversations" action={<Button title="New" icon={Plus} variant="ghost" size="sm" onPress={() => navigation.navigate('NewTicket')} />}>
        {tickets.isLoading ? <Loading full={false} /> : tickets.data?.length ? (
          <Panel padded={false}>
            {tickets.data.map((t, i) => (
              <ListItem key={t.id} title={t.subject} subtitle={`${TICKET_CATEGORY[t.category]} · ${ago(t.lastMessageAt || t.createdAt)}`} right={<View className="flex-row items-center">{t.unread ? <View className="mr-2 h-2 w-2 rounded-full bg-brand-500" /> : null}<Pill label={TICKET_STATUS[t.status].label} tone={TICKET_STATUS[t.status].tone} /></View>} last={i === tickets.data.length - 1} onPress={() => navigation.navigate('Ticket', { id: t.id })} />
            ))}
          </Panel>
        ) : <T variant="bodySm" tone="subtle" className="px-4">No conversations yet. Start one if you need help.</T>}
      </Section>
    </Screen>
  );
}
