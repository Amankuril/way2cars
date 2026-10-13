import { useState } from 'react';
import { View } from '../rn';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Screen, Header } from '../ui/Layout';
import { T } from '../ui/Text';
import { Field } from '../ui/Field';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Rows';
import { PhotoTile } from '../ui/Media';
import { TICKET_CATEGORY } from '@shared/lib/labels';
import { useApp } from '../app/AppContext';
import { useUploader } from '../app/useUploader';

const CATS = {
  user: ['booking', 'payment', 'refund', 'vehicle_issue', 'damage_dispute', 'account', 'kyc', 'other'],
  vendor: ['booking', 'payout', 'vehicle_issue', 'damage_dispute', 'account', 'kyc', 'other'],
};

export function NewTicketScreen({ route, navigation }) {
  const { bookingId, ref } = route.params || {};
  const { api, realm } = useApp();
  const qc = useQueryClient();
  const uploader = useUploader();
  const [category, setCategory] = useState(bookingId ? 'booking' : null);
  const [subject, setSubject] = useState(ref ? `About booking ${ref}` : '');
  const [message, setMessage] = useState('');
  const create = useMutation({
    mutationFn: () => api.post(`/api/v1/${realm}/support/tickets`, { category, subject: subject.trim(), message: message.trim(), bookingId, attachmentFileIds: uploader.ids(['a1']) }),
    onSuccess: (t) => { qc.invalidateQueries({ queryKey: ['tickets'] }); navigation.replace('Ticket', { id: t.id }); },
  });
  const ready = category && subject.trim().length >= 5 && message.trim().length >= 10;
  return (
    <Screen bg="surface" header={<Header title="New conversation" />} footer={<Button title="Send to support" block size="lg" disabled={!ready || uploader.busy} loading={create.isPending} onPress={() => create.mutate()} />}>
      <View className="px-5 pt-5">
        <T variant="label" tone="muted" className="mb-2">Topic</T>
        <View className="mb-4 flex-row flex-wrap">{CATS[realm].map((c) => <Chip key={c} label={TICKET_CATEGORY[c]} className="mb-2" selected={category === c} onPress={() => setCategory(c)} />)}</View>
        <Field label="Subject" value={subject} onChangeText={setSubject} maxLength={150} />
        <Field label="How can we help?" value={message} onChangeText={setMessage} multiline hint="At least 10 characters. Include dates, booking refs and amounts if relevant." />
        <View className="w-1/2"><PhotoTile label="Attach a photo (optional)" source={uploader.slots.a1?.uri ? { uri: uploader.slots.a1.uri } : undefined} state={uploader.slots.a1?.state} error={uploader.slots.a1?.error} onPress={() => uploader.take('a1', 'ticket_attachment', { source: 'gallery' })} /></View>
        {create.error ? <T variant="bodySm" tone="danger">{create.error.message}</T> : null}
      </View>
    </Screen>
  );
}
