import { useMemo, useState } from 'react';
import { View, Pressable } from '../rn';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Screen, Header, Section, Panel } from '../ui/Layout';
import { T } from '../ui/Text';
import { Field } from '../ui/Field';
import { Loading, ErrorState } from '../ui/Feedback';
import { useApp } from '../app/AppContext';
import { colors } from '@shared/theme/tokens';

export function FaqScreen() {
  const { api, realm } = useApp();
  const q = useQuery({ queryKey: ['faqs', realm], queryFn: () => api.get('/api/v1/public/faqs', { audience: realm === 'vendor' ? 'vendor' : 'user' }), staleTime: 60 * 60_000 });
  const [open, setOpen] = useState(null);
  const [search, setSearch] = useState('');
  const groups = useMemo(() => {
    const s = search.trim().toLowerCase();
    const map = new Map();
    for (const f of q.data || []) {
      if (s && !`${f.question} ${f.answer}`.toLowerCase().includes(s)) continue;
      if (!map.has(f.category)) map.set(f.category, []);
      map.get(f.category).push(f);
    }
    return [...map.entries()];
  }, [q.data, search]);
  return (
    <Screen header={<Header title="FAQs" />}>
      <View className="px-4 pt-4"><Field placeholder="Search questions" value={search} onChangeText={setSearch} /></View>
      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : groups.map(([cat, items], gi) => (
        <Section key={cat} title={cat} first={gi === 0}>
          <Panel padded={false}>
            {items.map((f, i) => (
              <Pressable key={f.id} onPress={() => setOpen(open === f.id ? null : f.id)} className={`px-4 py-3.5 ${i < items.length - 1 ? 'border-b border-line' : ''}`} accessibilityRole="button" accessibilityState={{ expanded: open === f.id }}>
                <View className="flex-row items-center">
                  <T variant="label" className="flex-1 pr-2">{f.question}</T>
                  {open === f.id ? <ChevronUp size={18} color={colors.ink[500]} /> : <ChevronDown size={18} color={colors.ink[500]} />}
                </View>
                {open === f.id ? <T variant="bodySm" tone="muted" className="mt-2">{f.answer}</T> : null}
              </Pressable>
            ))}
          </Panel>
        </Section>
      ))}
    </Screen>
  );
}
