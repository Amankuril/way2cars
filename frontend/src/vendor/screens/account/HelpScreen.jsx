import { View, Linking } from '@/mobile/rn';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from '@/mobile/nav';
import { useCallback } from 'react';
import { Phone, MessageCircle, Mail, HelpCircle, Plus } from 'lucide-react';
import { Screen, Header, T, Panel, ListItem, Section, Pill, Button, Loading } from '@/mobile/ui';
import { TICKET_STATUS, TICKET_CATEGORY } from '@shared/lib/labels';
import { ago } from '../../lib';
import { api } from '../../api';

export function HelpScreen({ navigation }) {
  const contact = useQuery({ queryKey: ['support-contact'], queryFn: () => api.get('/api/v1/vendor/support/contact'), staleTime: 10 * 60_000 });
  const tickets = useQuery({ queryKey: ['tickets'], queryFn: () => api.get('/api/v1/vendor/support/tickets', { limit: 20 }) });
  useFocusEffect(useCallback(() => { tickets.refetch(); }, [])); // eslint-disable-line react-hooks/exhaustive-deps
  const c = contact.data || {};
  return (
    <Screen header={<Header title="Help & support" />} refreshing={tickets.isRefetching} onRefresh={tickets.refetch}>
      <Section title="Contact us" first>
        <Panel padded={false}>
          {c.phone ? <ListItem icon={Phone} title="Call host support" subtitle={c.phone} onPress={() => Linking.openURL(`tel:${c.phone}`)} /> : null}
          {c.whatsapp ? <ListItem icon={MessageCircle} title="WhatsApp" subtitle={c.whatsapp} onPress={() => Linking.openURL(`https://wa.me/${c.whatsapp.replace(/\D/g, '')}`)} /> : null}
          {c.email ? <ListItem icon={Mail} title="Email" subtitle={c.email} onPress={() => Linking.openURL(`mailto:${c.email}`)} /> : null}
          <ListItem icon={HelpCircle} title="Host FAQs" last onPress={() => navigation.navigate('Faq')} />
        </Panel>
      </Section>
      <Section title="Your conversations" action={<Button title="New" icon={Plus} variant="ghost" size="sm" onPress={() => navigation.navigate('NewTicket')} />}>
        {tickets.isLoading ? <Loading full={false} /> : tickets.data?.length ? (
          <Panel padded={false}>
            {tickets.data.map((t, i) => <ListItem key={t.id} title={t.subject} subtitle={`${TICKET_CATEGORY[t.category]} · ${ago(t.lastMessageAt || t.createdAt)}`} right={<Pill label={TICKET_STATUS[t.status].label} tone={TICKET_STATUS[t.status].tone} />} last={i === tickets.data.length - 1} onPress={() => navigation.navigate('Ticket', { id: t.id })} />)}
          </Panel>
        ) : <T variant="bodySm" tone="subtle" className="px-4">No conversations yet.</T>}
      </Section>
    </Screen>
  );
}
