import { useState } from 'react';
import { LogOut, Construction } from 'lucide-react';
import { View } from '../rn';
import { Screen, Header, T, Button, Panel, Logo, Confirm } from '../ui';
import { useApp } from '../app/AppContext';
import { maskPhone } from '@shared/lib/format';

/**
 * PHASE-1 SCAFFOLD ONLY. Stands in for native screens that have not been ported yet.
 * Shows who is signed in and a sign-out button so auth can be verified end to end.
 * Usage in a route table: `Trips: placeholder('Trips')`. Delete once every screen is ported.
 */
export function placeholder(title, { back = false } = {}) {
  function Placeholder() {
    const { auth, realm } = useApp();
    const [confirm, setConfirm] = useState(false);
    const [busy, setBusy] = useState(false);
    const a = auth.account || {};
    return (
      <Screen edges={['top']} header={back ? <Header title={title} /> : null}>
        <View className="px-5 pt-6">
          <Logo size="sm" subtitle={realm === 'vendor' ? 'Host' : undefined} />
          <T variant="title" className="mt-8">{title}</T>
          <T variant="body" tone="muted" className="mt-1">Signed in as</T>
          <T variant="headline" className="mt-0.5" testID="account-name">{a.name || a.businessName || 'New member'}</T>
          {a.phone ? <T variant="bodySm" tone="subtle">{maskPhone(a.phone)}</T> : null}
        </View>
        <Panel className="mt-6">
          <View className="flex-row items-start">
            <Construction size={18} color="#728189" />
            <T variant="bodySm" tone="muted" className="ml-3 flex-1">This screen is being ported from the Android app.</T>
          </View>
        </Panel>
        <View className="px-4 pt-6">
          <Button title="Sign out" variant="secondary" icon={LogOut} block onPress={() => setConfirm(true)} testID="sign-out" />
        </View>
        <Confirm
          visible={confirm}
          title="Sign out?"
          message="You’ll need your mobile number and a code to sign in again."
          confirmLabel="Sign out"
          tone="danger"
          loading={busy}
          onCancel={() => setConfirm(false)}
          onConfirm={async () => { setBusy(true); await auth.signOut(); }}
        />
      </Screen>
    );
  }
  Placeholder.displayName = `Placeholder(${title})`;
  return Placeholder;
}
