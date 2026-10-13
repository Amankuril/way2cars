import { useState } from 'react';
import { View, Image, Linking, Pressable } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Phone, Navigation, CarFront, KeyRound, CalendarPlus, LifeBuoy, FileText, Star, XCircle, Clock, MessageSquare, Receipt } from 'lucide-react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Screen, Header, T, Button, Section, Panel, KeyValue, Divider, Pill, Notice, Loading, ErrorState, Sheet, ListItem, useToast, Field } from '@shared/native';
import { colors } from '@shared/theme/tokens';
import { money, dateTime, dayLabel, timeLabel, duration } from '@shared/lib/format';
import { BOOKING_STATUS, REFUND_STATUS } from '@shared/lib/labels';
import { api } from '../../api';
import { usePublicConfig } from '../../hooks/queries';
import { useCountdown, mmss } from '../../hooks/useCountdown';
import { PriceBreakdown } from '../../components/PriceBreakdown';
import { payOrder } from '../../services/payments';
import { downloadPdf } from '../../services/files';

const roundHalf = (d) => new Date(Math.ceil(d.getTime() / 1800000) * 1800000);

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

  if (q.isLoading) return <Screen header={<Header title="Trip" />} scroll={false}><Loading /></Screen>;
  if (q.error) return <Screen header={<Header title="Trip" />} scroll={false}><ErrorState error={q.error} onRetry={q.refetch} /></Screen>;
  const b = q.data;
  const s = BOOKING_STATUS[b.status];
  const now = Date.now();
  const pickupOpensAt = new Date(new Date(b.startAt).getTime() - (config.data?.booking?.pickupWindowMinutesBefore ?? 30) * 60000);
  const canStart = b.status === 'confirmed' && now >= pickupOpensAt.getTime();
  const pendingExt = b.extensions?.find((e) => e.status === 'pending_payment' && new Date(e.holdExpiresAt) > new Date());
  const st = b.settlement;

  let primary = null;
  if (b.status === 'pending_payment' && holdLeft > 0) primary = <Button title={`Complete payment · ${mmss(holdLeft)}`} size="lg" block loading={busy} onPress={() => runPayment(() => api.post(`/api/v1/user/bookings/${id}/payment-order`))} />;
  else if (b.status === 'confirmed') primary = <Button title={canStart ? 'Start trip' : `Pickup opens ${timeLabel(pickupOpensAt)}`} icon={KeyRound} size="lg" block disabled={!canStart} onPress={() => navigation.navigate('Pickup', { id })} />;
  else if (b.status === 'ongoing') primary = <Button title="End trip & return car" size="lg" block onPress={() => navigation.navigate('Return', { id })} />;
  else if (b.status === 'completed' && st?.outstandingStatus === 'due') primary = <Button title={`Pay dues ${money(st.outstandingPaise)}`} size="lg" block loading={busy} onPress={() => runPayment(() => api.post(`/api/v1/user/bookings/${id}/settlement-payment-order`))} />;
  else if (b.status === 'completed' && !b.reviewed?.byUser) primary = <Button title="Rate your trip" icon={Star} size="lg" block variant="secondary" onPress={() => navigation.navigate('Review', { id, title: b.vehicle.title })} />;

  return (
    <Screen header={<Header title={b.vehicle.title} subtitle={`Ref ${b.ref}`} />} footer={primary} refreshing={q.isRefetching} onRefresh={q.refetch}>
      <View className="mx-4 mt-4 overflow-hidden rounded-lg border border-line bg-surface">
        {b.vehicle.photoUrl ? <Image source={{ uri: b.vehicle.photoUrl }} style={{ height: 150 }} resizeMode="cover" /> : null}
        <View className="p-4">
          <Pill label={s.label} tone={s.tone} />
          <View className="mt-3 flex-row">
            <View className="flex-1"><T variant="overline" tone="subtle">Pickup</T><T variant="body" className="mt-1 font-bold">{dayLabel(b.startAt)}</T><T variant="bodySm" tone="muted">{timeLabel(b.startAt)}</T></View>
            <View className="flex-1 items-end"><T variant="overline" tone="subtle">Return</T><T variant="body" className="mt-1 font-bold">{dayLabel(b.endAt)}</T><T variant="bodySm" tone="muted">{timeLabel(b.endAt)}</T></View>
          </View>
          <T variant="caption" tone="subtle" className="mt-2">{duration(b.startAt, b.endAt)} · {b.vehicle.registrationNumber && ['confirmed', 'ongoing', 'return_pending', 'completed'].includes(b.status) ? b.vehicle.registrationNumber : `${b.pricing.includedKm} km included`}</T>
        </View>
      </View>

      {/* State-specific guidance */}
      <View className="mx-4 mt-4">
        {b.status === 'pending_payment' && holdLeft > 0 ? <Notice tone="warning" title="Payment pending">Complete payment within {mmss(holdLeft)} to keep this car. If money was deducted, we’ll confirm automatically.</Notice> : null}
        {b.status === 'pending_payment' && holdLeft === 0 ? <Notice tone="neutral" title="Hold expired">This booking will be released shortly. If you paid, it will be confirmed or refunded automatically.</Notice> : null}
        {b.status === 'pending_vendor_approval' ? <Notice tone="info" title="Waiting for the host">The host will confirm by {dateTime(b.vendorDecisionDueAt)}. If they can’t, you get a full refund automatically.</Notice> : null}
        {b.status === 'return_pending' ? <Notice tone="info" title="Return under review">The host is checking the car. Your deposit refund is calculated after their review.</Notice> : null}
        {['cancelled', 'rejected'].includes(b.status) && b.cancellation ? <Notice tone="neutral" title={b.status === 'rejected' ? 'Declined by host' : 'Cancelled'}>{b.cancellation.reason}{b.cancellation.refundPaise ? ` · Refund of ${money(b.cancellation.refundPaise)} to your payment method.` : ''}{b.cancellation.walletRefundPaise ? ` ${money(b.cancellation.walletRefundPaise)} returned to wallet.` : ''}</Notice> : null}
        {pendingExt ? <Notice tone="warning" title="Extension awaiting payment" action={<Button title={`Pay ${money(pendingExt.pricing.totalPaise)}`} size="sm" loading={busy} onPress={() => runPayment(() => api.post(`/api/v1/user/bookings/${id}/extensions/${pendingExt.id}/payment-order`))} />}>Extension to {dateTime(pendingExt.requestedEndAt)} is reserved until {timeLabel(pendingExt.holdExpiresAt)}.</Notice> : null}
      </View>

      {['confirmed', 'ongoing', 'return_pending'].includes(b.status) ? (
        <Section title="Pickup & host">
          <Panel padded={false}>
            <ListItem icon={Navigation} title={b.pickup?.type === 'doorstep' ? 'Doorstep delivery' : 'Pickup location'} subtitle={b.pickup?.address || 'Shared after confirmation'} onPress={b.pickup?.point ? () => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${b.pickup.point.lat},${b.pickup.point.lng}`) : undefined} />
            {b.host ? <ListItem icon={Phone} title={b.host.name} subtitle="Call your host" last onPress={() => Linking.openURL(`tel:+91${b.host.phone}`)} /> : null}
          </Panel>
        </Section>
      ) : null}

      {['confirmed', 'ongoing'].includes(b.status) || ['pending_payment', 'pending_vendor_approval'].includes(b.status) ? (
        <Section title="Manage">
          <Panel padded={false}>
            {['confirmed', 'ongoing'].includes(b.status) ? <ListItem icon={CalendarPlus} title="Extend trip" subtitle="Subject to availability" onPress={() => { setExtendTo(null); setSheet('extend'); }} /> : null}
            {b.status === 'ongoing' ? <ListItem icon={LifeBuoy} title="Roadside assistance" subtitle="Breakdown, flat tyre, accident" onPress={() => navigation.navigate('Roadside', { bookingId: id })} /> : null}
            {['pending_payment', 'pending_vendor_approval', 'confirmed'].includes(b.status) ? <ListItem icon={XCircle} title="Cancel booking" danger last onPress={() => setSheet('cancel')} /> : null}
          </Panel>
        </Section>
      ) : null}

      {b.settlement ? (
        <Section title="Trip settlement">
          <Panel>
            <KeyValue label="Distance driven" value={`${st.kmDriven} km`} />
            {st.extraKmPaise ? <KeyValue label={`Extra ${st.extraKm} km`} value={money(st.extraKmPaise)} /> : null}
            {st.fuelPaise ? <KeyValue label={`Fuel shortfall (${st.fuelShortEighths}/8 tank)`} value={money(st.fuelPaise)} /> : null}
            {st.lateFeePaise ? <KeyValue label={`Late return (${st.lateHours} h)`} value={money(st.lateFeePaise)} /> : null}
            {st.damagePaise ? <KeyValue label="Damage charges" hint={st.damageNote} value={money(st.damagePaise)} /> : null}
            <Divider className="my-2" />
            <KeyValue label="Deposit refund" value={money(st.depositRefundPaise)} strong tone="success" />
            {st.outstandingPaise ? <KeyValue label="Amount due" value={money(st.outstandingPaise)} strong tone={st.outstandingStatus === 'paid' ? 'success' : 'danger'} hint={st.outstandingStatus === 'paid' ? 'Paid' : st.outstandingStatus === 'waived' ? 'Waived' : undefined} /> : null}
          </Panel>
        </Section>
      ) : b.settlementPreview ? (
        <Section title="Estimated settlement">
          <Panel>
            <KeyValue label="Distance driven" value={`${b.settlementPreview.kmDriven} km`} />
            <KeyValue label="Estimated deductions" value={money(b.settlementPreview.totalDeductionsPaise)} />
            <KeyValue label="Estimated deposit refund" value={money(b.settlementPreview.depositRefundPaise)} strong />
            <T variant="caption" tone="subtle" className="mt-1">Final after the host reviews the car.</T>
          </Panel>
        </Section>
      ) : null}

      <Section title="Payment">
        <Panel><PriceBreakdown p={b.pricing} showPayable={b.status === 'pending_payment'} /></Panel>
        {b.refunds?.length ? (
          <Panel className="mt-3">
            <T variant="label" className="mb-1">Refunds</T>
            {b.refunds.map((r) => <KeyValue key={r.id} label={`${r.reason.replace(/_/g, ' ')} · ${dateTime(r.createdAt)}`} hint={REFUND_STATUS[r.status]?.label} value={money(r.amountPaise)} tone={r.status === 'processed' ? 'success' : undefined} />)}
            <T variant="caption" tone="subtle" className="mt-1">Banks usually take 5–7 working days to credit refunds.</T>
          </Panel>
        ) : null}
        {b.invoices?.length ? (
          <Panel padded={false} className="mt-3">
            {b.invoices.map((inv, i) => (
              <ListItem key={inv.id} icon={Receipt} iconTone="neutral" title={`Invoice ${inv.number}`} subtitle={`${inv.type} · ${money(inv.totalPaise)}`} last={i === b.invoices.length - 1}
                onPress={async () => { try { await downloadPdf(`/api/v1/user/bookings/${id}/invoices/${inv.id}.pdf`, `${inv.number.replace(/\//g, '-')}.pdf`); } catch (e) { toast(e.message, 'danger'); } }} />
            ))}
          </Panel>
        ) : null}
      </Section>

      <Section title="Need help?">
        <Panel padded={false}>
          <ListItem icon={MessageSquare} title="Contact support about this trip" onPress={() => navigation.navigate('NewTicket', { bookingId: id, ref: b.ref })} />
          <ListItem icon={FileText} title="Rental agreement & policies" last onPress={() => navigation.navigate('CmsPage', { slug: 'rental-agreement' })} />
        </Panel>
      </Section>

      <Sheet visible={sheet === 'cancel'} onClose={() => setSheet(null)} title="Cancel this booking?" footer={
        <View className="flex-row">
          <Button title="Keep booking" variant="secondary" className="mr-3 flex-1" onPress={() => setSheet(null)} />
          <Button title="Cancel booking" variant="danger" className="flex-1" loading={cancel.isPending} onPress={() => cancel.mutate()} />
        </View>
      }>
        <View className="px-5 pb-2">
          {preview.isLoading ? <Loading full={false} /> : preview.data ? (
            <View className="mb-3 rounded-md bg-ink-50 p-3">
              <KeyValue label="Refund to your payment method" value={money(preview.data.refundToSourcePaise)} strong />
              {preview.data.refundToWalletPaise ? <KeyValue label="Back to wallet" value={money(preview.data.refundToWalletPaise)} /> : null}
              {preview.data.cancellationFeePaise ? <KeyValue label="Cancellation fee" value={money(preview.data.cancellationFeePaise)} /> : null}
              <T variant="caption" tone="subtle" className="mt-1">{preview.data.refundBps === 10000 ? 'Full refund of trip charges.' : `${preview.data.refundBps / 100}% of trip charges refunded (${preview.data.hoursBeforeStart} hrs before pickup). Deposit refunded in full.`}</T>
            </View>
          ) : null}
          <Field label="Reason (optional)" value={reason} onChangeText={setReason} placeholder="Help us improve" />
        </View>
      </Sheet>

      <Sheet visible={sheet === 'extend'} onClose={() => setSheet(null)} title="Extend your trip" footer={<Button title={extendTo ? 'Check & pay' : 'Choose new return time'} block loading={busy} onPress={extendTo ? extend : pickExtension} />}>
        <View className="px-5 pb-3">
          <KeyValue label="Current return" value={dateTime(b.endAt)} />
          <Pressable onPress={pickExtension} className="mt-3 flex-row items-center rounded-md border border-ink-200 p-3 active:bg-ink-50">
            <Clock size={18} color={colors.brand[600]} />
            <T variant="label" className="ml-3 flex-1">{extendTo ? `New return: ${dateTime(extendTo)}` : 'Pick a new return time'}</T>
            <T variant="label" tone="brand">Change</T>
          </Pressable>
          <T variant="caption" tone="subtle" className="mt-3">We’ll check the car is free, then you pay only for the extra time (plus GST). Extra kilometres are added pro rata.</T>
        </View>
      </Sheet>
      {['completed'].includes(b.status) && b.reviewed?.byUser ? <View className="mx-4 mt-6 flex-row items-center"><CarFront size={16} color={colors.ink[400]} /><T variant="caption" tone="subtle" className="ml-2">Thanks for rating this trip.</T></View> : null}
    </Screen>
  );
}
