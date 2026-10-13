import { View, Pressable } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { Bell, Plus, Inbox, KeyRound, ClipboardCheck, CarFront } from 'lucide-react-native';
import { Screen, T, Section, Notice, Button, IconButton, Loading, EmptyState, Skeleton } from '@shared/native';
import { colors } from '@shared/theme/tokens';
import { money } from '../../lib';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../api';
import { useEarnings, useUnread } from '../../hooks/queries';
import { BookingRow } from '../../components/BookingRow';
import { useCountdown, mmss } from '../../hooks/useCountdown';

const greeting = () => {
  const h = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

function RequestDue({ due }) {
  const left = useCountdown(due);
  return <T variant="label" tone={left < 900 ? 'danger' : 'warning'}>{left > 3600 ? `${Math.floor(left / 3600)}h ${Math.floor((left % 3600) / 60)}m left` : `${mmss(left)} left`}</T>;
}

const Stat = ({ label, value, hint }) => (
  <View className="flex-1 rounded-lg border border-line bg-surface p-3.5">
    <T variant="caption" tone="subtle">{label}</T>
    <T variant="headline" className="mt-1" style={{ fontVariant: ['tabular-nums'] }}>{value}</T>
    {hint ? <T variant="caption" tone="subtle">{hint}</T> : null}
  </View>
);

export function DashboardScreen({ navigation }) {
  const { account } = useAuth();
  const approved = account?.status === 'approved';
  const earnings = useEarnings();
  const unread = useUnread();
  const list = (tab) => api.get('/api/v1/vendor/bookings', { tab, limit: 10 });
  const requests = useQuery({ queryKey: ['bookings', 'requests'], queryFn: () => list('requests'), enabled: approved, refetchInterval: 30_000 });
  const active = useQuery({ queryKey: ['bookings', 'active'], queryFn: () => list('active'), enabled: approved });
  const upcoming = useQuery({ queryKey: ['bookings', 'upcoming'], queryFn: () => list('upcoming'), enabled: approved });
  const fleet = useQuery({ queryKey: ['vehicles'], queryFn: () => api.get('/api/v1/vendor/vehicles', { limit: 100 }) });
  useFocusEffect(useCallback(() => { if (approved) { requests.refetch(); active.refetch(); } fleet.refetch(); earnings.refetch(); }, [approved])); // eslint-disable-line react-hooks/exhaustive-deps

  const returns = (active.data || []).filter((b) => b.status === 'return_pending');
  const ongoing = (active.data || []).filter((b) => b.status === 'ongoing');
  const listed = (fleet.data || []).filter((v) => v.isListed).length;
  const inReview = (fleet.data || []).filter((v) => v.approval?.status === 'pending_review').length;
  const w = earnings.data?.wallet;

  return (
    <Screen edges={['top']} refreshing={requests.isRefetching} onRefresh={() => { requests.refetch(); active.refetch(); upcoming.refetch(); fleet.refetch(); earnings.refetch(); }}>
      <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
        <View><T variant="caption" tone="subtle">{greeting()}</T><T variant="title">{account?.name?.split(' ')[0] || 'Host'}</T></View>
        <View>
          <IconButton icon={Bell} label="Notifications" onPress={() => navigation.navigate('Notifications')} />
          {unread.data ? <View className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full border-2 border-canvas bg-danger-500" /> : null}
        </View>
      </View>

      {account?.status === 'pending_approval' ? (
        <Notice tone="info" title="Application under review" className="mx-4 mt-2">We’ll notify you once approved. Meanwhile, add your cars with photos and documents so they’re ready to go live.</Notice>
      ) : null}

      <View className="mt-3 flex-row px-4">
        <Stat label="Available" value={earnings.isLoading ? '—' : money(w?.availablePaise || 0)} hint="to withdraw" />
        <View className="w-3" />
        <Stat label="Pending" value={earnings.isLoading ? '—' : money(w?.pendingPaise || 0)} hint={`released after ${earnings.data?.payoutHoldDays ?? 3} days`} />
      </View>
      <View className="mt-3 flex-row px-4">
        <Stat label="Listed cars" value={fleet.isLoading ? '—' : `${listed}/${fleet.data?.length || 0}`} hint={inReview ? `${inReview} in review` : 'live on WAY2CARS'} />
        <View className="w-3" />
        <Stat label="Upcoming trips" value={upcoming.isLoading ? '—' : upcoming.data?.length ?? 0} hint="confirmed" />
      </View>

      {approved ? (
        <>
          <Section title="Booking requests" action={requests.data?.length ? <Pressable onPress={() => navigation.navigate('Bookings', { tab: 'requests' })}><T variant="label" tone="brand">All</T></Pressable> : null}>
            {requests.isLoading ? <Skeleton className="mx-4 h-28" /> : requests.data?.length ? requests.data.map((b) => (
              <BookingRow key={b.id} booking={b} onPress={() => navigation.navigate('Booking', { id: b.id })} right={<RequestDue due={b.vendorDecisionDueAt} />} />
            )) : <EmptyState icon={Inbox} title="No pending requests" message="New requests for non-instant cars appear here — respond quickly to keep your acceptance rate high." className="py-6" />}
          </Section>

          {returns.length ? (
            <Section title="Returns to review">
              {returns.map((b) => <BookingRow key={b.id} booking={b} onPress={() => navigation.navigate('Booking', { id: b.id })} right={<View className="flex-row items-center"><ClipboardCheck size={16} color={colors.warning[600]} /><T variant="label" tone="warning" className="ml-1">Review</T></View>} />)}
            </Section>
          ) : null}

          {ongoing.length ? (
            <Section title="On the road">
              {ongoing.map((b) => <BookingRow key={b.id} booking={b} onPress={() => navigation.navigate('Booking', { id: b.id })} right={<View className="flex-row items-center"><KeyRound size={16} color={colors.brand[600]} /><T variant="label" tone="brand" className="ml-1">In trip</T></View>} />)}
            </Section>
          ) : null}
        </>
      ) : null}

      <Section title="Your fleet">
        {fleet.isLoading ? <Loading full={false} /> : fleet.data?.length ? (
          <Pressable onPress={() => navigation.navigate('Fleet')} className="mx-4 flex-row items-center rounded-lg border border-line bg-surface p-4 active:bg-ink-50">
            <CarFront size={22} color={colors.ink[600]} />
            <T variant="body" className="ml-3 flex-1">{fleet.data.length} car{fleet.data.length > 1 ? 's' : ''} · {listed} listed</T>
            <T variant="label" tone="brand">Manage</T>
          </Pressable>
        ) : (
          <EmptyState icon={CarFront} title="List your first car" message="Add photos, documents and pricing. We review listings within a day." action={<Button title="Add a car" icon={Plus} onPress={() => navigation.navigate('VehicleForm')} />} className="py-6" />
        )}
      </Section>
    </Screen>
  );
}
