import { useEffect, useRef, useState } from 'react';
import { View, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Home, Search, LocateFixed } from 'lucide-react-native';
import { Sheet } from './Feedback';
import { T } from './Text';
import { Field } from './Field';
import { colors } from '../theme/tokens';
import { useApp } from './app/AppContext';
import { currentPosition } from './app/location';

const uuid = () => 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));

/**
 * Google Places search through our backend (`/api/v1/<realm>/maps/*`, server key never in the app)
 * with a billing session token. Optional saved addresses and "use current location".
 * onSelect({ address, lat, lng, placeId, city, state, pincode })
 */
export function PlaceSearchSheet({ visible, onClose, onSelect, title = 'Search location', saved = [], allowCurrentLocation = false }) {
  const { api, realm } = useApp();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [resolving, setResolving] = useState(null);
  const [error, setError] = useState(null);
  const token = useRef(uuid());
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 350); return () => clearTimeout(t); }, [q]);
  useEffect(() => { if (visible) { setQ(''); setError(null); token.current = uuid(); } }, [visible]);

  const results = useQuery({
    queryKey: ['places', realm, debounced],
    queryFn: () => api.get(`/api/v1/${realm}/maps/autocomplete`, { q: debounced, sessionToken: token.current }),
    enabled: visible && debounced.length >= 3,
    staleTime: 5 * 60_000,
  });

  const done = (place) => { onSelect(place); onClose(); };
  const choose = async (p) => {
    setResolving(p.placeId);
    setError(null);
    try {
      const d = await api.get(`/api/v1/${realm}/maps/place/${p.placeId}`, { sessionToken: token.current });
      done({ address: d.address || p.description, lat: d.lat, lng: d.lng, placeId: d.placeId, city: d.city, state: d.state, pincode: d.pincode });
    } catch (e) {
      setError(e.message);
    } finally {
      setResolving(null);
    }
  };
  const useCurrent = async () => {
    setResolving('current');
    setError(null);
    try {
      const pos = await currentPosition();
      if (!pos) throw new Error('Location permission is off or unavailable.');
      const r = await api.get(`/api/v1/${realm}/maps/reverse`, pos);
      done({ address: r?.address || `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`, lat: pos.lat, lng: pos.lng, placeId: r?.placeId, city: r?.city, state: r?.state, pincode: r?.pincode });
    } catch (e) {
      setError(e.message);
    } finally {
      setResolving(null);
    }
  };

  const showSaved = debounced.length < 3;
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View className="px-5"><Field placeholder="Search area, street or landmark" value={q} onChangeText={setQ} autoFocus suffix={results.isFetching ? <ActivityIndicator color={colors.brand[500]} /> : <Search size={18} color={colors.ink[400]} />} error={error || results.error?.message} /></View>
      <FlatList
        style={{ maxHeight: 380 }}
        keyboardShouldPersistTaps="handled"
        data={showSaved ? [] : results.data || []}
        keyExtractor={(p) => p.placeId}
        ListHeaderComponent={showSaved ? (
          <View>
            {allowCurrentLocation ? (
              <Pressable onPress={useCurrent} className="flex-row items-center px-5 py-3 active:bg-ink-50" disabled={!!resolving}>
                <LocateFixed size={18} color={colors.brand[600]} />
                <T variant="label" tone="brand" className="ml-3 flex-1">Use my current location</T>
                {resolving === 'current' ? <ActivityIndicator color={colors.brand[500]} /> : null}
              </Pressable>
            ) : null}
            {saved.length ? <T variant="overline" tone="subtle" className="px-5 pb-1 pt-2">Saved</T> : null}
            {saved.map((a) => (
              <Pressable key={a.key} onPress={() => done(a.place)} className="flex-row items-center px-5 py-3 active:bg-ink-50">
                <Home size={18} color={colors.ink[500]} />
                <View className="ml-3 flex-1"><T variant="label">{a.label}</T><T variant="caption" tone="muted" numberOfLines={1}>{a.place.address}</T></View>
              </Pressable>
            ))}
          </View>
        ) : null}
        renderItem={({ item }) => (
          <Pressable onPress={() => choose(item)} className="flex-row items-center px-5 py-3 active:bg-ink-50" disabled={!!resolving}>
            <MapPin size={18} color={colors.ink[500]} />
            <View className="ml-3 flex-1"><T variant="label" numberOfLines={1}>{item.primary}</T><T variant="caption" tone="muted" numberOfLines={1}>{item.secondary}</T></View>
            {resolving === item.placeId ? <ActivityIndicator color={colors.brand[500]} /> : null}
          </Pressable>
        )}
        ListEmptyComponent={!showSaved && !results.isFetching ? <T variant="bodySm" tone="subtle" className="px-5 py-3">No matching places.</T> : null}
      />
    </Sheet>
  );
}
