import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from '../rn';
import { Dots, useReducedMotion } from './Motion';

/** Web port of apps/shared/native/Carousel.jsx (CSS scroll-snap; same props). */
export function Carousel({ data = [], renderItem, keyExtractor = (it, i) => String(it?.id ?? i), itemWidth, gap = 12, inset = 16, autoPlay = 0, dots = true, dotsTone = 'brand', className, testID }) {
  const ref = useRef(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const paused = useRef(false);
  const reduce = useReducedMotion();
  const step = itemWidth + gap;
  const n = data.length;

  useEffect(() => {
    if (!autoPlay || reduce || n < 2) return undefined;
    const t = setInterval(() => {
      if (paused.current || document.hidden) return;
      const next = (indexRef.current + 1) % n;
      ref.current?.scrollTo({ x: next * step, animated: true });
      indexRef.current = next;
      setIndex(next);
    }, autoPlay);
    return () => clearInterval(t);
  }, [autoPlay, reduce, n, step]);

  const settle = (x) => {
    const i = Math.max(0, Math.min(n - 1, Math.round(x / step)));
    indexRef.current = i;
    setIndex(i);
    paused.current = false;
  };

  return (
    <View className={className} testID={testID}>
      <ScrollView
        ref={ref}
        horizontal
        snapToInterval={step}
        showsHorizontalScrollIndicator={false}
        style={{ scrollPaddingInline: inset }}
        contentContainerStyle={{ paddingLeft: inset, paddingRight: inset }}
        onScrollBeginDrag={() => { paused.current = true; }}
        onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.x)}
      >
        {data.map((item, i) => (
          <View key={keyExtractor(item, i)} style={{ width: itemWidth, marginRight: i < n - 1 ? gap : 0 }}>
            {renderItem({ item, index: i, active: i === index })}
          </View>
        ))}
      </ScrollView>
      {dots ? <Dots count={n} index={index} tone={dotsTone} className="mt-3" /> : null}
    </View>
  );
}
