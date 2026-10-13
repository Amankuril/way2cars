import { useRef, useState } from 'react';
import { View, Image, ScrollView, Pressable, useWindowDimensions } from '@/mobile/rn';
import { CarFront, ChevronLeft, ChevronRight } from 'lucide-react';
import { T, Dots } from '@/mobile/ui';
import { colors } from '@shared/theme/tokens';

// Web: a mouse can't swipe, so desktop (fine pointer + hover) gets prev/next buttons. Touch devices match native.
const hasFinePointer = () => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

/** Full-width paging photo gallery with page dots and a position counter. */
export function Gallery({ photos = [], height = 240 }) {
  const win = useWindowDimensions();
  const [measured, setMeasured] = useState(null); // web: the frame's inner width (borders) can be < window width
  const width = measured || win.width;
  const [index, setIndex] = useState(0);
  const scroller = useRef(null);
  const [finePointer] = useState(hasFinePointer);
  if (!photos.length) return <View style={{ height }} className="items-center justify-center bg-ink-100"><CarFront size={48} color={colors.ink[300]} strokeWidth={1.4} /></View>;
  const go = (i) => scroller.current?.scrollTo({ x: Math.max(0, Math.min(photos.length - 1, i)) * width, animated: true });
  const arrow = (Icon, i, side, label) => (
    <Pressable onPress={() => go(i)} accessibilityLabel={label} className={`absolute ${side} top-1/2 -mt-5 h-10 w-10 items-center justify-center rounded-full bg-black/45 active:bg-black/60`}>
      <Icon size={22} color="#fff" />
    </Pressable>
  );
  return (
    <View onLayout={(e) => setMeasured(Math.round(e.nativeEvent.layout.width) || null)}>
      <ScrollView ref={scroller} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}>
        {photos.map((uri, i) => <Image key={uri} source={{ uri }} style={{ width, height }} resizeMode="cover" accessibilityLabel={`Photo ${i + 1} of ${photos.length}`} />)}
      </ScrollView>
      <View pointerEvents="none" className="absolute bottom-0 left-0 right-0 h-20 bg-black/10" />
      <Dots count={photos.length} index={index} tone="inverse" className="absolute bottom-9 left-0 right-0" />
      <View className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1">
        <T variant="caption" tone="inverse" className="font-semibold">{index + 1} / {photos.length}</T>
      </View>
      {finePointer && photos.length > 1 ? (
        <>
          {index > 0 ? arrow(ChevronLeft, index - 1, 'left-3', 'Previous photo') : null}
          {index < photos.length - 1 ? arrow(ChevronRight, index + 1, 'right-3', 'Next photo') : null}
        </>
      ) : null}
    </View>
  );
}
