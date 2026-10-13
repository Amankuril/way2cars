import { View } from '../rn';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { Screen } from '../ui/Layout';
import { T } from '../ui/Text';
import { ErrorState, Skeleton } from '../ui/Feedback';
import { Card, IconTile } from '../ui/Surfaces';
import { HeroHeader } from '../ui/Blocks';
import { FadeInView } from '../ui/Motion';
import { useApp } from '../app/AppContext';
import { dateLong } from '@shared/lib/format';
import { colors } from '@shared/theme/tokens';

function Block({ b }) {
  if (b.type === 'heading') return <T variant="headline" className="mt-6">{b.text}</T>;
  if (b.type === 'list') {
    return (
      <View className="mt-2">
        {b.items.map((it, j) => (
          <View key={j} className="mt-2 flex-row">
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand[500], marginTop: 9, marginRight: 10 }} />
            <T variant="body" tone="muted" className="flex-1">{it}</T>
          </View>
        ))}
      </View>
    );
  }
  return <T variant="body" tone="muted" className="mt-3">{b.text}</T>;
}

/** Shaped like the page: a heading, then paragraphs of uneven lines. */
function PageSkeleton() {
  return (
    <Card className="p-5">
      {[0, 1].map((s) => (
        <View key={s} className={s ? 'mt-7' : ''}>
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="mt-4 h-3.5 w-full" />
          <Skeleton className="mt-2.5 h-3.5 w-full" />
          <Skeleton className="mt-2.5 h-3.5 w-11/12" />
          <Skeleton className="mt-2.5 h-3.5 w-3/5" />
        </View>
      ))}
    </Card>
  );
}

/** Renders CMS pages from structured blocks (no HTML → no injection surface). */
export function CmsPageScreen({ route }) {
  const { slug } = route.params;
  const { api } = useApp();
  const q = useQuery({ queryKey: ['cms', slug], queryFn: () => api.get(`/api/v1/public/pages/${slug}`), staleTime: 60 * 60_000 });
  return (
    <Screen tone="hero" bg="canvas" scroll={!q.error}>
      <HeroHeader compact title={q.data?.title || ''} className="pb-14" />
      <View className="mx-4" style={{ marginTop: -40 }}>
        {q.isLoading ? <PageSkeleton /> : q.error ? (
          <Card className="py-2"><ErrorState error={q.error} onRetry={q.refetch} /></Card>
        ) : (
          <FadeInView>
            <Card className="p-5">
              <View className="flex-row items-center border-b border-line pb-4">
                <IconTile icon={FileText} tone="brand" size={40} />
                <View className="ml-3 flex-1">
                  <T variant="label">Version {q.data.version}</T>
                  <T variant="caption" tone="subtle" className="mt-0.5">Updated {dateLong(q.data.updatedAt)}</T>
                </View>
              </View>
              <View className="pb-1">
                {q.data.blocks.map((b, i) => <Block key={i} b={b} />)}
              </View>
            </Card>
          </FadeInView>
        )}
      </View>
    </Screen>
  );
}
