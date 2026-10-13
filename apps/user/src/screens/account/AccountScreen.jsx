import { useState } from 'react';
import { View } from 'react-native';
import { ShieldCheck, MapPin, Wallet, Gift, CreditCard, Receipt, Bell, BellRing, FileText, Info, LogOut, Trash2, Phone, PencilLine } from 'lucide-react-native';
import { Screen, T, ListItem, Pill, Avatar, Confirm, HeroHeader, Card, SectionHeader, ActionTile, FadeInView, PressableScale } from '@shared/native';
import { money, maskPhone } from '@shared/lib/format';
import { KYC_STATUS } from '@shared/lib/labels';
import { useAuth } from '../../auth/AuthContext';
import { ENV } from '../../env';

const KYC_TILE = { approved: 'success', pending: 'warning', rejected: 'danger', not_submitted: 'brand' };

/** A titled group of rows in an elevated card (radius + shadow outside, clipping inside). */
function Group({ title, index, children }) {
  return (
    <FadeInView index={index} className="mt-6">
      {title ? <SectionHeader title={title} /> : null}
      <Card className="mx-4">
        <View className="overflow-hidden rounded-2xl">{children}</View>
      </Card>
    </FadeInView>
  );
}

export function AccountScreen({ navigation }) {
  const { account, signOut } = useAuth();
  const [confirmOut, setConfirmOut] = useState(false);
  const kycStatus = account?.kyc?.status || 'not_submitted';
  const kyc = KYC_STATUS[kycStatus];
  const go = (name, params) => () => navigation.navigate(name, params);

  return (
    <Screen tone="hero" edges={['top']}>
      <HeroHeader back={false} compact title="Account">
        <View className="mt-2 flex-row items-center pb-12">
          <View className="rounded-full border-2 border-white/40 p-0.5"><Avatar name={account?.name} size={60} /></View>
          <View className="ml-4 flex-1">
            <T variant="title" tone="inverse" numberOfLines={1}>{account?.name}</T>
            <T variant="bodySm" className="mt-0.5 text-white/80">{maskPhone(account?.phone)}</T>
          </View>
          <PressableScale
            onPress={go('EditProfile')}
            accessibilityRole="button"
            accessibilityLabel="Edit profile"
            className="h-11 flex-row items-center px-3.5"
            style={{ borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', backgroundColor: 'rgba(255,255,255,0.16)' }}
          >
            <PencilLine size={15} color="#fff" strokeWidth={2.4} />
            <T variant="label" tone="inverse" className="ml-1.5">Edit</T>
          </PressableScale>
        </View>
      </HeroHeader>

      {/* quick stats from the account itself (overlap the hero) */}
      <FadeInView style={{ marginTop: -44 }} className="flex-row px-3">
        <View className="flex-1 px-1"><ActionTile icon={Wallet} tone="brand" label={money(account?.walletBalancePaise || 0)} caption="Wallet" accessibilityLabel={`Wallet balance ${money(account?.walletBalancePaise || 0)}`} onPress={go('Wallet')} /></View>
        <View className="flex-1 px-1"><ActionTile icon={ShieldCheck} tone={KYC_TILE[kycStatus] || 'brand'} label={kyc.label} caption="Verification" accessibilityLabel={`Licence and ID verification: ${kyc.label}`} onPress={go('Kyc')} /></View>
        <View className="flex-1 px-1"><ActionTile icon={Gift} tone="accent" label={account?.referralCode || 'Refer'} caption="Refer & earn" accessibilityLabel={`Refer and earn, your code ${account?.referralCode || ''}`} onPress={go('Referral')} /></View>
      </FadeInView>

      <Group title="Driving" index={1}>
        <ListItem icon={ShieldCheck} iconTone={KYC_TILE[kycStatus] || 'brand'} title="Licence & ID verification" right={<View><Pill label={kyc.label} tone={kyc.tone} /></View>} onPress={go('Kyc')} />
        <ListItem icon={MapPin} iconTone="accent" title="Saved addresses" subtitle="For doorstep delivery" last onPress={go('Addresses')} />
      </Group>

      <Group title="Money" index={2}>
        <ListItem icon={Wallet} title="WAY2CARS wallet" value={money(account?.walletBalancePaise || 0)} onPress={go('Wallet')} />
        <ListItem icon={Gift} iconTone="accent" title="Refer & earn" subtitle={`Your code ${account?.referralCode}`} onPress={go('Referral')} />
        <ListItem icon={Receipt} iconTone="success" title="Payments & refunds" onPress={go('PaymentHistory')} />
        <ListItem icon={CreditCard} iconTone="warning" title="Saved payment methods" last onPress={go('SavedMethods')} />
      </Group>

      <Group title="Preferences" index={3}>
        <ListItem icon={Bell} title="Notifications" onPress={go('Notifications')} />
        <ListItem icon={BellRing} iconTone="accent" title="Notification settings" last onPress={go('NotificationPrefs')} />
      </Group>

      <Group title="About" index={4}>
        <ListItem icon={FileText} iconTone="neutral" title="Terms & conditions" onPress={go('CmsPage', { slug: 'terms-and-conditions' })} />
        <ListItem icon={FileText} iconTone="neutral" title="Privacy policy" onPress={go('CmsPage', { slug: 'privacy-policy' })} />
        <ListItem icon={FileText} iconTone="neutral" title="Cancellation policy" onPress={go('CmsPage', { slug: 'cancellation-policy' })} />
        <ListItem icon={Info} iconTone="neutral" title="About WAY2CARS" onPress={go('CmsPage', { slug: 'about-us' })} />
        <ListItem icon={Phone} iconTone="neutral" title="Contact us" last onPress={go('CmsPage', { slug: 'contact-us' })} />
      </Group>

      <Group index={5}>
        <ListItem icon={LogOut} iconTone="neutral" title="Sign out" chevron={false} onPress={() => setConfirmOut(true)} />
        <ListItem icon={Trash2} title="Delete account" danger last onPress={go('DeleteAccount')} />
      </Group>
      <T variant="caption" tone="subtle" className="mt-5 text-center">WAY2CARS for Android · {ENV.env === 'production' ? 'v1.0.0' : `v1.0.0 · ${ENV.env}`}</T>

      <Confirm visible={confirmOut} title="Sign out?" message="You’ll need a verification code to sign in again." confirmLabel="Sign out" onCancel={() => setConfirmOut(false)} onConfirm={() => { setConfirmOut(false); signOut(); }} />
    </Screen>
  );
}
