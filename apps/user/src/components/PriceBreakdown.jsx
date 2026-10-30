import { View } from 'react-native';
import { T, KeyValue, DashedDivider, AnimatedNumber } from '@shared/native';
import { money, percent } from '@shared/lib/format';

/** Itemised price exactly as computed by the server. The payable total rolls when it changes. */
export function PriceBreakdown({ p, showPayable = true }) {
  return (
    <View>
      <KeyValue label={`Trip charges · ${p.hours} hrs`} hint={p.unlimitedKmPaise ? `incl. unlimited km ${money(p.unlimitedKmPaise)}` : undefined} value={money(p.rentalPaise)} />
      {p.discountPaise ? <KeyValue label={`Discount${p.coupon?.code ? ` (${p.coupon.code})` : p.couponCode ? ` (${p.couponCode})` : ''}`} value={money(-p.discountPaise)} tone="success" /> : null}
      {p.deliveryFeePaise ? <KeyValue label={`Doorstep delivery${p.delivery?.km ? ` · ${p.delivery.km} km` : ''}`} value={money(p.deliveryFeePaise)} /> : null}
      {p.convenienceFeePaise ? <KeyValue label="Convenience fee" value={money(p.convenienceFeePaise)} /> : null}
      <KeyValue label={`GST (${percent(p.gstBps)})`} value={money(p.gstPaise, { exact: true })} />
      <DashedDivider className="my-2.5" />
      <KeyValue label="Trip total" value={money(p.chargesPaise, { exact: true })} />
      <KeyValue label="Security deposit" hint={p.depositOptions?.selected && p.depositOptions.selected !== 'cash' ? `Your ${p.depositOptions.selected} is held instead — hand it over at pickup` : 'Refunded after the car is inspected, minus any extra charges'} value={money(p.depositPaise)} />
      {p.walletAppliedPaise ? <KeyValue label="WAY2CARS wallet" value={money(-p.walletAppliedPaise, { exact: true })} tone="success" /> : null}
      {showPayable ? (
        <>
          <DashedDivider className="my-2.5" />
          {p.advancePaise ? <KeyValue label="Booking total" value={money(p.payablePaise, { exact: true })} /> : null}
          <View className="flex-row items-center justify-between py-1">
            <T variant="body" className="font-bold">{p.advancePaise ? 'Advance to pay now' : 'To pay now'}</T>
            <AnimatedNumber value={money(p.advancePaise || p.payablePaise, { exact: true })} variant="headline" className="font-extrabold text-brand-700" />
          </View>
          {p.advancePaise ? <KeyValue label="Balance before pickup" hint="Includes the security deposit" value={money(p.payablePaise - p.advancePaise, { exact: true })} /> : null}
        </>
      ) : null}
      <View className="mt-3 rounded-xl bg-ink-50 px-3 py-2.5">
        <T variant="caption" tone="muted">{p.unlimitedKm ? 'Unlimited km — no extra-km charge.' : `Includes ${p.includedKm} free km. Extra km at ${money(p.extraKmChargePaise)}/km.`}</T>
      </View>
    </View>
  );
}
