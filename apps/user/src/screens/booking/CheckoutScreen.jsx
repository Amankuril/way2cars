import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Image, Pressable, Switch } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Truck, TicketPercent, Wallet, ShieldCheck, Lock } from 'lucide-react-native';
import { Screen, Header, T, Button, Section, Panel, Field, Notice, Loading, ErrorState, useToast, cn } from '@shared/native';
import { colors } from '@shared/theme/tokens';
import { money, dayLabel, timeLabel, duration } from '@shared/lib/format';
import { api } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { useTripPlan } from '../../hooks/useTripPlan';
import { AddressPicker } from '../../components/AddressPicker';
import { PriceBreakdown } from '../../components/PriceBreakdown';
import { payOrder } from '../../services/payments';

const newKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function CheckoutScreen({ route, navigation }) {
  const { vehicleId } = route.params;
  const plan = useTripPlan();
  const { account, refreshAccount } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const idempotencyKey = useRef(newKey());
  const [delivery, setDelivery] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState(null);
  const [couponError, setCouponError] = useState(null);
  const [useWallet, setUseWallet] = useState(false);
  const [paying, setPaying] = useState(false);

  const vehicle = useQuery({ queryKey: ['vehicle-lite', vehicleId], queryFn: () => api.get(`/api/v1/public/vehicles/${vehicleId}`) });
  const body = useMemo(() => ({
    vehicleId, startAt: plan.startAt.toISOString(), endAt: plan.endAt.toISOString(),
    delivery: delivery ? { address: delivery.address, lat: delivery.lat, lng: delivery.lng, placeId: delivery.placeId } : undefined,
    couponCode: coupon || undefined, useWallet,
  }), [vehicleId, plan.startAt, plan.endAt, delivery, coupon, useWallet]);

  const quote = useQuery({
    queryKey: ['quote', body],
    queryFn: () => api.post('/api/v1/user/bookings/quote', body),
    placeholderData: (prev) => prev,
    retry: false,
  });

  // A coupon or address the server rejects is removed and the reason shown.
  useEffect(() => {
    const e = quote.error;
    if (!e) return;
    if (e.code === 'COUPON_INVALID' && coupon) {
      setCouponError(e.message);
      setCoupon(null);
    } else if (e.code?.startsWith('DELIVERY') && delivery) {
      toast(e.message, 'danger');
      setDelivery(null);
    }
  }, [quote.error]); // eslint-disable-line react-hooks/exhaustive-deps

  const kycOk = account?.kyc?.status === 'approved';
  const book = useMutation({
    mutationFn: () => api.post('/api/v1/user/bookings', body, { headers: { 'Idempotency-Key': idempotencyKey.current } }),
  });

  const pay = async () => {
    setPaying(true);
    try {
      const { booking, payment } = await book.mutateAsync();
      qc.invalidateQueries({ queryKey: ['trips'] });
      const order = payment || (await api.post(`/api/v1/user/bookings/${booking.id}/payment-order`));
      const r = await payOrder(order);
      qc.invalidateQueries({ queryKey: ['trips'] });
      if (r.status === 'paid' || r.status === 'processing') {
        toast(r.status === 'paid' ? 'Payment received' : 'Payment is being confirmed', 'success');
        refreshAccount().catch(() => {});
      } else {
        toast(r.message, r.status === 'cancelled' ? 'neutral' : 'danger');
      }
      navigation.reset({ index: 1, routes: [{ name: 'Main', params: { screen: 'Trips' } }, { name: 'Trip', params: { id: booking.id } }] });
    } catch (e) {
      if (e.code === 'VEHICLE_UNAVAILABLE' || e.code === 'USER_OVERLAP') {
        toast(e.message, 'danger');
        idempotencyKey.current = newKey();
      } else if (e.code === 'KYC_REQUIRED') navigation.navigate('Kyc');
      else toast(e.message, 'danger');
    } finally {
      setPaying(false);
    }
  };

  if (vehicle.isLoading) return <Screen header={<Header title="Review & pay" />} scroll={false}><Loading /></Screen>;
  if (vehicle.error) return <Screen header={<Header title="Review & pay" />} scroll={false}><ErrorState error={vehicle.error} onRetry={vehicle.refetch} /></Screen>;
  const v = vehicle.data;
  const q = quote.data;
  const unavailable = quote.error?.code === 'VEHICLE_UNAVAILABLE';

  return (
    <Screen
      header={<Header title="Review & pay" />}
      footer={
        <View>
          <Button
            title={q ? `Pay ${money(q.payablePaise, { exact: true })}` : 'Pay'}
            icon={Lock}
            size="lg"
            block
            disabled={!q || !kycOk || unavailable || quote.isFetching}
            loading={paying}
            onPress={pay}
            testID="pay"
          />
          <T variant="caption" tone="subtle" className="mt-2 text-center">Secured by Razorpay · UPI, cards, net banking & wallets</T>
        </View>
      }
    >
      {/* Summary */}
      <View className="mx-4 mt-4 flex-row rounded-lg border border-line bg-surface p-3">
        {v.photos?.[0] ? <Image source={{ uri: v.photos[0] }} style={{ width: 96, height: 64, borderRadius: 8 }} /> : null}
        <View className="ml-3 flex-1">
          <T variant="body" className="font-bold" numberOfLines={1}>{v.title}</T>
          <T variant="caption" tone="muted">{dayLabel(plan.startAt)}, {timeLabel(plan.startAt)} → {dayLabel(plan.endAt)}, {timeLabel(plan.endAt)}</T>
          <T variant="caption" tone="subtle">{duration(plan.startAt, plan.endAt)} · {v.instantBooking ? 'Confirms instantly' : 'Host confirms within 2 hrs'}</T>
        </View>
      </View>

      {!kycOk ? (
        <Notice tone="warning" title="Verify your licence to book" className="mx-4 mt-4" action={<Button title="Verify now" size="sm" variant="tonal" icon={ShieldCheck} onPress={() => navigation.navigate('Kyc')} />}>
          {account?.kyc?.status === 'pending' ? 'Your documents are under review. You can pay as soon as they’re approved.' : 'Upload your driving licence, ID and a selfie. It takes about 2 minutes.'}
        </Notice>
      ) : null}
      {unavailable ? <Notice tone="danger" title="No longer available" className="mx-4 mt-4">{quote.error.message}</Notice> : null}

      <Section title="Pickup">
        <Panel padded={false}>
          <Pressable onPress={() => setDelivery(null)} className={cn('flex-row items-center p-4', v.delivery?.enabled && 'border-b border-line')} accessibilityRole="radio" accessibilityState={{ checked: !delivery }}>
            <MapPin size={20} color={colors.ink[600]} />
            <View className="ml-3 flex-1"><T variant="label">Pick up from host</T><T variant="caption" tone="muted">{v.location?.area || v.city?.name} · exact address after confirmation</T></View>
            <View className={cn('h-5 w-5 rounded-full border-2', !delivery ? 'border-brand-500 bg-brand-500' : 'border-ink-300')} />
          </Pressable>
          {v.delivery?.enabled ? (
            <Pressable onPress={() => setPickerOpen(true)} className="flex-row items-center p-4" accessibilityRole="radio" accessibilityState={{ checked: !!delivery }}>
              <Truck size={20} color={colors.ink[600]} />
              <View className="ml-3 flex-1">
                <T variant="label">Doorstep delivery</T>
                <T variant="caption" tone="muted" numberOfLines={2}>{delivery ? delivery.address : `Within ${v.delivery.maxKm} km · fee based on distance`}</T>
              </View>
              <View className={cn('h-5 w-5 rounded-full border-2', delivery ? 'border-brand-500 bg-brand-500' : 'border-ink-300')} />
            </Pressable>
          ) : null}
        </Panel>
      </Section>

      <Section title="Offers & credits">
        <Panel>
          {coupon ? (
            <View className="flex-row items-center">
              <TicketPercent size={20} color={colors.success[600]} />
              <View className="ml-3 flex-1"><T variant="label">{coupon} applied</T>{q?.discountPaise ? <T variant="caption" tone="success">You save {money(q.discountPaise)}</T> : null}</View>
              <Button title="Remove" variant="ghost" size="sm" onPress={() => setCoupon(null)} />
            </View>
          ) : (
            <View className="flex-row items-start">
              <Field className="mb-0 flex-1" placeholder="Coupon code" value={couponInput} onChangeText={(t) => { setCouponInput(t.toUpperCase()); setCouponError(null); }} autoCapitalize="characters" error={couponError} />
              <Button title="Apply" variant="secondary" className="ml-2" disabled={couponInput.trim().length < 4} onPress={() => { setCouponError(null); setCoupon(couponInput.trim()); }} />
            </View>
          )}
          {account?.walletBalancePaise > 0 ? (
            <View className="mt-4 flex-row items-center border-t border-line pt-4">
              <Wallet size={20} color={colors.ink[600]} />
              <View className="ml-3 flex-1"><T variant="label">Use wallet credit</T><T variant="caption" tone="muted">Balance {money(account.walletBalancePaise)}</T></View>
              <Switch value={useWallet} onValueChange={setUseWallet} trackColor={{ true: colors.brand[300], false: colors.ink[200] }} thumbColor={useWallet ? colors.brand[500] : '#fff'} />
            </View>
          ) : null}
        </Panel>
      </Section>

      <Section title="Price details">
        <Panel>
          {q ? <PriceBreakdown p={q} /> : quote.isLoading ? <Loading full={false} /> : quote.error && !unavailable ? <ErrorState error={quote.error} onRetry={quote.refetch} /> : null}
        </Panel>
        <T variant="caption" tone="subtle" className="mx-4 mt-3">
          By paying you accept the rental agreement and{' '}
          <T variant="caption" tone="brand" onPress={() => navigation.navigate('CmsPage', { slug: 'cancellation-policy' })}>cancellation policy</T>. Your booking is held for 15 minutes while you pay.
        </T>
      </Section>

      <AddressPicker visible={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={setDelivery} />
    </Screen>
  );
}
