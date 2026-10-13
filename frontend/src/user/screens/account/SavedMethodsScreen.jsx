import { useState } from 'react';
import { View, FlatList } from '@/mobile/rn';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Smartphone, Trash2, LockKeyhole } from 'lucide-react';
import { Screen, Header, T, ErrorState, EmptyState, IconButton, Confirm, Card, IconTile, FadeInView, SkeletonRow, useToast } from '@/mobile/ui';
import { colors } from '@shared/theme/tokens';
import { api } from '../../api';

export function SavedMethodsScreen() {
  const qc = useQueryClient();
  const toast = useToast();
  const [removing, setRemoving] = useState(null);
  const q = useQuery({ queryKey: ['saved-methods'], queryFn: () => api.get('/api/v1/user/me/payment-methods') });
  const del = useMutation({
    mutationFn: (tokenId) => api.del(`/api/v1/user/me/payment-methods/${tokenId}`),
    onSuccess: () => { setRemoving(null); qc.invalidateQueries({ queryKey: ['saved-methods'] }); toast('Removed'); },
    onError: (e) => toast(e.message, 'danger'),
  });
  const intro = (
    <View className="mx-4 mb-4 mt-3 flex-row items-start rounded-2xl bg-brand-50 p-3.5">
      <LockKeyhole size={18} color={colors.brand[600]} strokeWidth={2.2} />
      <T variant="caption" tone="muted" className="ml-2.5 flex-1">Cards and UPI IDs are saved securely by Razorpay when you choose “save” at checkout. WAY2CARS never stores card numbers.</T>
    </View>
  );
  return (
    <Screen scroll={false} header={<Header title="Saved payment methods" />}>
      {q.isLoading ? (
        <View>{intro}{[0, 1].map((i) => <Card key={i} className="mx-4 mb-3 py-1"><SkeletonRow /></Card>)}</View>
      ) : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <FlatList
          data={q.data}
          keyExtractor={(t) => t.id}
          contentContainerClassName="pb-8"
          ListHeaderComponent={intro}
          renderItem={({ item: t, index }) => (
            <FadeInView index={index} className="mx-4 mb-3">
              <Card className="flex-row items-center py-3 pl-3.5 pr-1.5">
                <IconTile icon={t.card ? CreditCard : Smartphone} tone={t.card ? 'brand' : 'accent'} size={42} />
                <View className="ml-3 flex-1">
                  <T variant="label">{t.card ? `${t.card.network} •••• ${t.card.last4}` : `${t.vpa?.username}@${t.vpa?.handle}`}</T>
                  <T variant="caption" tone="subtle" className="mt-0.5">{t.card ? `${t.card.issuer || ''} ${t.card.type || ''} · exp ${t.card.expiryMonth}/${t.card.expiryYear}` : 'UPI'}</T>
                </View>
                <IconButton icon={Trash2} label="Remove" size={20} onPress={() => setRemoving(t.id)} />
              </Card>
            </FadeInView>
          )}
          ListEmptyComponent={<EmptyState icon={CreditCard} title="Nothing saved" message="Choose “save this card” in Razorpay checkout to pay faster next time." />}
        />
      )}
      <Confirm visible={!!removing} title="Remove this payment method?" confirmLabel="Remove" tone="danger" loading={del.isPending} onCancel={() => setRemoving(null)} onConfirm={() => del.mutate(removing)} />
    </Screen>
  );
}
