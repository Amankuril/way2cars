import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Screen, Header } from '../Layout';
import { T } from '../Text';
import { Loading, ErrorState } from '../Feedback';
import { useApp } from '../app/AppContext';
import { dateLong } from '../../lib/format';

/** Renders CMS pages from structured blocks (no HTML → no injection surface). */
export function CmsPageScreen({ route }) {
  const { slug } = route.params;
  const { api } = useApp();
  const q = useQuery({ queryKey: ['cms', slug], queryFn: () => api.get(`/api/v1/public/pages/${slug}`), staleTime: 60 * 60_000 });
  return (
    <Screen bg="surface" header={<Header title={q.data?.title || ''} />} scroll={!q.isLoading && !q.error}>
      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <View className="px-5 pt-4">
          <T variant="caption" tone="subtle">Version {q.data.version} · updated {dateLong(q.data.updatedAt)}</T>
          {q.data.blocks.map((b, i) => (b.type === 'heading' ? <T key={i} variant="headline" className="mt-6">{b.text}</T>
            : b.type === 'list' ? <View key={i} className="mt-2">{b.items.map((it, j) => <T key={j} variant="body" tone="muted" className="mt-1.5">•  {it}</T>)}</View>
            : <T key={i} variant="body" tone="muted" className="mt-3">{b.text}</T>))}
        </View>
      )}
    </Screen>
  );
}
