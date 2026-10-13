import { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react-native';
import { Screen, Header, T, Button, Field, Chip, useToast } from '@shared/native';
import { colors } from '@shared/theme/tokens';
import { api } from '../../api';

const TAGS = { clean_car: 'Clean car', smooth_handover: 'Smooth handover', as_described: 'As described', good_condition: 'Good condition', helpful_host: 'Helpful host', fuel_efficient: 'Fuel efficient', late_handover: 'Late handover', dirty_car: 'Not clean', mechanical_issue: 'Mechanical issue', not_as_described: 'Not as described' };

function Stars({ value, onChange, label }) {
  return (
    <View className="mb-6">
      <T variant="label" tone="muted" className="mb-2">{label}</T>
      <View className="flex-row" accessibilityRole="adjustable" accessibilityLabel={`${label}: ${value || 0} of 5`}>
        {[1, 2, 3, 4, 5].map((s) => (
          <Pressable key={s} onPress={() => onChange(s)} hitSlop={6} className="mr-3" accessibilityLabel={`${s} star${s > 1 ? 's' : ''}`}>
            <Star size={34} color={s <= value ? colors.warning[500] : colors.ink[300]} fill={s <= value ? colors.warning[500] : 'transparent'} strokeWidth={1.6} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function ReviewScreen({ route, navigation }) {
  const { id, title } = route.params;
  const qc = useQueryClient();
  const toast = useToast();
  const [vehicleRating, setVehicleRating] = useState(0);
  const [hostRating, setHostRating] = useState(0);
  const [tags, setTags] = useState([]);
  const [comment, setComment] = useState('');
  const submit = useMutation({
    mutationFn: () => api.post('/api/v1/user/reviews', { bookingId: id, vehicleRating, hostRating, tags, comment: comment.trim() || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['trip', id] }); toast('Thanks for your review!', 'success'); navigation.goBack(); },
    onError: (e) => toast(e.message, 'danger'),
  });
  return (
    <Screen bg="surface" header={<Header title="Rate your trip" subtitle={title} />} footer={<Button title="Submit review" size="lg" block disabled={!vehicleRating || !hostRating} loading={submit.isPending} onPress={() => submit.mutate()} />}>
      <View className="px-5 pt-5">
        <Stars label="How was the car?" value={vehicleRating} onChange={setVehicleRating} />
        <Stars label="How was the host?" value={hostRating} onChange={setHostRating} />
        <T variant="label" tone="muted" className="mb-2">What stood out?</T>
        <View className="mb-5 flex-row flex-wrap">{Object.entries(TAGS).map(([k, l]) => <Chip key={k} label={l} className="mb-2" selected={tags.includes(k)} onPress={() => setTags((t) => (t.includes(k) ? t.filter((x) => x !== k) : t.length < 6 ? [...t, k] : t))} />)}</View>
        <Field label="Tell others about it (optional)" multiline value={comment} onChangeText={(t) => setComment(t.slice(0, 1000))} placeholder="Your review is public and shown with your first name" />
      </View>
    </Screen>
  );
}
