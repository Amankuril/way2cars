import { View } from 'react-native';
import { T, KeyValue, DashedDivider, AnimatedNumber } from '@shared/native';
import { money, percent } from '@shared/lib/format';

/** Itemised price exactly as computed by the server. The payable total rolls when it changes. */
export function PriceBreakdown({ p, showPayable = true }) {
  return (
    <View>
      <KeyValue label={`Trip charges · ${p.hours} hrs`} value={money(p.rentalPaise)} />
      {p.discountPaise ? <KeyValue label={`Discount${p.coupon?.code ? ` (${p.coupon.code})` : p.couponCode ? ` (${p.couponCode})` : ''}`} value={money(-p.discountPaise)} tone="success" /> : null}
      {p.deliveryFeePaise ? <KeyValue label="Doorstep delivery" value={money(p.deliveryFeePaise)} /> : null}
      {p.convenienceFeePaise ? <KeyValue label="Convenience fee" value={money(p.convenienceFeePaise)} /> : null}
      <KeyValue label={`GST (${percent(p.gstBps)})`} value={money(p.gstPaise, { exact: true })} />
      <DashedDivider className="my-2.5" />
      <KeyValue label="Trip total" value={money(p.chargesPaise, { exact: true })} />
      <KeyValue label="Security deposit" hint="Refunded after the trip, minus any extra charges" value={money(p.depositPaise)} />
      {p.walletAppliedPaise ? <KeyValue label="WAY2CARS wallet" value={money(-p.walletAppliedPaise, { exact: true })} tone="success" /> : null}
      {showPayable ? (
        <>
          <DashedDivider className="my-2.5" />
          <View className="flex-row items-center justify-between py-1">
            <T variant="body" className="font-bold">To pay now</T>
            <AnimatedNumber value={money(p.payablePaise, { exact: true })} variant="headline" className="font-extrabold text-brand-700" />
          </View>
        </>
      ) : null}
      <View className="mt-3 rounded-xl bg-ink-50 px-3 py-2.5">
        <T variant="caption" tone="muted">Includes {p.includedKm} free km. Extra km at {money(p.extraKmChargePaise)}/km.</T>
      </View>
    </View>
  );
}
