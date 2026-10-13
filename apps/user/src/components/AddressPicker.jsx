import { useEffect, useRef, useState } from 'react';
import { View, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Home, Search } from 'lucide-react-native';
import { Sheet, T, Field } from '@shared/native';
import { colors } from '@shared/theme/tokens';
import { api } from '../api';

const sessionId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => ((Math.random() * 16) | (c === 'x' ? 0 : 8)).toString(16).replace(/^([89ab])?/, (m) => m));

/**
 * Lets the renter pick a saved address or search a new one (Google Places via our backend, with a
 * billing session token). Resolves { address, lat, lng, placeId }.
 */
export function AddressPicker({ visible, onClose, onSelect }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [resolving, setResolving] = useState(null);
  const [error, setError] = useState(null);
  const token = useRef(sessionId());
  const saved = useQuery({ queryKey: ['me'], queryFn: () => api.get('/api/v1/user/me'), enabled: visible });

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => { if (visible) { setQ(''); setError(null); token.current = sessionId(); } }, [visible]);

  const results = useQuery({
    queryKey: ['places', debounced],
    queryFn: () => api.get('/api/v1/user/maps/autocomplete', { q: debounced, sessionToken: token.current }),
    enabled: visible && debounced.length >= 3,
    staleTime: 5 * 60_000,
  });

  const choosePlace = async (p) => {
    setResolving(p.placeId);
    setError(null);
    try {
      const d = await api.get(`/api/v1/user/maps/place/${p.placeId}`, { sessionToken: token.current });
      onSelect({ address: d.address || p.description, lat: d.lat, lng: d.lng, placeId: d.placeId });
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setResolving(null);
    }
  };

  const savedWithLocation = (saved.data?.addresses || []).filter((a) => a.location);
  return (
    <Sheet visible={visible} onClose={onClose} title="Delivery address">
      <View className="px-5"><Field placeholder="Search area, street or landmark" value={q} onChangeText={setQ} autoFocus suffix={results.isFetching ? <ActivityIndicator color={colors.brand[500]} /> : <Search size={18} color={colors.ink[400]} />} error={error || results.error?.message} /></View>
      <FlatList
        style={{ maxHeight: 380 }}
        keyboardShouldPersistTaps="handled"
        data={debounced.length >= 3 ? results.data || [] : []}
        keyExtractor={(p) => p.placeId}
        ListHeaderComponent={debounced.length < 3 && savedWithLocation.length ? (
          <View>
            <T variant="overline" tone="subtle" className="px-5 pb-1">Saved addresses</T>
            {savedWithLocation.map((a) => (
              <Pressable key={a.id} onPress={() => { onSelect({ address: [a.line1, a.line2, a.city].filter(Boolean).join(', '), lat: a.location.lat, lng: a.location.lng }); onClose(); }} className="flex-row items-center px-5 py-3 active:bg-ink-50">
                <Home size={18} color={colors.ink[500]} />
                <View className="ml-3 flex-1"><T variant="label">{a.label || 'Saved'}</T><T variant="caption" tone="muted" numberOfLines={1}>{[a.line1, a.city].filter(Boolean).join(', ')}</T></View>
              </Pressable>
            ))}
          </View>
        ) : null}
        renderItem={({ item }) => (
          <Pressable onPress={() => choosePlace(item)} className="flex-row items-center px-5 py-3 active:bg-ink-50" disabled={!!resolving}>
            <MapPin size={18} color={colors.ink[500]} />
            <View className="ml-3 flex-1"><T variant="label" numberOfLines={1}>{item.primary}</T><T variant="caption" tone="muted" numberOfLines={1}>{item.secondary}</T></View>
            {resolving === item.placeId ? <ActivityIndicator color={colors.brand[500]} /> : null}
          </Pressable>
        )}
        ListEmptyComponent={debounced.length >= 3 && !results.isFetching ? <T variant="bodySm" tone="subtle" className="px-5 py-3">No matching places.</T> : null}
      />
    </Sheet>
  );
}
