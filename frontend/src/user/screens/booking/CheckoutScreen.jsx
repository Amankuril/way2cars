import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Image, Pressable, Switch } from '@/mobile/rn';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Truck, TicketPercent, Wallet, ShieldCheck, Lock, Users, Cog, Fuel, Zap, Clock, Check, ReceiptText, X } from 'lucide-react';
import { Screen, Header, T, Button, Field, Notice, ErrorState, useToast, cn, Card, SectionHeader, SpecChip, TripRoute, IconTile, AnimatedNumber, FadeInView, PressableScale, Skeleton, SkeletonCard } from '@/mobile/ui';
import { colors } from '@shared/theme/tokens';
import { FUEL, TRANSMISSION } from '@shared/lib/labels';
import { money, dayLabel, timeLabel, duration } from '@shared/lib/format';
import { api } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { useTripPlan } from '../../hooks/useTripPlan';
import { AddressPicker } from '../../components/AddressPicker';
import { PriceBreakdown } from '../../components/PriceBreakdown';
import { payOrder } from '../../services/payments';

const newKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Selectable pickup-method tile (radio). */
const Option = ({ selected, icon, title, subtitle, onPress, testID }) => (
  <PressableScale onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: selected }} testID={testID} containerStyle={{ flex: 1 }} className={cn('flex-1 rounded-2xl border-2 p-3.5', selected ? 'border-brand-500 bg-brand-50' : 'border-ink-100 bg-surface')}>
    <View className="flex-row items-start justify-between">
      <IconTile icon={icon} tone={selected ? 'brand' : 'neutral'} size={38} />
      <View className={cn('h-5 w-5 items-center justify-center rounded-full border-2', selected ? 'border-brand-500 bg-brand-500' : 'border-ink-300')}>
        {selected ? <Check size={12} color="#fff" strokeWidth={3.4} /> : null}
      </View>
    </View>
    <T variant="label" className="mt-2.5">{title}</T>
    <T variant="caption" tone="muted" className="mt-0.5" numberOfLines={3}>{subtitle}</T>
  </PressableScale>
);

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

  if (vehicle.isLoading) {
    return (
      <Screen header={<Header title="Review & pay" />}>
        <View className="pt-4"><SkeletonCard height={110} /><SkeletonCard height={130} className="mt-4" /><SkeletonCard height={150} className="mt-4" /></View>
      </Screen>
    );
  }
  if (vehicle.error) return <Screen header={<Header title="Review & pay" />} scroll={false}><ErrorState error={vehicle.error} onRetry={vehicle.refetch} /></Screen>;
  const v = vehicle.data;
  const q = quote.data;
  const unavailable = quote.error?.code === 'VEHICLE_UNAVAILABLE';

  return (
    <Screen
      header={<Header title="Review & pay" subtitle={`${duration(plan.startAt, plan.endAt)} · ${v.city?.name || ''}`} />}
      footer={
        <View>
          <View className="flex-row items-center">
            <View className="mr-3 flex-1">
              <T variant="caption" tone="subtle">To pay now</T>
              {q ? <AnimatedNumber value={money(q.payablePaise, { exact: true })} className="text-brand-700" testID="pay-total" /> : quote.isFetching ? <Skeleton className="mt-1 h-6 w-28" /> : <T variant="price" tone="subtle">—</T>}
            </View>
            <Button
              title="Pay now"
              accessibilityLabel={q ? `Pay ${money(q.payablePaise, { exact: true })}` : 'Pay'}
              icon={Lock}
              size="lg"
              disabled={!q || !kycOk || unavailable || quote.isFetching}
              loading={paying}
              onPress={pay}
              testID="pay"
              className="min-w-[150px]"
            />
          </View>
          <View className="mt-2 flex-row items-center justify-center">
            <ShieldCheck size={12} color={colors.success[600]} />
            <T variant="caption" tone="subtle" className="ml-1">Secured by Razorpay · UPI, cards, net banking & wallets</T>
          </View>
        </View>
      }
    >
      {/* Car summary */}
      <FadeInView className="mx-4 mt-4">
        <Card className="flex-row p-3">
          <View className="overflow-hidden rounded-xl bg-ink-100" style={{ width: 104, height: 78 }}>
            {v.photos?.[0] ? <Image source={{ uri: v.photos[0] }} style={{ width: 104, height: 78 }} resizeMode="cover" /> : null}
          </View>
          <View className="ml-3 flex-1">
            <T variant="body" className="font-extrabold" numberOfLines={1}>{v.title}</T>
            <View className="mt-1.5 flex-row flex-wrap">
              <SpecChip icon={Users} label={`${v.seats}`} />
              <SpecChip icon={Cog} label={TRANSMISSION[v.transmission]} />
              <SpecChip icon={v.fuelType === 'electric' ? Zap : Fuel} label={FUEL[v.fuelType]} />
            </View>
            <View className="flex-row items-center">
              {v.instantBooking ? <Zap size={12} color={colors.brand[600]} fill={colors.brand[600]} /> : <Clock size={12} color={colors.ink[500]} />}
              <T variant="caption" className={cn('ml-1 font-semibold', v.instantBooking ? 'text-brand-700' : 'text-ink-600')}>{v.instantBooking ? 'Confirms instantly' : 'Host confirms within 2 hrs'}</T>
            </View>
          </View>
        </Card>
      </FadeInView>

      {/* Trip */}
      <FadeInView index={1} className="mx-4 mt-4">
        <Card className="p-4">
          <View className="mb-3 flex-row items-center border-b border-line pb-3">
            <MapPin size={16} color={colors.brand[600]} />
            <T variant="label" className="ml-2 flex-1" numberOfLines={1}>{[v.location?.area, v.city?.name].filter(Boolean).join(', ')}</T>
          </View>
          <TripRoute
            start={{ overline: 'Pickup', title: dayLabel(plan.startAt), subtitle: timeLabel(plan.startAt) }}
            end={{ overline: 'Return', title: dayLabel(plan.endAt), subtitle: timeLabel(plan.endAt) }}
            label={duration(plan.startAt, plan.endAt)}
          />
        </Card>
      </FadeInView>

      {!kycOk ? (
        <Notice tone="warning" title="Verify your licence to book" className="mx-4 mt-4" action={<Button title="Verify now" size="sm" variant="tonal" icon={ShieldCheck} onPress={() => navigation.navigate('Kyc')} />}>
          {account?.kyc?.status === 'pending' ? 'Your documents are under review. You can pay as soon as they’re approved.' : 'Upload your driving licence, ID and a selfie. It takes about 2 minutes.'}
        </Notice>
      ) : null}
      {unavailable ? <Notice tone="danger" title="No longer available" className="mx-4 mt-4">{quote.error.message}</Notice> : null}

      {/* Pickup method */}
      <View className="mt-7">
        <SectionHeader title="How do you want the car?" />
        <View className="flex-row px-4" accessibilityRole="radiogroup">
          <Option selected={!delivery} icon={MapPin} title="Self pickup" subtitle={`${v.location?.area || v.city?.name} · exact address after confirmation`} onPress={() => setDelivery(null)} testID="pickup-self" />
          {v.delivery?.enabled ? (
            <>
              <View className="w-3" />
              <Option selected={!!delivery} icon={Truck} title="Doorstep delivery" subtitle={`Within ${v.delivery.maxKm} km · fee based on distance`} onPress={() => setPickerOpen(true)} testID="pickup-delivery" />
            </>
          ) : null}
        </View>
        {delivery ? (
          <Pressable onPress={() => setPickerOpen(true)} accessibilityRole="button" accessibilityLabel="Change delivery address" className="mx-4 mt-3 flex-row items-center rounded-2xl border border-brand-100 bg-brand-50 p-3.5 active:bg-brand-100">
            <Truck size={18} color={colors.brand[600]} />
            <View className="ml-3 flex-1">
              <T variant="caption" tone="subtle">Delivering to</T>
              <T variant="label" numberOfLines={2}>{delivery.address}</T>
            </View>
            <T variant="label" tone="brand">Change</T>
          </Pressable>
        ) : null}
      </View>

      {/* Offers & credits */}
      <View className="mt-7">
        <SectionHeader title="Offers & credits" actionLabel="View all coupons" onAction={() => navigation.navigate('Offers')} />
        <Card className="mx-4 p-4">
          {coupon ? (
            <View className="flex-row items-center overflow-hidden rounded-xl border border-dashed border-success-500 bg-success-50 p-3">
              <IconTile icon={TicketPercent} tone="success" size={38} />
              <View className="ml-3 flex-1">
                <T variant="label" className="tracking-wider">{coupon} applied</T>
                {q?.discountPaise ? <T variant="caption" tone="success" className="font-semibold">You save {money(q.discountPaise)}</T> : null}
              </View>
              <Pressable onPress={() => setCoupon(null)} accessibilityRole="button" accessibilityLabel="Remove coupon" className="h-11 w-11 items-center justify-center rounded-full active:bg-success-100">
                <X size={18} color={colors.ink[600]} />
              </Pressable>
            </View>
          ) : (
            <View className="flex-row items-start">
              <Field className="mb-0 flex-1" placeholder="Coupon code" value={couponInput} onChangeText={(t) => { setCouponInput(t.toUpperCase()); setCouponError(null); }} autoCapitalize="characters" error={couponError} />
              <Button title="Apply" variant="tonal" className="ml-2" disabled={couponInput.trim().length < 4} onPress={() => { setCouponError(null); setCoupon(couponInput.trim()); }} />
            </View>
          )}
          {account?.walletBalancePaise > 0 ? (
            <View className="mt-4 flex-row items-center border-t border-line pt-4">
              <IconTile icon={Wallet} tone="accent" size={38} />
              <View className="ml-3 flex-1"><T variant="label">Use wallet credit</T><T variant="caption" tone="muted">Balance {money(account.walletBalancePaise)}</T></View>
              <Switch value={useWallet} onValueChange={setUseWallet} trackColor={{ true: colors.brand[300], false: colors.ink[200] }} thumbColor={useWallet ? colors.brand[500] : '#fff'} />
            </View>
          ) : null}
        </Card>
      </View>

      {/* Price */}
      <View className="mt-7">
        <SectionHeader title="Payment details" />
        <Card className="mx-4 p-4">
          <View className="mb-2 flex-row items-center">
            <ReceiptText size={16} color={colors.brand[600]} />
            <T variant="label" className="ml-2">Price breakdown</T>
          </View>
          {q ? <PriceBreakdown p={q} /> : quote.isLoading ? (
            <View>{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="mb-2.5 h-4 w-full" />)}</View>
          ) : quote.error && !unavailable ? <ErrorState error={quote.error} onRetry={quote.refetch} /> : null}
        </Card>
        <T variant="caption" tone="subtle" className="mx-4 mt-3">
          By paying you accept the rental agreement and{' '}
          <T variant="caption" tone="brand" onPress={() => navigation.navigate('CmsPage', { slug: 'cancellation-policy' })}>cancellation policy</T>. Your booking is held for 15 minutes while you pay.
        </T>
      </View>

      <AddressPicker visible={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={setDelivery} />
    </Screen>
  );
}
