import { useState } from 'react';
import { View } from 'react-native';
import { ShieldCheck, MapPin, Wallet, Gift, CreditCard, Receipt, Bell, BellRing, FileText, Info, LogOut, Trash2, Phone } from 'lucide-react-native';
import { Screen, T, Panel, ListItem, Pill, Avatar, Section, Confirm } from '@shared/native';
import { money, maskPhone } from '@shared/lib/format';
import { KYC_STATUS } from '@shared/lib/labels';
import { useAuth } from '../../auth/AuthContext';
import { ENV } from '../../env';

export function AccountScreen({ navigation }) {
  const { account, signOut } = useAuth();
  const [confirmOut, setConfirmOut] = useState(false);
  const kyc = KYC_STATUS[account?.kyc?.status || 'not_submitted'];
  const go = (name, params) => () => navigation.navigate(name, params);

  return (
    <Screen edges={['top']}>
      <View className="flex-row items-center px-4 pb-2 pt-5">
        <Avatar name={account?.name} size={56} />
        <View className="ml-4 flex-1">
          <T variant="title" numberOfLines={1}>{account?.name}</T>
          <T variant="bodySm" tone="muted">{maskPhone(account?.phone)}</T>
        </View>
        <T variant="label" tone="brand" onPress={go('EditProfile')} suppressHighlighting>Edit</T>
      </View>

      <Section title="Driving" first>
        <Panel padded={false}>
          <ListItem icon={ShieldCheck} title="Licence & ID verification" right={<Pill label={kyc.label} tone={kyc.tone} />} onPress={go('Kyc')} />
          <ListItem icon={MapPin} title="Saved addresses" subtitle="For doorstep delivery" last onPress={go('Addresses')} />
        </Panel>
      </Section>

      <Section title="Money">
        <Panel padded={false}>
          <ListItem icon={Wallet} title="WAY2CARS wallet" value={money(account?.walletBalancePaise || 0)} onPress={go('Wallet')} />
          <ListItem icon={Gift} title="Refer & earn" subtitle={`Your code ${account?.referralCode}`} onPress={go('Referral')} />
          <ListItem icon={Receipt} title="Payments & refunds" onPress={go('PaymentHistory')} />
          <ListItem icon={CreditCard} title="Saved payment methods" last onPress={go('SavedMethods')} />
        </Panel>
      </Section>

      <Section title="Preferences">
        <Panel padded={false}>
          <ListItem icon={Bell} title="Notifications" onPress={go('Notifications')} />
          <ListItem icon={BellRing} title="Notification settings" last onPress={go('NotificationPrefs')} />
        </Panel>
      </Section>

      <Section title="About">
        <Panel padded={false}>
          <ListItem icon={FileText} iconTone="neutral" title="Terms & conditions" onPress={go('CmsPage', { slug: 'terms-and-conditions' })} />
          <ListItem icon={FileText} iconTone="neutral" title="Privacy policy" onPress={go('CmsPage', { slug: 'privacy-policy' })} />
          <ListItem icon={FileText} iconTone="neutral" title="Cancellation policy" onPress={go('CmsPage', { slug: 'cancellation-policy' })} />
          <ListItem icon={Info} iconTone="neutral" title="About WAY2CARS" onPress={go('CmsPage', { slug: 'about-us' })} />
          <ListItem icon={Phone} iconTone="neutral" title="Contact us" last onPress={go('CmsPage', { slug: 'contact-us' })} />
        </Panel>
      </Section>

      <Section>
        <Panel padded={false}>
          <ListItem icon={LogOut} title="Sign out" chevron={false} onPress={() => setConfirmOut(true)} />
          <ListItem icon={Trash2} title="Delete account" danger last onPress={go('DeleteAccount')} />
        </Panel>
        <T variant="caption" tone="subtle" className="mt-4 text-center">WAY2CARS for Android · {ENV.env === 'production' ? 'v1.0.0' : `v1.0.0 · ${ENV.env}`}</T>
      </Section>

      <Confirm visible={confirmOut} title="Sign out?" message="You’ll need a verification code to sign in again." confirmLabel="Sign out" onCancel={() => setConfirmOut(false)} onConfirm={() => { setConfirmOut(false); signOut(); }} />
    </Screen>
  );
}
