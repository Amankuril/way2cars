import { useState } from 'react';
import { View, Image, Linking } from '@/mobile/rn';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Phone, Navigation, CarFront, KeyRound, CalendarPlus, LifeBuoy, FileText, Star, XCircle, Clock, MessageSquare, Receipt, MapPin, Truck, UserRound, Timer, Flag, Gauge, CalendarClock, RotateCcw } from 'lucide-react';
import { DateTimePickerAndroid } from '@/mobile/app/datetime';
import { Screen, Header, HeroHeader, T, Button, KeyValue, Pill, Notice, ErrorState, Sheet, ListItem, useToast, Field, Card, SectionHeader, FadeInView, TripRoute, Timeline, ActionTile, SpecChip, IconTile, DashedDivider, PressableScale, Skeleton, SkeletonCard, cn } from '@/mobile/ui';
import { colors } from '@shared/theme/tokens';
import { money, dateTime, dayLabel, timeLabel, duration } from '@shared/lib/format';
import { BOOKING_STATUS, REFUND_STATUS } from '@shared/lib/labels';
import { api } from '../../api';
import { usePublicConfig } from '../../hooks/queries';
import { useCountdown, mmss } from '../../hooks/useCountdown';
import { PriceBreakdown } from '../../components/PriceBreakdown';
import { spanLabel } from '../../components/TripCard';
import { payOrder } from '../../services/payments';
import { downloadPdf } from '../../services/files';

const roundHalf = (d) => new Date(Math.ceil(d.getTime() / 1800000) * 1800000);
const CONFIRMED = ['confirmed', 'ongoing', 'return_pending', 'completed'];

/** Booking progress, built only from the booking's own status and timestamps. */
function progressItems(b) {
  const st = b.status;
  const tr = b.trip || {};
  const items = [{ key: 'booked', title: 'Booking placed', subtitle: dateTime(b.createdAt), state: 'done' }];
  if (b.payment?.paidAt) items.push({ key: 'paid', title: 'Payment received', subtitle: dateTime(b.payment.paidAt), state: 'done' });
  else if (st === 'pending_payment') items.push({ key: 'paid', title: 'Complete payment', subtitle: b.holdExpiresAt ? `Car held until ${timeLabel(b.holdExpiresAt)}` : undefined, state: 'current' });
  else if (st === 'expired') items.push({ key: 'paid', title: 'Payment not completed', state: 'stopped' });
  if (st === 'expired') return items;
  if (st === 'rejected') return [...items, { key: 'host', title: 'Declined by host', subtitle: b.cancellation?.at ? dateTime(b.cancellation.at) : undefined, state: 'stopped' }];
  if (st === 'cancelled') return [...items, { key: 'cancel', title: 'Booking cancelled', subtitle: b.cancellation?.at ? dateTime(b.cancellation.at) : undefined, state: 'stopped' }];

  const confirmed = CONFIRMED.includes(st);
  items.push({
    key: 'confirm',
    title: st === 'pending_vendor_approval' ? 'Waiting for the host' : b.instantBooking ? 'Booking confirmed' : confirmed ? 'Confirmed by host' : 'Host confirms',
    subtitle: st === 'pending_vendor_approval' && b.vendorDecisionDueAt ? `Host replies by ${dateTime(b.vendorDecisionDueAt)}` : undefined,
    state: confirmed ? 'done' : st === 'pending_vendor_approval' ? 'current' : 'todo',
  });
  items.push(tr.startedAt
    ? { key: 'start', title: 'Trip started', subtitle: dateTime(tr.startedAt), state: 'done' }
    : { key: 'start', title: 'Pick up the car', subtitle: dateTime(b.startAt), state: st === 'confirmed' ? 'current' : 'todo' });
  items.push(tr.returnSubmittedAt
    ? { key: 'return', title: 'Car returned', subtitle: dateTime(tr.returnSubmittedAt), state: 'done' }
    : { key: 'return', title: 'Return the car', subtitle: `Due ${dateTime(b.endAt)}`, state: st === 'ongoing' ? 'current' : 'todo' });
  items.push(b.settlement
    ? { key: 'settle', title: 'Trip settled', subtitle: b.settlement.settledAt ? dateTime(b.settlement.settledAt) : undefined, state: 'done' }
    : st === 'return_pending'
      ? { key: 'settle', title: 'Host is checking the car', subtitle: tr.returnReviewDueAt ? `Review due by ${dateTime(tr.returnReviewDueAt)}` : undefined, state: 'current' }
      : { key: 'settle', title: 'Deposit settlement', state: 'todo' });
  return items;
}

/** Big number tile used in the settlement summary. */
const Stat = ({ label, value, tone, className }) => (
  <View className={cn('flex-1 rounded-xl bg-ink-50 px-3 py-2.5', className)}>
    <T variant="caption" tone="subtle">{label}</T>
    <T variant="headline" className={cn('mt-0.5', tone === 'success' ? 'text-success-700' : 'text-ink-900')} style={{ fontVariant: ['tabular-nums'] }}>{value}</T>
  </View>
);

/** Prominent hold timer for unpaid bookings. The bar shrinks over the hold window (createdAt → holdExpiresAt). */
function HoldCard({ b, left }) {
  const total = Math.max(1, (new Date(b.holdExpiresAt) - new Date(b.createdAt)) / 1000);
  const pct = Math.max(0, Math.min(100, (left / total) * 100));
  return (
    <Card className="p-4">
      <View className="flex-row items-center">
        <IconTile icon={Timer} tone="warning" size={44} />
        <View className="ml-3 flex-1">
          <T variant="label" className="text-warning-700">Payment pending</T>
          <T variant="caption" tone="subtle">This car is held for you</T>
        </View>
        <T variant="display" className="text-warning-700" style={{ fontVariant: ['tabular-nums'] }} accessibilityLabel={`${Math.floor(left / 60)} minutes ${left % 60} seconds left`}>{mmss(left)}</T>
      </View>
      <View className="mt-3 h-1.5 overflow-hidden rounded-full bg-warning-50">
        <View className="h-1.5 rounded-full bg-warning-500" style={{ width: `${pct}%` }} />
      </View>
      <T variant="bodySm" tone="muted" className="mt-3">Complete payment within {mmss(left)} to keep this car. If money was deducted, we’ll confirm automatically.</T>
    </Card>
  );
}

function DetailSkeleton() {
  return (
    <Screen tone="hero" scroll={false}>
      <HeroHeader compact title="Trip" className="pb-20" />
      <View style={{ marginTop: -56 }} accessibilityLabel="Loading trip">
        <View className="mx-4 rounded-2xl bg-surface p-2">
          <Skeleton className="rounded-xl" style={{ aspectRatio: 16 / 9 }} />
          <View className="flex-row justify-between px-2 pb-2 pt-3"><Skeleton className="h-10 w-24" /><Skeleton className="h-10 w-24" /></View>
        </View>
        <View className="mt-4 flex-row px-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="mx-1 h-24 flex-1 rounded-2xl" />)}</View>
        <SkeletonCard height={180} className="mt-6" />
      </View>
    </Screen>
  );
}

export function TripDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const qc = useQueryClient();
  const toast = useToast();
  const config = usePublicConfig();
  const [sheet, setSheet] = useState(null); // cancel | extend
  const [reason, setReason] = useState('');
  const [extendTo, setExtendTo] = useState(null);
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ['trip', id],
    queryFn: () => api.get(`/api/v1/user/bookings/${id}`),
    refetchInterval: (query) => (['pending_payment', 'pending_vendor_approval', 'return_pending'].includes(query.state.data?.status) ? 15000 : false),
  });
  const preview = useQuery({ queryKey: ['cancel-preview', id], queryFn: () => api.get(`/api/v1/user/bookings/${id}/cancellation-preview`), enabled: sheet === 'cancel' });
  const holdLeft = useCountdown(q.data?.holdExpiresAt);

  const refresh = () => { qc.invalidateQueries({ queryKey: ['trip', id] }); qc.invalidateQueries({ queryKey: ['trips'] }); };
  const cancel = useMutation({
    mutationFn: () => api.post(`/api/v1/user/bookings/${id}/cancel`, { reason: reason.trim() || undefined }),
    onSuccess: () => { setSheet(null); toast('Booking cancelled'); refresh(); },
    onError: (e) => toast(e.message, 'danger'),
  });

  const runPayment = async (getOrder) => {
    setBusy(true);
    try {
      const r = await payOrder(await getOrder());
      toast(r.status === 'paid' ? 'Payment received' : r.message || 'Payment is being confirmed', r.status === 'paid' ? 'success' : r.status === 'failed' ? 'danger' : 'neutral');
    } catch (e) {
      toast(e.message, 'danger');
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const pickExtension = () => {
    const base = new Date(q.data.endAt);
    DateTimePickerAndroid.open({
      value: new Date(base.getTime() + 24 * 3600000), mode: 'date', minimumDate: base,
      onChange: (e, d) => {
        if (e.type !== 'set' || !d) return;
        DateTimePickerAndroid.open({ value: d, mode: 'time', onChange: (e2, t) => { if (e2.type === 'set' && t) setExtendTo(roundHalf(t)); } });
      },
    });
  };
  const extend = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/api/v1/user/bookings/${id}/extensions`, { endAt: extendTo.toISOString() });
      setSheet(null);
      const pr = await payOrder(r.payment);
      toast(pr.status === 'paid' ? 'Trip extended' : pr.message || 'Confirming payment…', pr.status === 'paid' ? 'success' : 'neutral');
    } catch (e) {
      toast(e.message, 'danger');
    } finally {
      setBusy(false);
      refresh();
    }
  };

  if (q.isLoading) return <DetailSkeleton />;
  if (q.error) return <Screen header={<Header title="Trip" />} scroll={false}><ErrorState error={q.error} onRetry={q.refetch} /></Screen>;
  const b = q.data;
  const s = BOOKING_STATUS[b.status] || { label: b.status, tone: 'neutral' };
  const now = Date.now();
  const pickupOpensAt = new Date(new Date(b.startAt).getTime() - (config.data?.booking?.pickupWindowMinutesBefore ?? 30) * 60000);
  const canStart = b.status === 'confirmed' && now >= pickupOpensAt.getTime();
  const pendingExt = b.extensions?.find((e) => e.status === 'pending_payment' && new Date(e.holdExpiresAt) > new Date());
  const st = b.settlement;
  const live = ['confirmed', 'ongoing', 'return_pending'].includes(b.status);
  const canCancel = ['pending_payment', 'pending_vendor_approval', 'confirmed'].includes(b.status);
  const extended = b.originalEndAt && new Date(b.originalEndAt).getTime() !== new Date(b.endAt).getTime();

  let primary = null;
  if (b.status === 'pending_payment' && holdLeft > 0) primary = <Button title={`Complete payment · ${mmss(holdLeft)}`} size="lg" block loading={busy} onPress={() => runPayment(() => api.post(`/api/v1/user/bookings/${id}/payment-order`))} />;
  else if (b.status === 'confirmed') primary = <Button title={canStart ? 'Start trip' : `Pickup opens ${timeLabel(pickupOpensAt)}`} icon={KeyRound} size="lg" block disabled={!canStart} onPress={() => navigation.navigate('Pickup', { id })} />;
  else if (b.status === 'ongoing') primary = <Button title="End trip & return car" size="lg" block onPress={() => navigation.navigate('Return', { id })} />;
  else if (b.status === 'completed' && st?.outstandingStatus === 'due') primary = <Button title={`Pay dues ${money(st.outstandingPaise)}`} size="lg" block loading={busy} onPress={() => runPayment(() => api.post(`/api/v1/user/bookings/${id}/settlement-payment-order`))} />;
  else if (b.status === 'completed' && !b.reviewed?.byUser) primary = <Button title="Rate your trip" icon={Star} size="lg" block variant="secondary" onPress={() => navigation.navigate('Review', { id, title: b.vehicle.title })} />;

  // Time hint under the status (derived from the trip's own times).
  let hint = null;
  if (b.status === 'confirmed' && new Date(b.startAt) > now) hint = { icon: KeyRound, label: `Pickup in ${spanLabel(new Date(b.startAt) - now)}` };
  else if (b.status === 'ongoing') hint = new Date(b.endAt) > now ? { icon: Flag, label: `Return in ${spanLabel(new Date(b.endAt) - now)}` } : { icon: Flag, label: `Return was due ${dateTime(b.endAt)}` };

  const tiles = [];
  if (live && b.pickup?.point) tiles.push(<ActionTile key="dir" icon={Navigation} label="Directions" onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${b.pickup.point.lat},${b.pickup.point.lng}`)} className="mx-1" />);
  if (live && b.host) tiles.push(<ActionTile key="call" icon={Phone} tone="success" label="Call host" accessibilityLabel={`Call your host ${b.host.name}`} onPress={() => Linking.openURL(`tel:+91${b.host.phone}`)} className="mx-1" />);
  if (['confirmed', 'ongoing'].includes(b.status)) tiles.push(<ActionTile key="ext" icon={CalendarPlus} tone="accent" label="Extend" accessibilityLabel="Extend trip, subject to availability" onPress={() => { setExtendTo(null); setSheet('extend'); }} className="mx-1" />);
  if (b.status === 'ongoing') tiles.push(<ActionTile key="sos" icon={LifeBuoy} tone="danger" label="Roadside" accessibilityLabel="Roadside assistance: breakdown, flat tyre, accident" onPress={() => navigation.navigate('Roadside', { bookingId: id })} className="mx-1" />);

  let section = 0;
  const next = () => ++section;

  return (
    <Screen tone="hero" footer={primary} refreshing={q.isRefetching} onRefresh={q.refetch}>
      <HeroHeader eyebrow={`Ref ${b.ref}`} title={b.vehicle.title} className="pb-20">
        <View className="mt-3 flex-row flex-wrap items-center">
          <Pill label={s.label} tone={s.tone} className="mr-2" />
          {hint ? (
            <View className="flex-row items-center rounded-full bg-white/15 px-2.5 py-1">
              <hint.icon size={12} color="#fff" strokeWidth={2.4} />
              <T variant="caption" className="ml-1.5 font-bold text-white">{hint.label}</T>
            </View>
          ) : null}
        </View>
      </HeroHeader>

      {/* Car + dates, lifted over the hero */}
      <FadeInView style={{ marginTop: -60 }}>
        <Card className="mx-4 p-2">
          {b.vehicle.photoUrl ? (
            <View className="overflow-hidden rounded-xl bg-ink-100" style={{ aspectRatio: 2 }}>
              <Image source={{ uri: b.vehicle.photoUrl }} className="h-full w-full" resizeMode="cover" />
            </View>
          ) : null}
          <View className="px-2 pb-2 pt-3">
            <TripRoute
              start={{ overline: 'Pickup', title: dayLabel(b.startAt), subtitle: timeLabel(b.startAt) }}
              end={{ overline: 'Return', title: dayLabel(b.endAt), subtitle: timeLabel(b.endAt) }}
              label={duration(b.startAt, b.endAt)}
              animated={b.status === 'ongoing'}
            />
            <View className="mt-3 flex-row flex-wrap border-t border-line pt-3">
              {b.vehicle.registrationNumber && CONFIRMED.includes(b.status) ? <SpecChip icon={CarFront} label={b.vehicle.registrationNumber} tone="brand" /> : null}
              <SpecChip icon={Gauge} label={`${b.pricing.includedKm} km included`} />
              {extended ? <SpecChip icon={CalendarClock} label="Extended" tone="success" /> : null}
            </View>
          </View>
        </Card>
      </FadeInView>

      {/* State-specific guidance */}
      {b.status === 'pending_payment' && holdLeft > 0 ? <FadeInView index={1} className="mx-4 mt-4"><HoldCard b={b} left={holdLeft} /></FadeInView> : null}
      {b.status === 'pending_payment' && holdLeft === 0 ? <Notice tone="neutral" title="Hold expired" className="mx-4 mt-4">This booking will be released shortly. If you paid, it will be confirmed or refunded automatically.</Notice> : null}
      {b.status === 'pending_vendor_approval' ? <Notice tone="info" title="Waiting for the host" className="mx-4 mt-4">The host will confirm by {dateTime(b.vendorDecisionDueAt)}. If they can’t, you get a full refund automatically.</Notice> : null}
      {b.status === 'return_pending' ? <Notice tone="info" title="Return under review" className="mx-4 mt-4">The host is checking the car. Your deposit refund is calculated after their review.</Notice> : null}
      {['cancelled', 'rejected'].includes(b.status) && b.cancellation ? <Notice tone="neutral" title={b.status === 'rejected' ? 'Declined by host' : 'Cancelled'} className="mx-4 mt-4">{b.cancellation.reason}{b.cancellation.refundPaise ? ` · Refund of ${money(b.cancellation.refundPaise)} to your payment method.` : ''}{b.cancellation.walletRefundPaise ? ` ${money(b.cancellation.walletRefundPaise)} returned to wallet.` : ''}</Notice> : null}
      {pendingExt ? <Notice tone="warning" title="Extension awaiting payment" className="mx-4 mt-4" action={<Button title={`Pay ${money(pendingExt.pricing.totalPaise)}`} size="sm" loading={busy} onPress={() => runPayment(() => api.post(`/api/v1/user/bookings/${id}/extensions/${pendingExt.id}/payment-order`))} />}>Extension to {dateTime(pendingExt.requestedEndAt)} is reserved until {timeLabel(pendingExt.holdExpiresAt)}.</Notice> : null}

      {tiles.length ? <FadeInView index={next()} className="mt-4 flex-row px-3">{tiles}</FadeInView> : null}

      <FadeInView index={next()} className="mt-7">
        <SectionHeader title="Trip progress" />
        <Card className="mx-4 p-4"><Timeline items={progressItems(b)} /></Card>
      </FadeInView>

      {live ? (
        <FadeInView index={next()} className="mt-7">
          <SectionHeader title="Pickup & host" />
          <Card className="mx-4"><View className="overflow-hidden rounded-2xl">
            <ListItem icon={b.pickup?.type === 'doorstep' ? Truck : MapPin} title={b.pickup?.type === 'doorstep' ? 'Doorstep delivery' : 'Pickup location'} subtitle={b.pickup?.address || 'Shared after confirmation'} last={!b.host} />
            {b.host ? <ListItem icon={UserRound} iconTone="neutral" title={b.host.name} subtitle="Your host" last /> : null}
          </View></Card>
        </FadeInView>
      ) : null}

      {st ? (
        <FadeInView index={next()} className="mt-7">
          <SectionHeader title="Trip settlement" />
          <Card className="mx-4 p-4">
            <View className="flex-row">
              <Stat label="Distance driven" value={`${st.kmDriven} km`} className="mr-2" />
              <Stat label="Deposit refund" value={money(st.depositRefundPaise)} tone="success" />
            </View>
            {st.extraKmPaise || st.fuelPaise || st.lateFeePaise || st.damagePaise ? <DashedDivider className="my-3" /> : null}
            {st.extraKmPaise ? <KeyValue label={`Extra ${st.extraKm} km`} value={money(st.extraKmPaise)} /> : null}
            {st.fuelPaise ? <KeyValue label={`Fuel shortfall (${st.fuelShortEighths}/8 tank)`} value={money(st.fuelPaise)} /> : null}
            {st.lateFeePaise ? <KeyValue label={`Late return (${st.lateHours} h)`} value={money(st.lateFeePaise)} /> : null}
            {st.damagePaise ? <KeyValue label="Damage charges" hint={st.damageNote} value={money(st.damagePaise)} /> : null}
            {st.outstandingPaise ? (
              <>
                <DashedDivider className="my-3" />
                <KeyValue label="Amount due" value={money(st.outstandingPaise)} strong tone={st.outstandingStatus === 'paid' ? 'success' : 'danger'} hint={st.outstandingStatus === 'paid' ? 'Paid' : st.outstandingStatus === 'waived' ? 'Waived' : undefined} />
              </>
            ) : null}
          </Card>
        </FadeInView>
      ) : b.settlementPreview ? (
        <FadeInView index={next()} className="mt-7">
          <SectionHeader title="Estimated settlement" subtitle="Final after the host reviews the car." />
          <Card className="mx-4 p-4">
            <View className="flex-row">
              <Stat label="Distance driven" value={`${b.settlementPreview.kmDriven} km`} className="mr-2" />
              <Stat label="Est. deposit refund" value={money(b.settlementPreview.depositRefundPaise)} tone="success" />
            </View>
            <KeyValue label="Estimated deductions" value={money(b.settlementPreview.totalDeductionsPaise)} className="mt-2" />
          </Card>
        </FadeInView>
      ) : null}

      <FadeInView index={next()} className="mt-7">
        <SectionHeader title="Payment" />
        <Card className="mx-4 p-4"><PriceBreakdown p={b.pricing} showPayable={b.status === 'pending_payment'} /></Card>
        {b.refunds?.length ? (
          <Card className="mx-4 mt-3 p-4">
            <View className="mb-1 flex-row items-center">
              <RotateCcw size={16} color={colors.brand[600]} strokeWidth={2.2} />
              <T variant="label" className="ml-2">Refunds</T>
            </View>
            {b.refunds.map((r, i) => (
              <View key={r.id} className={cn('flex-row items-center py-2.5', i > 0 && 'border-t border-line')}>
                <View className="mr-3 flex-1">
                  <T variant="bodySm" className="font-semibold capitalize">{r.reason.replace(/_/g, ' ')}</T>
                  <T variant="caption" tone="subtle">{dateTime(r.createdAt)}</T>
                </View>
                <View className="items-end">
                  <T variant="bodySm" tone={r.status === 'processed' ? 'success' : 'default'} className="font-extrabold" style={{ fontVariant: ['tabular-nums'] }}>{money(r.amountPaise)}</T>
                  {REFUND_STATUS[r.status] ? <Pill label={REFUND_STATUS[r.status].label} tone={REFUND_STATUS[r.status].tone} className="mt-1 self-end" /> : null}
                </View>
              </View>
            ))}
            <View className="mt-2 rounded-xl bg-ink-50 px-3 py-2.5">
              <T variant="caption" tone="muted">Banks usually take 5–7 working days to credit refunds.</T>
            </View>
          </Card>
        ) : null}
        {b.invoices?.length ? (
          <Card className="mx-4 mt-3"><View className="overflow-hidden rounded-2xl">
            {b.invoices.map((inv, i) => (
              <ListItem key={inv.id} icon={Receipt} iconTone="neutral" title={`Invoice ${inv.number}`} subtitle={`${inv.type} · ${money(inv.totalPaise)}`} last={i === b.invoices.length - 1}
                onPress={async () => { try { await downloadPdf(`/api/v1/user/bookings/${id}/invoices/${inv.id}.pdf`, `${inv.number.replace(/\//g, '-')}.pdf`); } catch (e) { toast(e.message, 'danger'); } }} />
            ))}
          </View></Card>
        ) : null}
      </FadeInView>

      <FadeInView index={next()} className="mt-7">
        <SectionHeader title="Need help?" />
        <Card className="mx-4"><View className="overflow-hidden rounded-2xl">
          <ListItem icon={MessageSquare} title="Contact support about this trip" onPress={() => navigation.navigate('NewTicket', { bookingId: id, ref: b.ref })} />
          <ListItem icon={FileText} title="Rental agreement & policies" last={!canCancel} onPress={() => navigation.navigate('CmsPage', { slug: 'rental-agreement' })} />
          {canCancel ? <ListItem icon={XCircle} title="Cancel booking" danger last onPress={() => setSheet('cancel')} /> : null}
        </View></Card>
      </FadeInView>

      {['completed'].includes(b.status) && b.reviewed?.byUser ? (
        <View className="mx-4 mt-6 flex-row items-center justify-center">
          <Star size={14} color={colors.warning[500]} fill={colors.warning[500]} />
          <T variant="caption" tone="subtle" className="ml-1.5">Thanks for rating this trip.</T>
        </View>
      ) : null}

      <Sheet visible={sheet === 'cancel'} onClose={() => setSheet(null)} title="Cancel this booking?" footer={
        <View className="flex-row">
          <Button title="Keep booking" variant="secondary" className="mr-3 flex-1" onPress={() => setSheet(null)} />
          <Button title="Cancel booking" variant="danger" className="flex-1" loading={cancel.isPending} onPress={() => cancel.mutate()} />
        </View>
      }>
        <View className="px-5 pb-2">
          {preview.isLoading ? (
            <View className="mb-4 rounded-2xl bg-ink-50 p-4"><Skeleton className="h-4 w-3/4 bg-ink-200" /><Skeleton className="mt-3 h-3 w-1/2 bg-ink-200" /></View>
          ) : preview.data ? (
            <View className="mb-4 rounded-2xl bg-ink-50 p-4">
              <KeyValue label="Refund to your payment method" value={money(preview.data.refundToSourcePaise)} strong tone="success" />
              {preview.data.refundToWalletPaise ? <KeyValue label="Back to wallet" value={money(preview.data.refundToWalletPaise)} /> : null}
              {preview.data.cancellationFeePaise ? <KeyValue label="Cancellation fee" value={money(preview.data.cancellationFeePaise)} /> : null}
              <DashedDivider className="my-2.5" />
              <T variant="caption" tone="muted">{preview.data.refundBps === 10000 ? 'Full refund of trip charges.' : `${preview.data.refundBps / 100}% of trip charges refunded (${preview.data.hoursBeforeStart} hrs before pickup). Deposit refunded in full.`}</T>
            </View>
          ) : null}
          <Field label="Reason (optional)" value={reason} onChangeText={setReason} placeholder="Help us improve" />
        </View>
      </Sheet>

      <Sheet visible={sheet === 'extend'} onClose={() => setSheet(null)} title="Extend your trip" footer={<Button title={extendTo ? 'Check & pay' : 'Choose new return time'} size="lg" block loading={busy} onPress={extendTo ? extend : pickExtension} />}>
        <View className="px-5 pb-3">
          <View className="flex-row items-center rounded-2xl bg-ink-50 px-3.5 py-3">
            <IconTile icon={Flag} tone="neutral" size={40} />
            <View className="ml-3 flex-1">
              <T variant="caption" tone="subtle">Current return</T>
              <T variant="body" className="font-bold">{dateTime(b.endAt)}</T>
            </View>
          </View>
          <PressableScale onPress={pickExtension} accessibilityRole="button" className={cn('mt-3 flex-row items-center rounded-2xl border-2 px-3.5 py-3', extendTo ? 'border-brand-500 bg-brand-50' : 'border-dashed border-brand-300 bg-surface')}>
            <IconTile icon={Clock} tone="brand" size={40} />
            <View className="ml-3 flex-1">
              <T variant="caption" tone="subtle">{extendTo ? 'New return' : 'Extend until'}</T>
              <T variant="body" className={cn('font-bold', !extendTo && 'text-brand-700')}>{extendTo ? dateTime(extendTo) : 'Pick a new return time'}</T>
            </View>
            <T variant="label" tone="brand">Change</T>
          </PressableScale>
          <T variant="caption" tone="subtle" className="mt-3">We’ll check the car is free, then you pay only for the extra time (plus GST). Extra kilometres are added pro rata.</T>
        </View>
      </Sheet>
    </Screen>
  );
}
