import { useQuery } from '@tanstack/react-query';
import { PlaceSearchSheet } from '@shared/native';
import { api } from '../api';

/** Delivery address picker: saved addresses + Google Places search. */
export function AddressPicker({ visible, onClose, onSelect }) {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get('/api/v1/user/me'), enabled: visible });
  const saved = (me.data?.addresses || []).filter((a) => a.location).map((a) => ({
    key: String(a.id),
    label: a.label || 'Saved',
    place: { address: [a.line1, a.line2, a.city].filter(Boolean).join(', '), lat: a.location.lat, lng: a.location.lng },
  }));
  return <PlaceSearchSheet visible={visible} onClose={onClose} onSelect={onSelect} title="Delivery address" saved={saved} allowCurrentLocation />;
}
