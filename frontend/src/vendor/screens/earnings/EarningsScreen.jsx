import { useState } from 'react';
import { View } from '@/mobile/rn';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from '@/mobile/nav';
import { useCallback } from 'react';
import { ArrowDownToLine, History, ListOrdered, Landmark } from 'lucide-react';
import { Screen, T, Button, Section, Panel, ListItem, KeyValue, Sheet, Field, Notice, Loading, ErrorState, useToast } from '@/mobile/ui';
import { money } from '../../lib';
import { api } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { useEarnings } from '../../hooks/queries';

const monthLabel = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleString('en-IN', { month: 'short' });

/** Simple bar chart drawn with Views (last 6 months of trip earnings). */
function MonthlyBars({ data }) {
  const rows = data.slice(-6);
  const max = Math.max(...rows.map((r) => r.earnedPaise), 1);
  if (!rows.length) return <T variant="bodySm" tone="subtle">Earnings appear here after your first completed trip.</T>;
  return (
    <View className="h-36 flex-row items-end">
      {rows.map((r) => (
        <View key={r.month} className="flex-1 items-center">
          <T variant="caption" tone="subtle" className="mb-1 text-[10px]">{money(r.earnedPaise).replace('₹', '₹')}</T>
          <View className="w-7 rounded-t-sm bg-brand-500" style={{ height: Math.max(4, (r.earnedPaise / max) * 92) }} />
          <T variant="caption" tone="muted" className="mt-1">{monthLabel(r.month)}</T>
        </View>
      ))}
    </View>
  );
}

export function EarningsScreen({ navigation }) {
  const { account } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useEarnings();
  const bank = useQuery({ queryKey: ['vendor-bank'], queryFn: () => api.get('/api/v1/vendor/me/bank') });
  const [sheet, setSheet] = useState(false);
  const [amount, setAmount] = useState('');
  useFocusEffect(useCallback(() => { q.refetch(); }, [])); // eslint-disable-line react-hooks/exhaustive-deps
  const withdraw = useMutation({
    mutationFn: () => api.post('/api/v1/vendor/earnings/payouts', { amountPaise: Math.round(Number(amount) * 100) }),
    onSuccess: () => { setSheet(false); setAmount(''); qc.invalidateQueries({ queryKey: ['earnings'] }); qc.invalidateQueries({ queryKey: ['payouts'] }); toast('Withdrawal requested. Finance usually processes it within 2 working days.', 'success'); },
    onError: (e) => toast(e.message, 'danger'),
  });

  if (q.isLoading) return <Screen edges={['top']} scroll={false}><Loading /></Screen>;
  if (q.error) return <Screen edges={['top']} scroll={false}><ErrorState error={q.error} onRetry={q.refetch} /></Screen>;
  const d = q.data;
  const w = d.wallet;
  const bankOk = bank.data?.verification?.status === 'verified';
  const canWithdraw = account?.status === 'approved' && bankOk && w.availablePaise >= d.minWithdrawalPaise;

  return (
    <Screen edges={['top']} refreshing={q.isRefetching} onRefresh={q.refetch}>
      <View className="px-4 pt-4"><T variant="title">Earnings</T></View>
      <View className="mx-4 mt-4 rounded-lg bg-ink-900 p-5">
        <T variant="overline" className="text-ink-300">Available to withdraw</T>
        <T variant="display" tone="inverse" className="mt-1">{money(w.availablePaise, { exact: true })}</T>
        <View className="mt-4 flex-row">
          <View className="flex-1"><T variant="caption" className="text-ink-300">Pending</T><T variant="label" tone="inverse">{money(w.pendingPaise)}</T></View>
          <View className="flex-1"><T variant="caption" className="text-ink-300">Withdrawal in progress</T><T variant="label" tone="inverse">{money(w.lockedPaise)}</T></View>
        </View>
        <Button title="Withdraw" icon={ArrowDownToLine} variant="secondary" className="mt-4" disabled={!canWithdraw} onPress={() => { setAmount(String(Math.floor(w.availablePaise / 100))); setSheet(true); }} />
      </View>
      {!bankOk ? <Notice tone="warning" className="mx-4 mt-3" title={bank.data ? 'Bank account not verified yet' : 'Add a bank account'} action={<Button title="Bank details" size="sm" variant="tonal" icon={Landmark} onPress={() => navigation.navigate('BankStep')} />}>Withdrawals are enabled once finance verifies your account.</Notice> : null}
      <T variant="caption" tone="subtle" className="mx-4 mt-3">Trip earnings move from pending to available {d.payoutHoldDays} days after the trip is completed. Minimum withdrawal {money(d.minWithdrawalPaise)}.</T>

      <Section title="Monthly earnings">
        <Panel><MonthlyBars data={d.monthly} /></Panel>
      </Section>

      <Section title="Overview">
        <Panel>
          <KeyValue label="Lifetime earned" value={money(w.lifetimeEarnedPaise)} />
          <KeyValue label="Paid out to bank" value={money(w.lifetimePaidOutPaise)} />
          <KeyValue label="Upcoming confirmed trips" value={`${d.upcoming.bookings} · ${money(d.upcoming.grossRentalPaise)} gross`} />
          <KeyValue label="Platform commission" value={`${d.commissionBps / 100}% of rental`} />
        </Panel>
      </Section>

      <Section>
        <Panel padded={false}>
          <ListItem icon={History} title="Withdrawals" onPress={() => navigation.navigate('Payouts')} />
          <ListItem icon={ListOrdered} title="All transactions" last onPress={() => navigation.navigate('Ledger')} />
        </Panel>
      </Section>

      <Sheet visible={sheet} onClose={() => setSheet(false)} title="Withdraw to bank" footer={<Button title={`Request ${money(Math.round(Number(amount || 0) * 100))}`} block disabled={!(Number(amount) * 100 >= d.minWithdrawalPaise) || Number(amount) * 100 > w.availablePaise} loading={withdraw.isPending} onPress={() => withdraw.mutate()} />}>
        <View className="px-5 pb-3">
          <Field label="Amount (₹)" value={amount} onChangeText={(t) => setAmount(t.replace(/\D/g, ''))} keyboardType="number-pad" hint={`Available ${money(w.availablePaise)}`} />
          {bank.data ? <T variant="bodySm" tone="muted">To {bank.data.accountHolderName} · {bank.data.accountNumberMasked} · {bank.data.ifsc}</T> : null}
          <T variant="caption" tone="subtle" className="mt-2">You’ll see the bank reference (UTR) here once the transfer is made.</T>
        </View>
      </Sheet>
    </Screen>
  );
}
