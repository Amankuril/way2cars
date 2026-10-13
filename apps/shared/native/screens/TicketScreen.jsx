import { useRef, useState } from 'react';
import { View, FlatList, TextInput, KeyboardAvoidingView } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Send } from 'lucide-react-native';
import { Header } from '../Layout';
import { T } from '../Text';
import { IconButton } from '../Button';
import { Loading, ErrorState, Pill } from '../Feedback';
import { cn } from '../cn';
import { colors } from '../../theme/tokens';
import { dateTime } from '../../lib/format';
import { TICKET_STATUS } from '../../lib/labels';
import { useApp } from '../app/AppContext';

/** Conversation with support. Polls every 10s while open. */
export function TicketScreen({ route }) {
  const { id } = route.params;
  const { api, realm } = useApp();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const list = useRef(null);
  const path = `/api/v1/${realm}/support/tickets/${id}`;
  const q = useQuery({ queryKey: ['ticket', id], queryFn: () => api.get(path), refetchInterval: 10_000 });
  const send = useMutation({
    mutationFn: () => api.post(`${path}/messages`, { body: text.trim() }),
    onSuccess: (t) => { setText(''); qc.setQueryData(['ticket', id], t); qc.invalidateQueries({ queryKey: ['tickets'] }); },
  });
  const t = q.data;
  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-canvas">
      <Header title={t?.subject || 'Support'} subtitle={t ? `Ticket ${t.ref}` : undefined} right={t ? <Pill label={TICKET_STATUS[t.status].label} tone={TICKET_STATUS[t.status].tone} /> : null} />
      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <KeyboardAvoidingView className="flex-1">
          <FlatList
            ref={list}
            data={t.messages}
            keyExtractor={(m) => m.id}
            contentContainerClassName="p-4"
            onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
            renderItem={({ item: m }) => {
              const mine = m.from.realm === realm;
              return (
                <View className={cn('mb-3 max-w-[85%]', mine ? 'self-end' : 'self-start')}>
                  <View className={cn('rounded-lg px-3.5 py-2.5', mine ? 'bg-brand-500' : 'border border-line bg-surface')}>
                    <T variant="bodySm" tone={mine ? 'inverse' : 'default'}>{m.body}</T>
                  </View>
                  <T variant="caption" tone="subtle" className={cn('mt-1', mine && 'text-right')}>{mine ? 'You' : m.from.name} · {dateTime(m.createdAt)}</T>
                </View>
              );
            }}
          />
          {t.status !== 'closed' ? (
            <View className="flex-row items-end border-t border-line bg-surface px-3 py-2">
              <TextInput value={text} onChangeText={setText} placeholder="Write a message" placeholderTextColor={colors.ink[400]} multiline className="max-h-28 flex-1 py-2.5 font-sans text-body text-ink-900" />
              <IconButton icon={Send} tone="brand" label="Send" disabled={!text.trim() || send.isPending} onPress={() => send.mutate()} />
            </View>
          ) : <T variant="caption" tone="subtle" className="p-4 text-center">This conversation is closed.</T>}
          {send.error ? <T variant="caption" tone="danger" className="px-4 pb-2">{send.error.message}</T> : null}
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
