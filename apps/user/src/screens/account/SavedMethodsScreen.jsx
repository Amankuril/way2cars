import { useState } from 'react';
import { View, FlatList } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Smartphone, Trash2 } from 'lucide-react-native';
import { Screen, Header, T, Loading, ErrorState, EmptyState, IconButton, Confirm, useToast } from '@shared/native';
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
  return (
    <Screen scroll={false} header={<Header title="Saved payment methods" />}>
      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <FlatList
          data={q.data}
          keyExtractor={(t) => t.id}
          contentContainerClassName="pt-2"
          ListHeaderComponent={<T variant="caption" tone="subtle" className="mx-4 mb-2 mt-2">Cards and UPI IDs are saved securely by Razorpay when you choose “save” at checkout. WAY2CARS never stores card numbers.</T>}
          renderItem={({ item: t }) => (
            <View className="mx-4 mt-2 flex-row items-center rounded-lg border border-line bg-surface p-4">
              {t.card ? <CreditCard size={22} color={colors.ink[600]} /> : <Smartphone size={22} color={colors.ink[600]} />}
              <View className="ml-3 flex-1">
                <T variant="label">{t.card ? `${t.card.network} •••• ${t.card.last4}` : `${t.vpa?.username}@${t.vpa?.handle}`}</T>
                <T variant="caption" tone="subtle">{t.card ? `${t.card.issuer || ''} ${t.card.type || ''} · exp ${t.card.expiryMonth}/${t.card.expiryYear}` : 'UPI'}</T>
              </View>
              <IconButton icon={Trash2} label="Remove" onPress={() => setRemoving(t.id)} />
            </View>
          )}
          ListEmptyComponent={<EmptyState icon={CreditCard} title="Nothing saved" message="Choose “save this card” in Razorpay checkout to pay faster next time." />}
        />
      )}
      <Confirm visible={!!removing} title="Remove this payment method?" confirmLabel="Remove" tone="danger" loading={del.isPending} onCancel={() => setRemoving(null)} onConfirm={() => del.mutate(removing)} />
    </Screen>
  );
}
