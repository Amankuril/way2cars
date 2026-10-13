import { useRef, useState } from 'react';
import { View, FlatList, TextInput, ActivityIndicator } from '../rn';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, Lock, Headset, CalendarClock, CreditCard, RotateCcw, Car, ShieldAlert, UserRound, ShieldCheck, Banknote, Siren, MessageCircle } from 'lucide-react';
import { Screen } from '../ui/Layout';
import { T } from '../ui/Text';
import { ErrorState, Pill, Skeleton } from '../ui/Feedback';
import { Card, IconTile } from '../ui/Surfaces';
import { HeroHeader } from '../ui/Blocks';
import { FadeInView, PressableScale } from '../ui/Motion';
import { cn } from '../ui/cn';
import { colors, shadows } from '@shared/theme/tokens';
import { dateLong, dayLabel, timeLabel } from '@shared/lib/format';
import { TICKET_STATUS, TICKET_CATEGORY } from '@shared/lib/labels';
import { useApp } from '../app/AppContext';

const CATEGORY_ICON = { booking: CalendarClock, payment: CreditCard, refund: RotateCcw, vehicle_issue: Car, damage_dispute: ShieldAlert, account: UserRound, kyc: ShieldCheck, payout: Banknote, roadside: Siren, other: MessageCircle };

function ThreadSkeleton() {
  return (
    <View className="flex-1 p-4">
      <Skeleton className="h-[76px] w-full rounded-2xl" />
      <Skeleton className="mt-6 h-16 w-3/4 rounded-2xl" />
      <Skeleton className="mt-4 h-12 w-2/3 self-end rounded-2xl" />
      <Skeleton className="mt-4 h-20 w-3/4 rounded-2xl" />
    </View>
  );
}

function DayChip({ label }) {
  return (
    <View className="my-3 items-center">
      <View className="rounded-full bg-ink-100 px-3 py-1"><T variant="caption" className="font-semibold text-ink-600">{label}</T></View>
    </View>
  );
}

function Bubble({ m, mine, showName }) {
  return (
    <FadeInView style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%' }} className="mb-3">
      {!mine && showName ? (
        <View className="mb-1 ml-1 flex-row items-center">
          <Headset size={12} color={colors.brand[600]} strokeWidth={2.4} />
          <T variant="caption" className="ml-1 font-bold text-brand-700">{m.from.name}</T>
        </View>
      ) : null}
      <View
        className={cn('rounded-[20px] px-4 py-2.5', mine ? 'rounded-br-[6px] bg-brand-500' : 'rounded-bl-[6px] bg-surface')}
        style={{ boxShadow: mine ? shadows.brand : shadows.card }}
      >
        <T variant="bodySm" tone={mine ? 'inverse' : 'default'} className="leading-[21px]">{m.body}</T>
      </View>
      <T variant="caption" tone="subtle" className={cn('mt-1 px-1 text-[11px]', mine && 'text-right')}>{mine ? 'You' : m.from.name} · {timeLabel(m.createdAt)}</T>
    </FadeInView>
  );
}

/** Conversation with support. Polls every 10s while open. */
export function TicketScreen({ route }) {
  const { id } = route.params;
  const { api, realm } = useApp();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const list = useRef(null);
  const path = `/api/v1/${realm}/support/tickets/${id}`;
  const q = useQuery({ queryKey: ['ticket', id], queryFn: () => api.get(path), refetchInterval: 10_000 });
  const send = useMutation({
    mutationFn: () => api.post(`${path}/messages`, { body: text.trim() }),
    onSuccess: (t) => { setText(''); qc.setQueryData(['ticket', id], t); qc.invalidateQueries({ queryKey: ['tickets'] }); },
  });
  const t = q.data;
  const st = t ? TICKET_STATUS[t.status] : null;
  const canSend = !!text.trim() && !send.isPending;

  const rows = [];
  if (t) {
    let lastDay = null;
    t.messages.forEach((m, i) => {
      const day = dayLabel(m.createdAt);
      if (day !== lastDay) { rows.push({ key: `d-${day}`, day }); lastDay = day; }
      const prev = t.messages[i - 1];
      rows.push({ key: m.id, m, mine: m.from.realm === realm, showName: !prev || prev.from.realm !== m.from.realm || dayLabel(prev.createdAt) !== day });
    });
  }

  const footer = t ? (
    <View>
      {t.status !== 'closed' ? (
        <View className="flex-row items-end">
          <View className={cn('mr-2.5 min-h-[46px] flex-1 justify-center rounded-[23px] border px-4', focused ? 'border-brand-300 bg-surface' : 'border-transparent bg-ink-100')}>
            <TextInput value={text} onChangeText={setText} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} placeholder="Write a message" placeholderTextColor={colors.ink[400]} multiline accessibilityLabel="Write a message" className="max-h-28 py-2.5 font-sans text-body text-ink-900" />
          </View>
          <PressableScale
            onPress={() => send.mutate()}
            disabled={!canSend}
            scaleTo={0.88}
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityState={{ disabled: !canSend, busy: send.isPending }}
            className={cn('h-[46px] w-[46px] items-center justify-center rounded-full', canSend || send.isPending ? 'bg-brand-500' : 'bg-ink-200')}
            style={canSend ? { boxShadow: shadows.brand } : undefined}
          >
            {send.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Send size={19} color={canSend ? '#fff' : colors.ink[500]} strokeWidth={2.2} style={{ marginLeft: -2 }} />}
          </PressableScale>
        </View>
      ) : (
        <View className="min-h-[46px] flex-row items-center justify-center">
          <Lock size={15} color={colors.ink[500]} strokeWidth={2.2} />
          <T variant="bodySm" tone="subtle" className="ml-2">This conversation is closed.</T>
        </View>
      )}
      {send.error ? <T variant="caption" tone="danger" className="mt-2 px-1">{send.error.message}</T> : null}
    </View>
  ) : null;

  return (
    <Screen tone="hero" scroll={false} footer={footer}>
      <HeroHeader compact rounded={false} title={t?.subject || 'Support'} subtitle={t ? `Ticket ${t.ref}` : undefined} right={st ? <Pill label={st.label} tone={st.tone} className="ml-2" /> : null} className="pb-2" />
      {q.isLoading ? <ThreadSkeleton /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <FlatList
          ref={list}
          data={rows}
          keyExtractor={(r) => r.key}
          contentContainerClassName="p-4"
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          ListHeaderComponent={(
            <Card className="mb-2 flex-row items-center p-3.5">
              <IconTile icon={CATEGORY_ICON[t.category] || MessageCircle} tone="brand" size={40} />
              <View className="ml-3 flex-1">
                <T variant="label">{TICKET_CATEGORY[t.category] || 'Support'}</T>
                <T variant="caption" tone="subtle" className="mt-0.5">#{t.ref} · Opened {dateLong(t.createdAt)}</T>
              </View>
            </Card>
          )}
          renderItem={({ item: r }) => (r.day ? <DayChip label={r.day} /> : <Bubble m={r.m} mine={r.mine} showName={r.showName} />)}
        />
      )}
    </Screen>
  );
}
