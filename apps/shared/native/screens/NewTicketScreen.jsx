import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Screen } from '../Layout';
import { T } from '../Text';
import { Field } from '../Field';
import { Button } from '../Button';
import { Chip } from '../Rows';
import { PhotoTile } from '../Media';
import { Notice } from '../Feedback';
import { Card } from '../Surfaces';
import { HeroHeader } from '../Blocks';
import { FadeInView } from '../Motion';
import { TICKET_CATEGORY } from '../../lib/labels';
import { useApp } from '../app/AppContext';
import { useUploader } from '../app/useUploader';

const CATS = {
  user: ['booking', 'payment', 'refund', 'vehicle_issue', 'damage_dispute', 'account', 'kyc', 'other'],
  vendor: ['booking', 'payout', 'vehicle_issue', 'damage_dispute', 'account', 'kyc', 'other'],
};

function CardTitle({ step, title, subtitle }) {
  return (
    <View className="mb-3 flex-row items-center">
      <View className="h-6 w-6 items-center justify-center rounded-full bg-brand-50"><T variant="caption" className="font-extrabold text-brand-700">{step}</T></View>
      <View className="ml-2.5 flex-1">
        <T variant="label" className="text-[15px]">{title}</T>
        {subtitle ? <T variant="caption" tone="subtle">{subtitle}</T> : null}
      </View>
    </View>
  );
}

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
    <Screen tone="hero" header={<HeroHeader compact rounded={false} title="New conversation" subtitle={ref ? `Booking ${ref}` : undefined} className="pb-2" />} footer={<Button title="Send to support" block size="lg" disabled={!ready || uploader.busy} loading={create.isPending} onPress={() => create.mutate()} />}>
      <FadeInView className="mx-4 mt-4">
        <Card className="p-4">
          <CardTitle step="1" title="Topic" subtitle="What is this about?" />
          <View className="flex-row flex-wrap">{CATS[realm].map((c) => <Chip key={c} label={TICKET_CATEGORY[c]} className="mb-2" selected={category === c} onPress={() => setCategory(c)} />)}</View>
        </Card>
      </FadeInView>
      <FadeInView index={1} className="mx-4 mt-4">
        <Card className="p-4 pb-0">
          <CardTitle step="2" title="Details" />
          <Field label="Subject" value={subject} onChangeText={setSubject} maxLength={150} />
          <Field label="How can we help?" value={message} onChangeText={setMessage} multiline hint="At least 10 characters. Include dates, booking refs and amounts if relevant." />
        </Card>
      </FadeInView>
      <FadeInView index={2} className="mx-4 mt-4">
        <Card className="p-4">
          <CardTitle step="3" title="Photo" subtitle="Optional — a screenshot or picture of the issue" />
          <View className="w-1/2"><PhotoTile label="Attach a photo (optional)" source={uploader.slots.a1?.uri ? { uri: uploader.slots.a1.uri } : undefined} state={uploader.slots.a1?.state} error={uploader.slots.a1?.error} onPress={() => uploader.take('a1', 'ticket_attachment', { source: 'gallery' })} /></View>
        </Card>
      </FadeInView>
      {create.error ? <Notice tone="danger" className="mx-4 mt-4">{create.error.message}</Notice> : null}
    </Screen>
  );
}
