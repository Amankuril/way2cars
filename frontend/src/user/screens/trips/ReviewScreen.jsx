import { useState } from 'react';
import { View } from '@/mobile/rn';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Star, CarFront, UserRound, Sparkles, MessageSquareText } from 'lucide-react';
import { Screen, HeroHeader, T, Button, Field, Chip, useToast, Card, IconTile, PressableScale, FadeInView, cn } from '@/mobile/ui';
import { colors } from '@shared/theme/tokens';
import { api } from '../../api';

const TAGS = { clean_car: 'Clean car', smooth_handover: 'Smooth handover', as_described: 'As described', good_condition: 'Good condition', helpful_host: 'Helpful host', fuel_efficient: 'Fuel efficient', late_handover: 'Late handover', dirty_car: 'Not clean', mechanical_issue: 'Mechanical issue', not_as_described: 'Not as described' };
const WORDS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

/** Card heading: tinted icon + title (+ optional trailing text). */
const CardTitle = ({ icon, title, trailing }) => (
  <View className="flex-row items-center">
    <IconTile icon={icon} size={36} />
    <T variant="body" className="ml-3 flex-1 font-bold">{title}</T>
    {trailing}
  </View>
);

function Stars({ value, onChange, label, icon }) {
  return (
    <Card className="mx-4 mb-4 p-4">
      <CardTitle icon={icon} title={label} trailing={value ? <T variant="label" className="text-warning-700">{WORDS[value]}</T> : <T variant="caption" tone="subtle">Tap to rate</T>} />
      <View className="mt-3 flex-row justify-between" accessibilityRole="adjustable" accessibilityLabel={`${label}: ${value || 0} of 5`}>
        {[1, 2, 3, 4, 5].map((s) => {
          const on = s <= value;
          return (
            <PressableScale key={s} onPress={() => onChange(s)} scaleTo={0.8} hitSlop={4} accessibilityRole="button" accessibilityLabel={`${s} star${s > 1 ? 's' : ''}`} accessibilityState={{ selected: on }}
              className={cn('h-14 w-14 items-center justify-center rounded-2xl', on ? 'bg-warning-50' : 'bg-ink-50')}>
              <FadeInView key={on ? 'on' : 'off'} from="none">
                <Star size={30} color={on ? colors.warning[500] : colors.ink[300]} fill={on ? colors.warning[500] : 'transparent'} strokeWidth={1.8} />
              </FadeInView>
            </PressableScale>
          );
        })}
      </View>
    </Card>
  );
}

export function ReviewScreen({ route, navigation }) {
  const { id } = route.params;
  // Web: a pasted link has no title param — read it from the trip.
  const trip = useQuery({ queryKey: ['trip', id], queryFn: () => api.get(`/api/v1/user/bookings/${id}`), enabled: !route.params.title });
  const title = route.params.title || trip.data?.vehicle?.title;
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
    <Screen tone="hero" footer={<Button title="Submit review" size="lg" block disabled={!vehicleRating || !hostRating} loading={submit.isPending} onPress={() => submit.mutate()} />}>
      <HeroHeader eyebrow="Your feedback" title="Rate your trip" subtitle={title} className="pb-12" />
      <FadeInView style={{ marginTop: -28 }}>
        <Stars label="How was the car?" icon={CarFront} value={vehicleRating} onChange={setVehicleRating} />
      </FadeInView>
      <FadeInView index={1}>
        <Stars label="How was the host?" icon={UserRound} value={hostRating} onChange={setHostRating} />
      </FadeInView>
      <FadeInView index={2}>
        <Card className="mx-4 mb-4 p-4">
          <CardTitle icon={Sparkles} title="What stood out?" trailing={<T variant="caption" tone="subtle">{tags.length ? `${tags.length} of 6` : 'Up to 6'}</T>} />
          <View className="mt-3 flex-row flex-wrap">{Object.entries(TAGS).map(([k, l]) => <Chip key={k} label={l} className="mb-2" selected={tags.includes(k)} onPress={() => setTags((t) => (t.includes(k) ? t.filter((x) => x !== k) : t.length < 6 ? [...t, k] : t))} />)}</View>
        </Card>
      </FadeInView>
      <FadeInView index={3}>
        <Card className="mx-4 px-4 pt-4">
          <CardTitle icon={MessageSquareText} title="Tell others about it" trailing={<T variant="caption" tone="subtle">{comment.length}/1000</T>} />
          <Field className="mt-3" label="Your review (optional)" multiline value={comment} onChangeText={(t) => setComment(t.slice(0, 1000))} placeholder="Your review is public and shown with your first name" />
        </Card>
      </FadeInView>
    </Screen>
  );
}
