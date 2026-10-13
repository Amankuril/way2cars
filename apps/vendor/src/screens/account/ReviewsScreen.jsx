import { useState } from 'react';
import { View, FlatList } from 'react-native';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Star, MessageSquareQuote } from 'lucide-react-native';
import { Screen, Header, T, Button, Field, Sheet, Loading, ErrorState, EmptyState, useToast } from '@shared/native';
import { colors } from '@shared/theme/tokens';
import { dateLong } from '../../lib';
import { api } from '../../api';

export function ReviewsScreen() {
  const qc = useQueryClient();
  const toast = useToast();
  const [replying, setReplying] = useState(null);
  const [text, setText] = useState('');
  const q = useInfiniteQuery({
    queryKey: ['reviews'],
    queryFn: ({ pageParam }) => api.list('/api/v1/vendor/reviews', { page: pageParam, limit: 20 }),
    initialPageParam: 1,
    getNextPageParam: (l) => (l.meta.page < l.meta.pages ? l.meta.page + 1 : undefined),
  });
  const reply = useMutation({
    mutationFn: () => api.post(`/api/v1/vendor/reviews/${replying}/reply`, { text: text.trim() }),
    onSuccess: () => { setReplying(null); setText(''); qc.invalidateQueries({ queryKey: ['reviews'] }); toast('Reply posted', 'success'); },
    onError: (e) => toast(e.message, 'danger'),
  });
  const items = q.data?.pages.flatMap((p) => p.data) || [];
  return (
    <Screen scroll={false} header={<Header title="Reviews" />}>
      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <FlatList data={items} keyExtractor={(r) => r.id} contentContainerClassName="py-2" onEndReached={() => q.hasNextPage && q.fetchNextPage()}
          renderItem={({ item: r }) => (
            <View className="mx-4 mt-2 rounded-lg border border-line bg-surface p-4">
              <View className="flex-row items-center">
                <T variant="label">{r.author || 'Guest'}</T>
                <View className="ml-2 flex-row">{[1, 2, 3, 4, 5].map((s) => <Star key={s} size={12} color={colors.warning[500]} fill={s <= r.hostRating ? colors.warning[500] : 'transparent'} />)}</View>
                <T variant="caption" tone="subtle" className="ml-auto">{dateLong(r.createdAt)}</T>
              </View>
              <T variant="caption" tone="subtle" className="mt-0.5">Car {r.vehicleRating}★ · Host {r.hostRating}★</T>
              {r.comment ? <T variant="bodySm" tone="muted" className="mt-2">{r.comment}</T> : null}
              {r.hostReply?.text ? <View className="mt-3 border-l-2 border-brand-200 pl-3"><T variant="caption" tone="subtle">Your reply</T><T variant="bodySm">{r.hostReply.text}</T></View>
                : <Button title="Reply" variant="ghost" size="sm" className="-ml-3 mt-1 self-start" onPress={() => { setReplying(r.id); setText(''); }} />}
            </View>
          )}
          ListEmptyComponent={<EmptyState icon={MessageSquareQuote} title="No reviews yet" message="Renters can review you after completed trips." />} />
      )}
      <Sheet visible={!!replying} onClose={() => setReplying(null)} title="Reply publicly" footer={<Button title="Post reply" block disabled={text.trim().length < 2} loading={reply.isPending} onPress={() => reply.mutate()} />}>
        <View className="px-5 pb-3"><Field multiline value={text} onChangeText={(t) => setText(t.slice(0, 500))} placeholder="Thank the renter or address their feedback" hint="You can reply once to each review." /></View>
      </Sheet>
    </Screen>
  );
}
