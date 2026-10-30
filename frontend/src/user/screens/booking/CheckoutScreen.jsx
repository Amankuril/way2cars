import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Image, Pressable, Switch, Linking } from '@/mobile/rn';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Truck, TicketPercent, Wallet, ShieldCheck, Lock, Users, Cog, Fuel, Zap, Clock, Check, ReceiptText, X, IndianRupee, CalendarCheck, Gauge, Infinity as InfinityIcon, Bike, Laptop, Banknote, Phone, Building2 } from 'lucide-react';
import { Screen, Header, T, Button, Field, Notice, ErrorState, useToast, cn, Card, SectionHeader, SpecChip, TripRoute, IconTile, AnimatedNumber, FadeInView, PressableScale, Skeleton, SkeletonCard, Chip } from '@/mobile/ui';
import { colors } from '@shared/theme/tokens';
import { FUEL, TRANSMISSION } from '@shared/lib/labels';
import { money, duration, dateTime, percent } from '@shared/lib/format';
import { api } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { useTripPlan } from '../../hooks/useTripPlan';
import { usePublicConfig } from '../../hooks/queries';
import { TripTimesSheet, TripTimesPrompt, tripRoute } from '../../components/TripTimesSheet';
import { AddressPicker } from '../../components/AddressPicker';
import { PriceBreakdown } from '../../components/PriceBreakdown';
import { payOrder } from '../../services/payments';
import { track } from '../../services/analytics';

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

/** "₹299 + ₹15/km · up to 10 km" — the host's radius, capped by the platform limit. */
const deliveryTerms = (v, fees) => {
  const maxKm = fees?.deliveryMaxKm != null ? Math.min(v.delivery.maxKm, fees.deliveryMaxKm) : v.delivery.maxKm;
  const rate = fees?.deliveryPerKmPaise != null ? `${money(fees.deliveryBaseFeePaise)} + ${money(fees.deliveryPerKmPaise)}/km · ` : '';
  return `${rate}up to ${maxKm} km`;
};

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
  const [paymentPlan, setPaymentPlan] = useState('full');
  const [unlimitedKm, setUnlimitedKm] = useState(false);
  const [depositOption, setDepositOption] = useState('cash');
  const [collateral, setCollateral] = useState({ make: '', model: '', year: '', registrationNumber: '', serialNumber: '' });
  const [collateralError, setCollateralError] = useState(null);
  const [pickupHub, setPickupHub] = useState(null);
  const [dropoffHub, setDropoffHub] = useState(null);
  useEffect(() => { track('checkout_start', { vehicleId }); }, [vehicleId]);
  const [paying, setPaying] = useState(false);
  const [timesOpen, setTimesOpen] = useState(false);
  const config = usePublicConfig();

  // Reached without trip times (deep link / reload): ask for them once; no quote until then.
  const askedTimes = useRef(false);
  useEffect(() => {
    if (plan.hasTimes || askedTimes.current) return;
    askedTimes.current = true;
    setTimesOpen(true);
  }, [plan.hasTimes]);

  const vehicle = useQuery({ queryKey: ['vehicle-lite', vehicleId], queryFn: () => api.get(`/api/v1/public/vehicles/${vehicleId}`) });
  const hubs = useQuery({ queryKey: ['locations', vehicle.data?.city?.id], queryFn: () => api.get('/api/v1/public/locations', { cityId: vehicle.data.city.id }), enabled: Boolean(vehicle.data?.city?.id), staleTime: 10 * 60_000 });
  const body = useMemo(() => ({
    vehicleId, startAt: plan.startAt?.toISOString(), endAt: plan.endAt?.toISOString(),
    delivery: delivery ? { address: delivery.address, lat: delivery.lat, lng: delivery.lng, placeId: delivery.placeId } : undefined,
    couponCode: coupon || undefined, useWallet: useWallet && paymentPlan === 'full', paymentPlan,
    unlimitedKm, depositOption, pickupLocationId: delivery ? undefined : pickupHub || undefined, dropoffLocationId: dropoffHub || undefined,
  }), [vehicleId, plan.startAt, plan.endAt, delivery, coupon, useWallet, paymentPlan, unlimitedKm, depositOption, pickupHub, dropoffHub]);

  const quote = useQuery({
    queryKey: ['quote', body],
    queryFn: () => api.post('/api/v1/user/bookings/quote', body),
    placeholderData: (prev) => prev,
    retry: false,
    enabled: plan.hasTimes,
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
    } else if (e.code === 'UNLIMITED_KM_UNAVAILABLE') {
      setUnlimitedKm(false);
    } else if (e.code?.startsWith('HUB_')) {
      toast(e.message, 'danger');
      setPickupHub(null);
      setDropoffHub(null);
    }
  }, [quote.error]); // eslint-disable-line react-hooks/exhaustive-deps

  const kycOk = account?.kyc?.status === 'approved';
  const book = useMutation({
    mutationFn: () => api.post('/api/v1/user/bookings', { ...body, ...(depositOption !== 'cash' ? { collateral: collateralBody() } : {}) }, { headers: { 'Idempotency-Key': idempotencyKey.current } }),
  });

  const collateralBody = () => ({
    make: collateral.make.trim(), model: collateral.model.trim(), year: Number(collateral.year),
    ...(depositOption === 'bike' ? { registrationNumber: collateral.registrationNumber.trim() } : { serialNumber: collateral.serialNumber.trim() }),
  });
  const checkCollateral = () => {
    if (depositOption === 'cash') return true;
    const c = collateralBody();
    const minYear = depositOption === 'bike' ? config.data?.deposit?.bikeMinYear : config.data?.deposit?.laptopMinYear;
    let err = null;
    if (!c.make || !c.model || !c.year) err = `Enter your ${depositOption}'s make, model and year.`;
    else if (minYear && c.year < minYear) err = `The ${depositOption} must be a ${minYear} or newer model.`;
    else if (depositOption === 'bike' && !c.registrationNumber) err = "Enter the bike's registration number.";
    else if (depositOption === 'laptop' && !c.serialNumber) err = "Enter the laptop's serial number.";
    setCollateralError(err);
    return !err;
  };

  const pay = async () => {
    if (!checkCollateral()) return toast('Add your deposit details first.', 'danger');
    setPaying(true);
    try {
      const { booking, payment } = await book.mutateAsync();
      track('booking_created', { bookingId: booking.id, vehicleId, amountPaise: booking.pricing?.payablePaise });
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
  const timesSheet = (
    <TripTimesSheet visible={timesOpen} onClose={() => setTimesOpen(false)} startAt={plan.startAt} endAt={plan.endAt} minLeadMinutes={config.data?.booking?.minLeadMinutes ?? 60} minHours={config.data?.booking?.minDurationHours ?? 4} onApply={plan.setTimes} />
  );
  if (!plan.hasTimes) {
    return (
      <Screen header={<Header title="Review & pay" subtitle={v.title} />} scroll={false}>
        <FadeInView className="pt-6">
          <TripTimesPrompt message="Pick your pickup and return times to see the final price." onPress={() => setTimesOpen(true)} />
        </FadeInView>
        {timesSheet}
      </Screen>
    );
  }
  const q = quote.data;
  const unavailable = quote.error?.code === 'VEHICLE_UNAVAILABLE';
  const adv = q?.advance;
  // The advance option disappears if the trip moves too close; fall back to paying in full.
  const advanceOn = paymentPlan === 'advance' && adv?.available;
  const payNow = q ? (advanceOn ? q.advancePaise ?? adv.advancePaise : q.payablePaise) : null;

  return (
    <Screen
      header={<Header title="Review & pay" subtitle={`${duration(plan.startAt, plan.endAt)} · ${v.city?.name || ''}`} />}
      footer={
        <View>
          <View className="flex-row items-center">
            <View className="mr-3 flex-1">
              <T variant="caption" tone="subtle">To pay now</T>
              {q ? <AnimatedNumber value={money(payNow, { exact: true })} className="text-brand-700" testID="pay-total" /> : quote.isFetching ? <Skeleton className="mt-1 h-6 w-28" /> : <T variant="price" tone="subtle">—</T>}
            </View>
            <Button
              title="Pay now"
              accessibilityLabel={q ? `Pay ${money(payNow, { exact: true })}` : 'Pay'}
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
          <TripRoute {...tripRoute(plan.startAt, plan.endAt)} />
        </Card>
      </FadeInView>

      {!kycOk ? (
        <Notice tone="warning" title="Verify your licence to book" className="mx-4 mt-4" action={<Button title="Verify now" size="sm" variant="tonal" icon={ShieldCheck} onPress={() => navigation.navigate('Kyc')} />}>
          {account?.kyc?.status === 'pending' ? 'Your documents are under review. You can pay as soon as they’re approved.' : 'Upload your driving licence, ID and a selfie. It takes about 2 minutes.'}
        </Notice>
      ) : null}
      {unavailable ? <Notice tone="danger" title="BOOKED for these times" className="mx-4 mt-4">{quote.error.message}</Notice> : null}
      {quote.error?.supportPhone ? (
        <View className="mx-4 mt-2 flex-row flex-wrap">
          {quote.error.details?.nextAvailableAt ? (
            <Button size="sm" className="mb-2 mr-2" title={`Book from ${dateTime(quote.error.details.nextAvailableAt)}`} onPress={() => {
              const from = new Date(quote.error.details.nextAvailableAt);
              plan.setTimes(from, new Date(from.getTime() + (plan.endAt - plan.startAt)));
            }} />
          ) : null}
          <Button size="sm" variant="secondary" icon={Phone} className="mb-2" title={`Call ${quote.error.supportPhone}`} onPress={() => Linking.openURL(`tel:${quote.error.supportPhone}`)} />
        </View>
      ) : null}

      {/* Pickup method */}
      <View className="mt-7">
        <SectionHeader title="How do you want the car?" />
        <View className="flex-row px-4" accessibilityRole="radiogroup">
          <Option selected={!delivery} icon={MapPin} title="Self pickup" subtitle={`${v.location?.area || v.city?.name} · exact address after confirmation`} onPress={() => setDelivery(null)} testID="pickup-self" />
          {v.delivery?.enabled ? (
            <>
              <View className="w-3" />
              <Option selected={!!delivery} icon={Truck} title="Doorstep delivery" subtitle={deliveryTerms(v, config.data?.fees)} onPress={() => setPickerOpen(true)} testID="pickup-delivery" />
            </>
          ) : null}
        </View>
        {delivery ? (
          <Pressable onPress={() => setPickerOpen(true)} accessibilityRole="button" accessibilityLabel="Change delivery address" className="mx-4 mt-3 flex-row items-center rounded-2xl border border-brand-100 bg-brand-50 p-3.5 active:bg-brand-100">
            <Truck size={18} color={colors.brand[600]} />
            <View className="ml-3 flex-1">
              <T variant="caption" tone="subtle">Delivering to</T>
              <T variant="label" numberOfLines={2}>{delivery.address}</T>
              <T variant="caption" tone="muted" className="mt-0.5">
                {q?.delivery ? `${q.delivery.km} km from the car · ${money(q.delivery.feePaise)} delivery fee` : 'Calculating distance and fee…'}
              </T>
            </View>
            <T variant="label" tone="brand">Change</T>
          </Pressable>
        ) : null}
      </View>

      {/* WAY2CARS pickup / drop-off points (fleet cars) */}
      {q?.ownership === 'company' && hubs.data?.length ? (
        <View className="mt-7">
          <SectionHeader title="Pickup & drop-off point" />
          {!delivery ? (
            <>
              <T variant="caption" tone="muted" className="mx-4 mb-2">Collect the car from</T>
              <View className="flex-row flex-wrap px-4">
                <Chip label="Car’s location" selected={!pickupHub} onPress={() => setPickupHub(null)} icon={MapPin} className="mb-2" />
                {hubs.data.filter((h) => h.kinds.includes('pickup')).map((h) => <Chip key={h.id} label={h.name} selected={pickupHub === h.id} onPress={() => setPickupHub(h.id)} icon={Building2} className="mb-2" />)}
              </View>
            </>
          ) : null}
          <T variant="caption" tone="muted" className="mx-4 mb-2 mt-2">Return the car at</T>
          <View className="flex-row flex-wrap px-4">
            <Chip label="Same place" selected={!dropoffHub} onPress={() => setDropoffHub(null)} icon={MapPin} className="mb-2" />
            {hubs.data.filter((h) => h.kinds.includes('dropoff')).map((h) => <Chip key={h.id} label={h.name} selected={dropoffHub === h.id} onPress={() => setDropoffHub(h.id)} icon={Building2} className="mb-2" />)}
          </View>
          {[pickupHub, dropoffHub].filter(Boolean).map((id) => hubs.data.find((h) => h.id === id)).filter(Boolean).map((h) => (
            <T key={h.id} variant="caption" tone="subtle" className="mx-4 mt-1">{h.name}: {h.address}{h.instructions ? ` · ${h.instructions}` : ''}</T>
          ))}
        </View>
      ) : null}

      {/* Kilometres */}
      {q?.unlimitedKmOption ? (
        <View className="mt-7">
          <SectionHeader title="Kilometres" />
          <View className="flex-row px-4" accessibilityRole="radiogroup">
            <Option selected={!unlimitedKm} icon={Gauge} title={`${unlimitedKm ? Math.round((v.pricing.includedKmPerDay * q.hours) / 24) : q.includedKm} km included`} subtitle={`Then ${money(v.pricing.extraKmChargePaise)}/km`} onPress={() => setUnlimitedKm(false)} testID="km-limited" />
            <View className="w-3" />
            <Option selected={unlimitedKm} icon={InfinityIcon} title="Unlimited km" subtitle={`+${money(q.unlimitedKmOption.amountPaise)} for this trip (${money(q.unlimitedKmOption.dailyPaise)}/day)`} onPress={() => setUnlimitedKm(true)} testID="km-unlimited" />
          </View>
        </View>
      ) : null}

      {/* Security deposit */}
      {q?.depositOptions ? (
        <View className="mt-7">
          <SectionHeader title="Security deposit" />
          <View className="flex-row px-4" accessibilityRole="radiogroup">
            <Option selected={depositOption === 'cash'} icon={Banknote} title={money(q.depositOptions.cashPaise)} subtitle="Paid with your booking, refunded after the car is inspected" onPress={() => setDepositOption('cash')} testID="deposit-cash" />
            {q.depositOptions.bike ? <><View className="w-3" /><Option selected={depositOption === 'bike'} icon={Bike} title="My bike" subtitle={`${q.depositOptions.bike.minYear} or newer, good condition`} onPress={() => setDepositOption('bike')} testID="deposit-bike" /></> : null}
            {q.depositOptions.laptop ? <><View className="w-3" /><Option selected={depositOption === 'laptop'} icon={Laptop} title="My laptop" subtitle={`${q.depositOptions.laptop.minYear} or newer model`} onPress={() => setDepositOption('laptop')} testID="deposit-laptop" /></> : null}
          </View>
          {depositOption !== 'cash' ? (
            <Card className="mx-4 mt-3 p-4">
              <T variant="caption" tone="muted" className="mb-3">Bring your {depositOption} to pickup — our team checks it and you can start the trip once it’s received. It’s returned as soon as you hand back the car.</T>
              <Field label={depositOption === 'bike' ? 'Bike make' : 'Laptop brand'} placeholder={depositOption === 'bike' ? 'e.g. Honda' : 'e.g. Apple'} value={collateral.make} onChangeText={(t) => setCollateral((c) => ({ ...c, make: t }))} />
              <Field label="Model" placeholder={depositOption === 'bike' ? 'e.g. Activa 6G' : 'e.g. MacBook Air M3'} value={collateral.model} onChangeText={(t) => setCollateral((c) => ({ ...c, model: t }))} />
              <Field label="Model year" placeholder="e.g. 2023" keyboardType="number-pad" maxLength={4} value={collateral.year} onChangeText={(t) => setCollateral((c) => ({ ...c, year: t.replace(/\D/g, '') }))} />
              {depositOption === 'bike'
                ? <Field label="Registration number" placeholder="e.g. MP09AB1234" autoCapitalize="characters" value={collateral.registrationNumber} onChangeText={(t) => setCollateral((c) => ({ ...c, registrationNumber: t.toUpperCase() }))} error={collateralError} />
                : <Field label="Serial number" placeholder="On the bottom of the laptop" autoCapitalize="characters" value={collateral.serialNumber} onChangeText={(t) => setCollateral((c) => ({ ...c, serialNumber: t }))} error={collateralError} />}
            </Card>
          ) : null}
        </View>
      ) : null}

      {/* Pay in full or an advance to block the dates */}
      {adv?.available ? (
        <View className="mt-7">
          <SectionHeader title="How do you want to pay?" />
          <View className="flex-row px-4" accessibilityRole="radiogroup">
            <Option selected={!advanceOn} icon={IndianRupee} title="Pay in full" subtitle={q ? `${money(q.payablePaise)} now, nothing later` : 'Everything now'} onPress={() => setPaymentPlan('full')} testID="plan-full" />
            <View className="w-3" />
            <Option selected={advanceOn} icon={CalendarCheck} title={`Pay ${percent(adv.percentBps)} now`} subtitle={`${money(adv.advancePaise)} blocks your dates · ${money(adv.balancePaise)} by ${dateTime(adv.balanceDueAt)}`} onPress={() => setPaymentPlan('advance')} testID="plan-advance" />
          </View>
          {advanceOn ? (
            <T variant="caption" tone="subtle" className="mx-4 mt-3">Pay the balance from your trip page before {dateTime(adv.balanceDueAt)}. Pickup opens once it’s paid; an unpaid balance at pickup time cancels the booking under the cancellation policy.</T>
          ) : null}
        </View>
      ) : null}

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
          {account?.walletBalancePaise > 0 && !advanceOn ? (
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
          {q ? <PriceBreakdown p={advanceOn ? { ...q, advancePaise: payNow } : q} /> : quote.isLoading ? (
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
