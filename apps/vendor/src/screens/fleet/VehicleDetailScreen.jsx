import { View, Image, ScrollView } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { Camera, FileText, Pencil, CalendarDays, IndianRupee, CheckCircle2, Circle, Send, Star } from 'lucide-react-native';
import { Screen, Header, T, Button, Section, Panel, ListItem, Pill, Notice, Loading, ErrorState, Segmented, KeyValue, useToast } from '@shared/native';
import { colors } from '@shared/theme/tokens';
import { VEHICLE_APPROVAL, FUEL, TRANSMISSION } from '@shared/lib/labels';
import { money, dateLong } from '../../lib';
import { api } from '../../api';
import { useAuth } from '../../auth/AuthContext';

export function VehicleDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const qc = useQueryClient();
  const toast = useToast();
  const { account } = useAuth();
  const q = useQuery({ queryKey: ['vehicle', id], queryFn: () => api.get(`/api/v1/vendor/vehicles/${id}`) });
  useFocusEffect(useCallback(() => { q.refetch(); }, [])); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = (v) => { if (v) qc.setQueryData(['vehicle', id], (old) => ({ ...old, ...v })); qc.invalidateQueries({ queryKey: ['vehicles'] }); q.refetch(); };
  const submit = useMutation({ mutationFn: () => api.post(`/api/v1/vendor/vehicles/${id}/submit`), onSuccess: (v) => { toast('Submitted for review', 'success'); refresh(v); navigation.navigate('Main', { screen: 'Fleet' }); }, onError: (e) => toast(e.details?.missing ? `Missing: ${e.details.missing.join(', ')}` : e.message, 'danger') });
  const setStatus = useMutation({
    mutationFn: (status) => api.patch(`/api/v1/vendor/vehicles/${id}/status`, { status }),
    onSuccess: (v) => { refresh(v); if (v.upcomingBookings) toast(`${v.upcomingBookings} existing booking(s) still need this car.`, 'neutral'); },
    onError: (e) => toast(e.message, 'danger'),
  });

  if (q.isLoading) return <Screen header={<Header title="Car" />} scroll={false}><Loading /></Screen>;
  if (q.error) return <Screen header={<Header title="Car" />} scroll={false}><ErrorState error={q.error} onRetry={q.refetch} /></Screen>;
  const v = q.data;
  const approval = v.approval?.status || 'draft';
  const a = VEHICLE_APPROVAL[approval];
  const gaps = v.submissionGaps || [];
  const canSubmit = ['draft', 'rejected'].includes(approval);
  const vendorReady = ['pending_approval', 'approved'].includes(account?.status);
  const docs = v.documents || {};
  const steps = [
    { done: true, label: 'Car details' },
    { done: (v.photos?.length || 0) >= 4, label: `Photos (${v.photos?.length || 0}/4 minimum)` },
    { done: !!docs.rc?.fileId, label: 'Registration certificate (RC)' },
    { done: !!docs.insurance?.fileId, label: 'Insurance' },
    { done: v.fuelType === 'electric' || !!docs.puc?.fileId, label: v.fuelType === 'electric' ? 'PUC not needed for EVs' : 'Pollution certificate (PUC)' },
  ];

  return (
    <Screen header={<Header title={v.title} subtitle={v.registrationNumber} right={<Button title="Edit" icon={Pencil} variant="ghost" size="sm" onPress={() => navigation.navigate('VehicleForm', { id })} />} />}
      footer={canSubmit ? <Button title={approval === 'rejected' ? 'Resubmit for review' : 'Submit for review'} icon={Send} size="lg" block disabled={gaps.length > 0 || !vendorReady} loading={submit.isPending} onPress={() => submit.mutate()} /> : null}
      refreshing={q.isRefetching} onRefresh={q.refetch}>
      {v.photos?.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="px-4 pt-4">
          {v.photos.map((u, i) => <Image key={u} source={{ uri: u }} style={{ width: 220, height: 140, borderRadius: 10, marginRight: 10 }} accessibilityLabel={`Photo ${i + 1}`} />)}
        </ScrollView>
      ) : null}

      <View className="mx-4 mt-4 flex-row items-center">
        <Pill label={a.label} tone={a.tone} />
        {v.isListed ? <Pill label="Live" tone="success" className="ml-2" /> : null}
        {v.rating?.count ? <View className="ml-auto flex-row items-center"><Star size={14} color={colors.warning[500]} fill={colors.warning[500]} /><T variant="label" className="ml-1">{v.rating.avg.toFixed(1)}</T><T variant="caption" tone="subtle" className="ml-1">({v.rating.count})</T></View> : null}
      </View>
      {approval === 'rejected' && v.approval?.reason ? <Notice tone="danger" title="Changes requested" className="mx-4 mt-3">{v.approval.reason}</Notice> : null}
      {approval === 'pending_review' ? <Notice tone="info" className="mx-4 mt-3" title="In review">Submitted {dateLong(v.approval.submittedAt)}. We usually review within a day.</Notice> : null}
      {canSubmit && !vendorReady ? <Notice tone="warning" className="mx-4 mt-3">Submit your host application first — then you can send cars for review.</Notice> : null}

      {canSubmit ? (
        <Section title="Ready to go live?">
          <Panel>
            {steps.map((s) => (
              <View key={s.label} className="flex-row items-center py-1.5">
                {s.done ? <CheckCircle2 size={18} color={colors.success[600]} /> : <Circle size={18} color={colors.ink[300]} />}
                <T variant="bodySm" className="ml-2.5" tone={s.done ? 'default' : 'muted'}>{s.label}</T>
              </View>
            ))}
          </Panel>
        </Section>
      ) : null}

      {approval === 'approved' ? (
        <Section title="Availability status">
          <View className="px-4">
            <Segmented options={[{ value: 'active', label: 'Active' }, { value: 'offline', label: 'Offline' }, { value: 'maintenance', label: 'Maintenance' }]} value={v.status} onChange={(s) => s !== v.status && setStatus.mutate(s)} />
            <T variant="caption" tone="subtle" className="mt-2">Offline or maintenance hides the car from new searches. Existing bookings are not affected.</T>
          </View>
        </Section>
      ) : null}

      <Section title="Manage">
        <Panel padded={false}>
          <ListItem icon={Camera} title="Photos" subtitle={`${v.photos?.length || 0} photos`} onPress={() => navigation.navigate('VehiclePhotos', { id })} />
          <ListItem icon={FileText} title="Documents" subtitle="RC, insurance, PUC, fitness" onPress={() => navigation.navigate('VehicleDocuments', { id })} />
          <ListItem icon={CalendarDays} title="Availability calendar" subtitle="Bookings and blocked dates" onPress={() => navigation.navigate('Calendar', { id, title: v.title })} />
          <ListItem icon={IndianRupee} title="Pricing calendar" subtitle="Special prices for dates" last onPress={() => navigation.navigate('PricingCalendar', { id, title: v.title, dailyPaise: v.pricing.dailyPaise })} />
        </Panel>
      </Section>

      <Section title="Summary">
        <Panel>
          <KeyValue label="Type" value={`${v.category?.name || ''} · ${FUEL[v.fuelType]} · ${TRANSMISSION[v.transmission]}`} />
          <KeyValue label="Seats / luggage" value={`${v.seats} seats · ${v.luggageBags} bags`} />
          <KeyValue label="Hourly / daily" value={`${money(v.pricing.hourlyPaise)} · ${money(v.pricing.dailyPaise)}`} />
          {v.pricing.weekendDailyPaise ? <KeyValue label="Weekend day" value={money(v.pricing.weekendDailyPaise)} /> : null}
          <KeyValue label="Deposit" value={money(v.pricing.securityDepositPaise)} />
          <KeyValue label="Free km / extra" value={`${v.pricing.includedKmPerDay} km/day · ${money(v.pricing.extraKmChargePaise)}/km`} />
          <KeyValue label="Instant booking" value={v.instantBooking ? 'On' : 'Off'} />
          <KeyValue label="Doorstep delivery" value={v.delivery?.enabled ? `Within ${v.delivery.maxKm} km` : 'Off'} />
          <KeyValue label="Pickup area" value={v.location?.area || '—'} />
          <KeyValue label="Trips / earned" value={`${v.stats?.trips || 0} · ${money(v.stats?.earningsPaise || 0)}`} />
        </Panel>
      </Section>
    </Screen>
  );
}
