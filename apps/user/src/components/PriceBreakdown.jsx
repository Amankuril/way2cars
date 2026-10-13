import { View } from 'react-native';
import { T, KeyValue, Divider } from '@shared/native';
import { money, percent } from '@shared/lib/format';

/** Itemised price exactly as computed by the server. */
export function PriceBreakdown({ p, showPayable = true }) {
  return (
    <View>
      <KeyValue label={`Trip charges · ${p.hours} hrs`} value={money(p.rentalPaise)} />
      {p.discountPaise ? <KeyValue label={`Discount${p.coupon?.code ? ` (${p.coupon.code})` : p.couponCode ? ` (${p.couponCode})` : ''}`} value={money(-p.discountPaise)} tone="success" /> : null}
      {p.deliveryFeePaise ? <KeyValue label="Doorstep delivery" value={money(p.deliveryFeePaise)} /> : null}
      {p.convenienceFeePaise ? <KeyValue label="Convenience fee" value={money(p.convenienceFeePaise)} /> : null}
      <KeyValue label={`GST (${percent(p.gstBps)})`} value={money(p.gstPaise, { exact: true })} />
      <Divider className="my-2" />
      <KeyValue label="Trip total" value={money(p.chargesPaise, { exact: true })} />
      <KeyValue label="Security deposit" hint="Refunded after the trip, minus any extra charges" value={money(p.depositPaise)} />
      {p.walletAppliedPaise ? <KeyValue label="WAY2CARS wallet" value={money(-p.walletAppliedPaise, { exact: true })} tone="success" /> : null}
      {showPayable ? (
        <>
          <Divider className="my-2" />
          <KeyValue label="To pay now" value={money(p.payablePaise, { exact: true })} strong />
        </>
      ) : null}
      <T variant="caption" tone="subtle" className="mt-2">Includes {p.includedKm} free km. Extra km at {money(p.extraKmChargePaise)}/km.</T>
    </View>
  );
}
