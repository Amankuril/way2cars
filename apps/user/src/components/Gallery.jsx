import { useState } from 'react';
import { View, Image, ScrollView, useWindowDimensions } from 'react-native';
import { T } from '@shared/native';

/** Full-width paging photo gallery with a position counter. */
export function Gallery({ photos = [], height = 240 }) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  if (!photos.length) return <View style={{ height }} className="bg-ink-100" />;
  return (
    <View>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}>
        {photos.map((uri, i) => <Image key={uri} source={{ uri }} style={{ width, height }} resizeMode="cover" accessibilityLabel={`Photo ${i + 1} of ${photos.length}`} />)}
      </ScrollView>
      <View className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1">
        <T variant="caption" tone="inverse">{index + 1} / {photos.length}</T>
      </View>
    </View>
  );
}
