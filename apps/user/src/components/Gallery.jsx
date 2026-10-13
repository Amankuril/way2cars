import { useState } from 'react';
import { View, Image, ScrollView, useWindowDimensions } from 'react-native';
import { CarFront } from 'lucide-react-native';
import { T, Dots } from '@shared/native';
import { colors } from '@shared/theme/tokens';

/** Full-width paging photo gallery with page dots and a position counter. */
export function Gallery({ photos = [], height = 240 }) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  if (!photos.length) return <View style={{ height }} className="items-center justify-center bg-ink-100"><CarFront size={48} color={colors.ink[300]} strokeWidth={1.4} /></View>;
  return (
    <View>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}>
        {photos.map((uri, i) => <Image key={uri} source={{ uri }} style={{ width, height }} resizeMode="cover" accessibilityLabel={`Photo ${i + 1} of ${photos.length}`} />)}
      </ScrollView>
      <View pointerEvents="none" className="absolute bottom-0 left-0 right-0 h-20 bg-black/10" />
      <Dots count={photos.length} index={index} tone="inverse" className="absolute bottom-9 left-0 right-0" />
      <View className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1">
        <T variant="caption" tone="inverse" className="font-semibold">{index + 1} / {photos.length}</T>
      </View>
    </View>
  );
}
