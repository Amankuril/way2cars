import { useState } from 'react';
import { View } from '@/mobile/rn';
import { ShieldCheck, Landmark, Building2, UserRound, Star, Bell, BellRing, LifeBuoy, FileText, LogOut } from 'lucide-react';
import { Screen, T, Panel, ListItem, Section, Pill, Avatar, Confirm } from '@/mobile/ui';
import { KYC_STATUS, VENDOR_STATUS } from '@shared/lib/labels';
import { maskPhone } from '../../lib';
import { useAuth } from '../../auth/AuthContext';
import { ENV } from '../../env';

export function AccountScreen({ navigation }) {
  const { account, signOut } = useAuth();
  const [confirm, setConfirm] = useState(false);
  const go = (n, p) => () => navigation.navigate(n, p);
  const kyc = KYC_STATUS[account?.kyc?.status || 'not_submitted'];
  const st = VENDOR_STATUS[account?.status];
  return (
    <Screen edges={['top']}>
      <View className="flex-row items-center px-4 pb-2 pt-5">
        <Avatar name={account?.name} size={56} />
        <View className="ml-4 flex-1">
          <T variant="title" numberOfLines={1}>{account?.businessName || account?.name}</T>
          <T variant="bodySm" tone="muted">{maskPhone(account?.phone)}</T>
        </View>
        {st ? <Pill label={st.label} tone={st.tone} /> : null}
      </View>
      {account?.rating?.count ? <T variant="caption" tone="subtle" className="px-4">Host rating {account.rating.avg.toFixed(1)} from {account.rating.count} reviews</T> : null}

      <Section title="Host profile" first>
        <Panel padded={false}>
          <ListItem icon={UserRound} title="Personal details" onPress={go('ProfileStep')} />
          <ListItem icon={Building2} title="Business & address" onPress={go('BusinessStep')} />
          <ListItem icon={ShieldCheck} title="Identity verification" right={<Pill label={kyc.label} tone={kyc.tone} />} onPress={go('KycStep')} />
          <ListItem icon={Landmark} title="Bank account" subtitle="Where earnings are paid" last onPress={go('BankStep')} />
        </Panel>
      </Section>
      <Section title="Activity">
        <Panel padded={false}>
          <ListItem icon={Star} title="Reviews from renters" onPress={go('Reviews')} />
          <ListItem icon={Bell} title="Notifications" onPress={go('Notifications')} />
          <ListItem icon={BellRing} title="Notification settings" last onPress={go('NotificationPrefs')} />
        </Panel>
      </Section>
      <Section title="Support">
        <Panel padded={false}>
          <ListItem icon={LifeBuoy} title="Help & support" onPress={go('Help')} />
          <ListItem icon={FileText} iconTone="neutral" title="Host terms" onPress={go('CmsPage', { slug: 'host-terms' })} />
          <ListItem icon={FileText} iconTone="neutral" title="Privacy policy" last onPress={go('CmsPage', { slug: 'privacy-policy' })} />
        </Panel>
      </Section>
      <Section>
        <Panel padded={false}><ListItem icon={LogOut} title="Sign out" chevron={false} last onPress={() => setConfirm(true)} /></Panel>
        <T variant="caption" tone="subtle" className="mt-4 text-center">WAY2CARS Host · v1.0.0{ENV.env !== 'production' ? ` · ${ENV.env}` : ''}</T>
      </Section>
      <Confirm visible={confirm} title="Sign out?" confirmLabel="Sign out" onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); signOut(); }} />
    </Screen>
  );
}
