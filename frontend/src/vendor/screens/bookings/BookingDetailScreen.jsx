import { useState } from 'react';
import { View, Image, Linking, ScrollView, Pressable } from '@/mobile/rn';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Phone, BadgeCheck, Navigation, MessageSquare, Check, X } from 'lucide-react';
import { Screen, Header, T, Button, Section, Panel, KeyValue, Divider, Pill, Notice, Loading, ErrorState, Sheet, Field, ListItem, Chip, useToast, cn } from '@/mobile/ui';
import { colors } from '@shared/theme/tokens';
import { BOOKING_STATUS, CHECKLIST, PHOTO_ANGLE, fuelLabel } from '@shared/lib/labels';
import { money, dateTime, dayLabel, timeLabel, duration, pct } from '../../lib';
import { api, privateSource } from '../../api';
import { useCountdown, mmss } from '../../hooks/useCountdown';

const REJECT_REASONS = ['Car not available', 'Car under maintenance', 'Dates blocked by mistake', 'Other'];

function Inspection({ title, insp }) {
  if (!insp) return null;
  return (
    <Section title={title}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="px-4">
        {insp.photos.map((p) => (
          <View key={p.fileId} className="mr-2.5">
            <Image source={privateSource(p.url)} style={{ width: 150, height: 104, borderRadius: 10 }} className="bg-ink-100" />
            <T variant="caption" tone="subtle" className="mt-1">{PHOTO_ANGLE[p.angle]}</T>
          </View>
        ))}
      </ScrollView>
      <Panel className="mt-3">
        <KeyValue label="Odometer" value={`${insp.odometerKm} km`} />
        {insp.fuelEighths !== undefined && insp.fuelEighths !== null ? <KeyValue label="Fuel" value={fuelLabel(insp.fuelEighths)} /> : null}
        {insp.batteryPercent !== undefined && insp.batteryPercent !== null ? <KeyValue label="Battery" value={`${insp.batteryPercent}%`} /> : null}
        {insp.checklist?.filter((c) => !c.ok).length ? <KeyValue label="Flagged items" value={insp.checklist.filter((c) => !c.ok).map((c) => CHECKLIST[c.item]).join(', ')} tone="warning" /> : null}
        {insp.damages?.length ? insp.damages.map((d, i) => <KeyValue key={i} label={`Damage · ${d.area} (${d.severity})`} value={d.description} tone="danger" />) : null}
        {insp.notes ? <T variant="caption" tone="muted" className="mt-1">“{insp.notes}”</T> : null}
        <T variant="caption" tone="subtle" className="mt-1">Recorded {dateTime(insp.createdAt)}</T>
      </Panel>
    </Section>
  );
}

export function BookingDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const qc = useQueryClient();
  const toast = useToast();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState(REJECT_REASONS[0]);
  const [other, setOther] = useState('');
  const q = useQuery({ queryKey: ['booking', id], queryFn: () => api.get(`/api/v1/vendor/bookings/${id}`), refetchInterval: (s) => (['pending_vendor_approval', 'ongoing'].includes(s.state.data?.status) ? 30000 : false) });
  const left = useCountdown(q.data?.vendorDecisionDueAt);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['booking', id] }); qc.invalidateQueries({ queryKey: ['bookings'] }); qc.invalidateQueries({ queryKey: ['earnings'] }); };
  const decide = useMutation({
    mutationFn: (body) => api.post(`/api/v1/vendor/bookings/${id}/decision`, body),
    onSuccess: (_d, body) => { setRejectOpen(false); toast(body.decision === 'accept' ? 'Booking confirmed' : 'Booking declined — renter refunded', body.decision === 'accept' ? 'success' : 'neutral'); refresh(); },
    onError: (e) => toast(e.message, 'danger'),
  });
  const acceptReturn = useMutation({
    mutationFn: () => api.post(`/api/v1/vendor/bookings/${id}/return-review`, { decision: 'accept' }),
    onSuccess: () => { toast('Return accepted. Earnings added.', 'success'); refresh(); },
    onError: (e) => toast(e.message, 'danger'),
  });

  if (q.isLoading) return <Screen header={<Header title="Booking" />} scroll={false}><Loading /></Screen>;
  if (q.error) return <Screen header={<Header title="Booking" />} scroll={false}><ErrorState error={q.error} onRetry={q.refetch} /></Screen>;
  const b = q.data;
  const s = BOOKING_STATUS[b.status];
  const estEarning = b.pricing.rentalPaise - pct(b.pricing.rentalPaise, b.pricing.commissionBps);
  const claim = b.inspections?.damageClaim;

  let footer = null;
  if (b.status === 'pending_vendor_approval') {
    footer = (
      <View className="flex-row">
        <Button title="Decline" icon={X} variant="secondary" className="mr-3 flex-1" onPress={() => setRejectOpen(true)} />
        <Button title="Accept" icon={Check} className="flex-[1.6]" loading={decide.isPending && decide.variables?.decision === 'accept'} onPress={() => decide.mutate({ decision: 'accept' })} />
      </View>
    );
  } else if (b.status === 'return_pending' && !claim) {
    footer = (
      <View className="flex-row">
        <Button title="Report damage" variant="secondary" className="mr-3 flex-1" onPress={() => navigation.navigate('DamageClaim', { id, title: b.vehicle.title })} />
        <Button title="Accept return" className="flex-1" loading={acceptReturn.isPending} onPress={() => acceptReturn.mutate()} />
      </View>
    );
  }

  return (
    <Screen header={<Header title={b.vehicle.title} subtitle={`Ref ${b.ref}`} />} footer={footer} refreshing={q.isRefetching} onRefresh={q.refetch}>
      <Panel className="mt-4">
        <View className="flex-row items-center justify-between">
          <Pill label={s.label} tone={s.tone} />
          {b.status === 'pending_vendor_approval' ? <T variant="label" tone={left < 900 ? 'danger' : 'warning'}>Respond in {left > 3600 ? `${Math.floor(left / 3600)}h ${Math.floor((left % 3600) / 60)}m` : mmss(left)}</T> : null}
        </View>
        <View className="mt-3 flex-row">
          <View className="flex-1"><T variant="overline" tone="subtle">Pickup</T><T variant="body" className="mt-1 font-bold">{dayLabel(b.startAt)}</T><T variant="bodySm" tone="muted">{timeLabel(b.startAt)}</T></View>
          <View className="flex-1 items-end"><T variant="overline" tone="subtle">Return</T><T variant="body" className="mt-1 font-bold">{dayLabel(b.endAt)}</T><T variant="bodySm" tone="muted">{timeLabel(b.endAt)}</T></View>
        </View>
        <T variant="caption" tone="subtle" className="mt-2">{duration(b.startAt, b.endAt)} · {b.vehicle.registrationNumber}{b.extensions?.some((e) => e.status === 'paid') ? ' · extended' : ''}</T>
      </Panel>

      {b.status === 'pending_vendor_approval' ? <Notice tone="warning" className="mx-4 mt-3" title="Respond before the deadline">If you don’t respond, the request is declined automatically and the renter is refunded.</Notice> : null}
      {claim ? <Notice tone={claim.status === 'pending' ? 'info' : claim.status === 'approved' ? 'success' : 'neutral'} className="mx-4 mt-3" title={`Damage claim ${claim.status}`}>{money(claim.amountPaise)} claimed{claim.approvedPaise ? ` · ${money(claim.approvedPaise)} approved` : ''}. {claim.reviewNote || (claim.status === 'pending' ? 'Our team is reviewing the evidence.' : '')}</Notice> : null}

      <Section title="Renter">
        <Panel padded={false}>
          <ListItem title={b.renter?.name || 'Renter'} subtitle={`${b.renter?.tripsCompleted || 0} completed trips`} right={b.renter?.kycStatus === 'approved' ? <View className="flex-row items-center"><BadgeCheck size={16} color={colors.success[600]} /><T variant="caption" tone="success" className="ml-1">Verified</T></View> : null} last={!b.renter?.phone} />
          {b.renter?.phone ? <ListItem icon={Phone} title="Call renter" subtitle={`+91 ${b.renter.phone}`} last onPress={() => Linking.openURL(`tel:+91${b.renter.phone}`)} /> : null}
        </Panel>
      </Section>

      <Section title="Handover">
        <Panel padded={false}>
          <ListItem icon={Navigation} title={b.pickup?.type === 'doorstep' ? `Doorstep delivery · ${b.pickup.distanceKm} km` : 'Pickup at your location'} subtitle={b.pickup?.address} last onPress={b.pickup?.point ? () => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${b.pickup.point.lat},${b.pickup.point.lng}`) : undefined} />
        </Panel>
      </Section>

      <Section title="Earnings">
        <Panel>
          <KeyValue label={`Rental · ${b.pricing.hours} hrs`} value={money(b.pricing.rentalPaise)} />
          <KeyValue label={`WAY2CARS commission (${b.pricing.commissionBps / 100}%)`} value={money(-pct(b.pricing.rentalPaise, b.pricing.commissionBps))} />
          <Divider className="my-2" />
          {b.settlement ? (
            <>
              {b.settlement.extraKmPaise ? <KeyValue label={`Extra km (${b.settlement.extraKm})`} value={money(b.settlement.extraKmPaise)} /> : null}
              {b.settlement.fuelPaise ? <KeyValue label="Fuel shortfall" value={money(b.settlement.fuelPaise)} /> : null}
              {b.settlement.lateFeePaise ? <KeyValue label="Late return" value={money(b.settlement.lateFeePaise)} /> : null}
              {b.settlement.damagePaise ? <KeyValue label="Damage compensation" value={money(b.settlement.damagePaise)} /> : null}
              <KeyValue label="Your earning" value={money(b.settlement.vendorEarningPaise)} strong tone="success" />
            </>
          ) : <KeyValue label="Estimated earning" value={money(estEarning)} strong />}
          <T variant="caption" tone="subtle" className="mt-1">Deposit {money(b.pricing.depositPaise)} is held by WAY2CARS and covers extra km, fuel, late fees and approved damage.</T>
        </Panel>
      </Section>

      {b.settlementPreview && !b.settlement ? (
        <Section title="Return summary">
          <Panel>
            <KeyValue label="Distance driven" value={`${b.settlementPreview.kmDriven} km (${b.pricing.includedKm} included)`} />
            <KeyValue label="Extra km" value={`${b.settlementPreview.extraKm} km · ${money(b.settlementPreview.extraKmPaise)}`} />
            <KeyValue label="Fuel shortfall" value={`${b.settlementPreview.fuelShortEighths}/8 · ${money(b.settlementPreview.fuelPaise)}`} />
            <KeyValue label="Late by" value={`${b.settlementPreview.lateHours} h · ${money(b.settlementPreview.lateFeePaise)}`} />
            <T variant="caption" tone="subtle" className="mt-1">Compare the pickup and return photos below before accepting. If you don’t respond, the return is accepted automatically.</T>
          </Panel>
        </Section>
      ) : null}

      <Inspection title="Pickup condition" insp={b.inspections?.pickup} />
      <Inspection title="Return condition" insp={b.inspections?.return} />
      {b.inspections?.agreement ? <T variant="caption" tone="subtle" className="mx-4 mt-3">Rental agreement v{b.inspections.agreement.version} signed by {b.inspections.agreement.name} on {dateTime(b.inspections.agreement.at)}.</T> : null}

      <Section title="Need help?">
        <Panel padded={false}><ListItem icon={MessageSquare} title="Contact support about this booking" last onPress={() => navigation.navigate('NewTicket', { bookingId: id, ref: b.ref })} /></Panel>
      </Section>

      <Sheet visible={rejectOpen} onClose={() => setRejectOpen(false)} title="Decline this request?" footer={<Button title="Decline and refund renter" variant="danger" block loading={decide.isPending} disabled={reason === 'Other' && other.trim().length < 3} onPress={() => decide.mutate({ decision: 'reject', reason: reason === 'Other' ? other.trim() : reason })} />}>
        <View className="px-5 pb-3">
          <T variant="bodySm" tone="muted" className="mb-3">The renter gets a full refund. Frequent declines lower your listing’s ranking.</T>
          <View className="flex-row flex-wrap">{REJECT_REASONS.map((r) => <Chip key={r} label={r} className="mb-2" selected={reason === r} onPress={() => setReason(r)} />)}</View>
          {reason === 'Other' ? <Field label="Reason" value={other} onChangeText={setOther} className={cn('mt-2')} /> : null}
        </View>
      </Sheet>
      {b.status === 'cancelled' && b.cancellation ? <Pressable className="mx-4 mt-4"><T variant="caption" tone="subtle">Cancelled {dateTime(b.cancellation.at)} · {b.cancellation.reason}</T></Pressable> : null}
    </Screen>
  );
}
