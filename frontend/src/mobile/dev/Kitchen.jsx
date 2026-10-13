/**
 * DEV ONLY (/user/__kitchen, /vendor/__kitchen): every RN primitive and design-system component in
 * one screen, written exactly like a native screen. Use it to eyeball a port and as a smoke test.
 * Not included in production builds (registered behind import.meta.env.DEV).
 */
import { useCallback, useState } from 'react';
import { View, ScrollView, FlatList, Pressable, Image, Switch, Alert, Share, Linking, useWindowDimensions } from '../rn';
import { Bell, CalendarDays, Car, Share2, Phone, ShieldCheck, Users, Cog, Fuel } from 'lucide-react';
import { Screen, Header, Section, Panel, T, Button, IconButton, Field, Chip, Segmented, ListItem, KeyValue, Pill, Notice, Skeleton, Sheet, Confirm, useToast, PhotoTile, Avatar, Rating, Stepper, useUploader, Divider, CarLoader, TripRoute, TicketCard, Accordion, Carousel, SpecChip, IconTile, AnimatedNumber, SkeletonVehicleCard, SkeletonRow, GradientHero, SectionHeader, PressableScale, FadeInView, DashedDivider, Card, HeroHeader, StepProgress, Timeline, ActionTile, EmptyState } from '../ui';
import { DateTimePickerAndroid } from '../app/datetime';
import { useFocusEffect } from '../nav';
import { colors } from '@shared/theme/tokens';
import { dateTime, money } from '@shared/lib/format';
import MARK from '@shared/assets/mark.png';

const roundHalf = (d) => new Date(Math.round(d.getTime() / 1800000) * 1800000);

export default function Kitchen({ navigation, route }) {
  const toast = useToast();
  const { width } = useWindowDimensions();
  const uploader = useUploader();
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [when, setWhen] = useState(null);
  const [on, setOn] = useState(true);
  const [seg, setSeg] = useState('upcoming');
  const [chip, setChip] = useState('suv');
  const [text, setText] = useState('');
  const [items, setItems] = useState(() => Array.from({ length: 20 }, (_, i) => i + 1));
  const [focusCount, setFocusCount] = useState(0);
  const [kitN, setKitN] = useState(349900);
  useFocusEffect(useCallback(() => { setFocusCount((n) => n + 1); }, []));

  const pick = () => DateTimePickerAndroid.open({
    value: when || new Date(), mode: 'date', minimumDate: new Date(),
    onChange: (e, d) => {
      if (e.type !== 'set' || !d) return;
      DateTimePickerAndroid.open({ value: d, mode: 'time', is24Hour: false, onChange: (e2, t) => e2.type === 'set' && t && setWhen(roundHalf(t)) });
    },
  });

  const [kitStep, setKitStep] = useState(1);
  return (
    <Screen header={<Header title="Primitives" subtitle={`route ${route.name} · frame ${width}px · focus ${focusCount}`} right={<IconButton icon={Bell} label="Notifications" onPress={() => navigation.navigate('Notifications')} />} />}>
      <View className="px-4 pt-4">
        <Notice tone="warning" title="Developer screen">Only in `npm run dev`. Not shipped.</Notice>
      </View>

      <Section title="Motion kit" first>
        <GradientHero className="mx-4 rounded-3xl px-4 py-6"><T variant="title" tone="inverse">GradientHero</T><T variant="caption" className="text-white/75">brand → accent with soft shapes</T></GradientHero>
        <SectionHeader className="mt-5" eyebrow="Eyebrow" title="SectionHeader" subtitle="with an action" onAction={() => toast('See all')} />
        <View className="flex-row flex-wrap px-4"><SpecChip icon={Users} label="5 seats" /><SpecChip icon={Cog} label="Automatic" tone="brand" /><SpecChip icon={Fuel} label="Petrol" tone="success" /></View>
        <View className="mt-3 flex-row px-4"><IconTile icon={ShieldCheck} /><View className="w-3" /><IconTile icon={Car} tone="accent" /><View className="w-3" /><IconTile icon={Bell} tone="warning" /></View>
        <View className="mt-4 px-4"><PressableScale onPress={() => setKitN((n) => n + 125000)} className="rounded-2xl bg-surface p-4" style={{ boxShadow: '0px 6px 18px -8px rgba(14,23,27,0.16)' }}><T variant="label">PressableScale — tap to change the AnimatedNumber</T><AnimatedNumber value={money(kitN)} className="mt-1 text-brand-700" /></PressableScale></View>
        <CarLoader className="mt-5" subtitle="CarLoader + animated TripRoute"><TripRoute animated start={{ overline: 'Pickup', title: 'Sat, 14 Oct', subtitle: '9:00 AM' }} end={{ overline: 'Return', title: 'Sun, 15 Oct', subtitle: '9:00 AM' }} label="1 day" /></CarLoader>
        <Carousel className="mt-5" data={[1, 2, 3]} itemWidth={280} autoPlay={3000} renderItem={({ item }) => <TicketCard value={`${item * 5}% OFF`} code={`KIT${item}00`} title="TicketCard inside a Carousel" meta="Valid till 30 Nov 2026" onCopy={() => toast('Copied', 'success')} />} />
        <View className="mt-5"><Accordion items={[{ id: 'a', title: 'Accordion item one', content: 'Expands with a smooth height transition.' }, { id: 'b', title: 'Accordion item two', content: 'Only one item is open at a time.' }]} /></View>
        <Card className="mx-4 mt-5 p-4"><T variant="label">Card + DashedDivider</T><DashedDivider className="my-3" /><T variant="caption" tone="muted">Skeletons below shimmer.</T></Card>
        <View className="mt-4"><SkeletonVehicleCard /><SkeletonRow /></View>
        {[0, 1, 2].map((i) => <FadeInView key={i} index={i} className="mx-4 mb-2 rounded-xl bg-brand-50 p-3"><T variant="caption">FadeInView #{i + 1}</T></FadeInView>)}
      </Section>

      <Section title="Phase B blocks">
        <HeroHeader back={false} eyebrow="HeroHeader" title="Gradient header" subtitle="With a StepProgress (inverse) inside" className="mx-4 rounded-3xl" rounded>
          <StepProgress className="mt-4" tone="inverse" steps={['Licence', 'ID', 'Selfie']} current={kitStep} />
        </HeroHeader>
        <Card className="mx-4 mt-4 p-4"><StepProgress steps={['Photos', 'Fuel & km', 'Confirm']} current={kitStep} /><Button title="Next step" size="sm" variant="tonal" className="mt-3 self-start" onPress={() => setKitStep((n) => (n + 1) % 4)} /></Card>
        <Card className="mx-4 mt-4 p-4"><Timeline items={[{ key: 'a', title: 'Booked', subtitle: 'Sat, 14 Oct · 9:00 AM', state: 'done' }, { key: 'b', title: 'Host approved', state: 'done' }, { key: 'c', title: 'Pickup', subtitle: 'In 2 days', state: 'current' }, { key: 'd', title: 'Return', state: 'todo' }]} /></Card>
        <View className="mx-3 mt-4 flex-row">{[[Car, 'Start pickup'], [Phone, 'Call host'], [ShieldCheck, 'Roadside']].map(([I, l]) => <View key={l} className="flex-1 px-1"><ActionTile icon={I} label={l} onPress={() => toast(l)} /></View>)}</View>
        <EmptyState icon={CalendarDays} title="EmptyState" message="Illustrated, pops in." action={<Button title="Action" size="sm" />} />
      </Section>

      <Section title="Typography">
        <Panel>
          <T variant="display">Display</T>
          <T variant="title">Title</T>
          <T variant="headline">Headline</T>
          <T variant="body">Body text with <T variant="body" className="font-bold text-brand-700">nested bold</T> inline.</T>
          <T variant="bodySm" tone="muted" numberOfLines={1}>A long single line that should be truncated with an ellipsis at the end of the row because numberOfLines is 1.</T>
          <T variant="caption" tone="subtle" numberOfLines={2}>Two-line clamp: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.</T>
          <T variant="price" className="mt-2">{money(245000)}</T>
        </Panel>
      </Section>

      <Section title="Dialogs">
        <View className="flex-row flex-wrap px-4">
          <Button title="Alert" size="sm" variant="secondary" className="mb-2 mr-2" testID="k-alert" onPress={() => Alert.alert('Cancel booking?', 'You will get a refund as per the cancellation policy.', [{ text: 'Keep', style: 'cancel' }, { text: 'Cancel booking', style: 'destructive', onPress: () => toast('Booking cancelled', 'danger') }])} />
          <Button title="Confirm" size="sm" variant="secondary" className="mb-2 mr-2" testID="k-confirm" onPress={() => setConfirm(true)} />
          <Button title="Sheet" size="sm" variant="secondary" className="mb-2 mr-2" testID="k-sheet" onPress={() => setSheet(true)} />
          <Button title="Toast" size="sm" variant="secondary" className="mb-2 mr-2" testID="k-toast" onPress={() => toast('Saved', 'success')} />
          <Button title="Share" size="sm" variant="tonal" icon={Share2} className="mb-2 mr-2" onPress={() => Share.share({ message: 'Try WAY2CARS — use code W2C100' })} />
          <Button title="Call" size="sm" variant="ghost" icon={Phone} className="mb-2" onPress={() => Linking.openURL('tel:+911234567890')} />
        </View>
      </Section>

      <Section title="Inputs">
        <View className="px-4">
          <Field label="Pickup" value={when ? dateTime(when) : ''} placeholder="Select date & time" onPress={pick} suffix={<CalendarDays size={18} color={colors.ink[400]} />} testID="k-date" />
          <Field label="Notes" value={text} onChangeText={setText} multiline hint={`${text.length}/200`} maxLength={200} />
          <Field label="Amount" prefix="₹" keyboardType="number-pad" placeholder="0" />
          <Segmented value={seg} onChange={setSeg} options={[{ value: 'upcoming', label: 'Upcoming', count: 2 }, { value: 'active', label: 'Active' }, { value: 'past', label: 'Past' }]} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3" contentContainerClassName="pr-4">
            {['hatchback', 'sedan', 'suv', 'muv', 'electric', 'automatic'].map((c) => <Chip key={c} label={c} selected={chip === c} onPress={() => setChip(c)} icon={c === 'suv' ? Car : undefined} />)}
          </ScrollView>
          <View className="mt-3 flex-row items-center justify-between rounded-md border border-line bg-surface px-4 py-3">
            <T variant="body" className="font-semibold">Instant booking</T>
            <Switch value={on} onValueChange={setOn} trackColor={{ true: colors.brand[300], false: colors.ink[200] }} thumbColor={on ? colors.brand[500] : '#fff'} accessibilityLabel="Instant booking" testID="k-switch" />
          </View>
        </View>
      </Section>

      <Section title="Rows">
        <Panel padded={false}>
          <ListItem icon={ShieldCheck} title="Verify licence" subtitle="Takes 2 minutes" onPress={() => toast('Row pressed')} />
          <ListItem icon={Bell} iconTone="neutral" title="Notifications" value="On" />
          <ListItem title="Delete account" danger last onPress={() => setConfirm(true)} />
        </Panel>
        <Panel className="mt-3">
          <KeyValue label="Rental" value={money(240000)} />
          <KeyValue label="GST" hint="18% on fees" value={money(43200)} />
          <Divider className="my-1" />
          <KeyValue label="Total" value={money(283200)} strong />
          <View className="mt-3 flex-row items-center justify-between">
            <View className="flex-row items-center"><Avatar name="Asha Rao" /><View className="ml-3"><T variant="label">Asha Rao</T><Rating value={4.6} count={23} /></View></View>
            <Pill label="Confirmed" tone="success" />
          </View>
        </Panel>
        <Stepper steps={['Profile', 'Business', 'KYC', 'Bank']} current={1} />
      </Section>

      <Section title="Media">
        <View className="flex-row px-4">
          <View className="mr-3 w-1/2"><PhotoTile label="Upload a photo" source={uploader.slots.p?.uri ? { uri: uploader.slots.p.uri } : undefined} state={uploader.slots.p?.state} error={uploader.slots.p?.error} onPress={() => uploader.take('p', 'ticket_attachment', { source: 'gallery' })} /></View>
          <View className="flex-1 items-center justify-center rounded-md bg-surface"><Image source={MARK} style={{ width: 120, height: 52 }} resizeMode="contain" /></View>
        </View>
        <View className="flex-row px-4"><Skeleton className="mr-3 h-16 flex-1" /><Skeleton className="h-16 w-16" /></View>
      </Section>

      <Section title="Horizontal FlatList">
        <FlatList
          horizontal
          data={[1, 2, 3, 4, 5, 6]}
          keyExtractor={(n) => String(n)}
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="px-4"
          ItemSeparatorComponent={() => <View className="w-3" />}
          renderItem={({ item }) => (
            <Pressable onPress={() => toast(`Card ${item}`)} className="h-28 w-44 justify-end rounded-lg border border-line bg-surface p-3 active:bg-ink-50">
              <T variant="label">Card {item}</T>
              <T variant="caption" tone="subtle">Swipe sideways</T>
            </Pressable>
          )}
        />
      </Section>

      <Section title={`Infinite list (${items.length})`}>
        <Panel padded={false}>
          <FlatList
            scrollEnabled={false}
            data={items}
            keyExtractor={(n) => String(n)}
            onEndReached={() => items.length < 60 && setItems((xs) => [...xs, ...Array.from({ length: 20 }, (_, i) => xs.length + i + 1)])}
            renderItem={({ item, index }) => <ListItem title={`Item ${item}`} subtitle={`index ${index}`} last={index === items.length - 1} />}
            ListFooterComponent={items.length < 60 ? <T variant="caption" tone="subtle" className="p-4 text-center">Loading more…</T> : <T variant="caption" tone="subtle" className="p-4 text-center" testID="k-end">End of list</T>}
          />
        </Panel>
      </Section>

      <Sheet visible={sheet} onClose={() => setSheet(false)} title="Add photo" footer={<Button title="Done" block onPress={() => setSheet(false)} />}>
        <View className="pb-2">
          <ListItem icon={Car} title="Take a photo" onPress={() => setSheet(false)} />
          <ListItem icon={CalendarDays} title="Choose from gallery" last onPress={() => setSheet(false)} />
        </View>
      </Sheet>
      <Confirm visible={confirm} title="Delete this car?" message="It will be hidden from renters immediately." tone="danger" confirmLabel="Delete" onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); toast('Deleted', 'danger'); }} />
    </Screen>
  );
}
