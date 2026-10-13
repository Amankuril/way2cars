import { useMemo, useState } from 'react';
import { View, TextInput, Pressable } from '../rn';
import { useQuery } from '@tanstack/react-query';
import { Search, X, SearchX } from 'lucide-react';
import { Screen } from '../ui/Layout';
import { T } from '../ui/Text';
import { ErrorState, EmptyState, Skeleton } from '../ui/Feedback';
import { Card, SectionHeader, Accordion } from '../ui/Surfaces';
import { HeroHeader } from '../ui/Blocks';
import { FadeInView } from '../ui/Motion';
import { useApp } from '../app/AppContext';
import { colors, shadows } from '@shared/theme/tokens';

function FaqSkeleton() {
  return (
    <View className="mt-6">
      {[0, 1].map((g) => (
        <View key={g} className="mb-6">
          <Skeleton className="mx-4 mb-3 h-5 w-1/3" />
          <Card className="mx-4 px-4">
            {[0, 1, 2].map((i) => (
              <View key={i} className={`flex-row items-center py-4 ${i < 2 ? 'border-b border-line' : ''}`}>
                <Skeleton className="mr-6 h-3.5 flex-1" />
                <Skeleton className="h-4 w-4 rounded-full" />
              </View>
            ))}
          </Card>
        </View>
      ))}
    </View>
  );
}

export function FaqScreen() {
  const { api, realm } = useApp();
  const q = useQuery({ queryKey: ['faqs', realm], queryFn: () => api.get('/api/v1/public/faqs', { audience: realm === 'vendor' ? 'vendor' : 'user' }), staleTime: 60 * 60_000 });
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(false);
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
    <Screen tone="hero">
      <HeroHeader eyebrow="Help centre" title="FAQs" className="pb-8">
        <View
          className="mt-4 h-[52px] flex-row items-center rounded-xl bg-surface px-3.5"
          style={{ boxShadow: focused ? '0px 0px 0px 3px rgba(255, 255, 255, 0.35)' : shadows.raised }}
        >
          <Search size={18} color={colors.ink[500]} strokeWidth={2.2} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search questions"
            placeholderTextColor={colors.ink[400]}
            accessibilityLabel="Search questions"
            returnKeyType="search"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className="ml-2.5 flex-1 font-sans text-body font-medium text-ink-900"
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search" className="-mr-1.5 h-9 w-9 items-center justify-center rounded-full active:bg-ink-100">
              <X size={16} color={colors.ink[500]} strokeWidth={2.4} />
            </Pressable>
          ) : null}
        </View>
      </HeroHeader>
      {q.isLoading ? <FaqSkeleton /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : groups.length ? groups.map(([cat, items], gi) => (
        <FadeInView key={cat} index={gi} className={gi === 0 ? 'mt-6' : 'mt-7'}>
          <SectionHeader title={cat} subtitle={`${items.length} ${items.length === 1 ? 'question' : 'questions'}`} />
          <Accordion items={items.map((f) => ({ id: f.id, title: f.question, content: f.answer }))} />
        </FadeInView>
      )) : (
        <EmptyState icon={SearchX} title="No matching questions" message={search ? `Nothing found for “${search.trim()}”. Try a different word.` : undefined} />
      )}
    </Screen>
  );
}
