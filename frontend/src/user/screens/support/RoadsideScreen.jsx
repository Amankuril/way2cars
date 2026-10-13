import { useState } from 'react';
import { View, Linking, Switch } from '@/mobile/rn';
import { useMutation } from '@tanstack/react-query';
import { Phone, CheckCircle2 } from 'lucide-react';
import { Screen, Header, T, Field, Button, Chip, Notice, Panel, EmptyState } from '@/mobile/ui';
import { colors } from '@shared/theme/tokens';
import { ROADSIDE } from '@shared/lib/labels';
import { api } from '../../api';
import { currentPosition } from '@/mobile/app/location';

export function RoadsideScreen({ route, navigation }) {
  const { bookingId } = route.params;
  const [type, setType] = useState(null);
  const [description, setDescription] = useState('');
  const [shareLocation, setShareLocation] = useState(true);
  const send = useMutation({
    mutationFn: async () => {
      const pos = shareLocation ? await currentPosition() : null;
      return api.post('/api/v1/user/support/roadside', { bookingId, type, description: description.trim(), ...(pos || {}) });
    },
  });
  if (send.data) {
    const r = send.data;
    return (
      <Screen header={<Header title="Roadside assistance" />}>
        <EmptyState icon={CheckCircle2} title="Help is on the way" message={`Request ${r.ref} has been sent to our team. We’ll call you shortly. For faster help, call us now.`} />
        <View className="px-4">
          {r.roadsidePhone ? <Button title={`Call ${r.roadsidePhone}`} icon={Phone} block size="lg" onPress={() => Linking.openURL(`tel:${r.roadsidePhone}`)} /> : null}
          <Button title="Open conversation" variant="secondary" block className="mt-3" onPress={() => navigation.replace('Ticket', { id: r.id })} />
          {r.emergencyPhone ? <Button title={`Emergency services ${r.emergencyPhone}`} variant="dangerGhost" block className="mt-3" onPress={() => Linking.openURL(`tel:${r.emergencyPhone}`)} /> : null}
        </View>
      </Screen>
    );
  }
  return (
    <Screen bg="surface" header={<Header title="Roadside assistance" />} footer={<Button title="Request help now" variant="danger" block size="lg" disabled={!type || description.trim().length < 5} loading={send.isPending} onPress={() => send.mutate()} />}>
      <View className="px-5 pt-4">
        <Notice tone="danger" title="If anyone is hurt, call 112 first.">Move to a safe place and switch on hazard lights.</Notice>
        <T variant="label" tone="muted" className="mb-2 mt-6">What happened?</T>
        <View className="mb-4 flex-row flex-wrap">{Object.entries(ROADSIDE).map(([k, l]) => <Chip key={k} label={l} className="mb-2" selected={type === k} onPress={() => setType(k)} />)}</View>
        <Field label="Details" value={description} onChangeText={setDescription} multiline placeholder="Where are you and what do you see?" />
        <Panel className="mx-0 flex-row items-center">
          <View className="flex-1"><T variant="label">Share my location</T><T variant="caption" tone="subtle">Helps our team reach you faster</T></View>
          <Switch value={shareLocation} onValueChange={setShareLocation} trackColor={{ true: colors.brand[300], false: colors.ink[200] }} thumbColor={shareLocation ? colors.brand[500] : '#fff'} />
        </Panel>
        {send.error ? <T variant="bodySm" tone="danger" className="mt-3">{send.error.message}</T> : null}
      </View>
    </Screen>
  );
}
