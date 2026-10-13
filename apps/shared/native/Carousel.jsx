import { useEffect, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { Dots } from './Motion';
import { cn } from './cn';

/**
 * Snapping horizontal carousel with page dots and optional auto-advance (`autoPlay` ms, paused while
 * the user drags, off with reduce motion). `itemWidth` is the card width; `inset` the side padding.
 */
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
      if (paused.current) return;
      const next = (indexRef.current + 1) % n;
      ref.current?.scrollToOffset({ offset: next * step, animated: true });
      indexRef.current = next;
      setIndex(next);
    }, autoPlay);
    return () => clearInterval(t);
  }, [autoPlay, reduce, n, step]);

  const settle = (x) => {
    const i = Math.max(0, Math.min(n - 1, Math.round(x / step)));
    indexRef.current = i;
    setIndex(i);
  };

  return (
    <View className={className} testID={testID}>
      <FlatList
        ref={ref}
        horizontal
        data={data}
        keyExtractor={keyExtractor}
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        disableIntervalMomentum
        contentContainerStyle={{ paddingHorizontal: inset }}
        ItemSeparatorComponent={() => <View style={{ width: gap }} />}
        renderItem={({ item, index: i }) => <View style={{ width: itemWidth }}>{renderItem({ item, index: i, active: i === index })}</View>}
        onScrollBeginDrag={() => { paused.current = true; }}
        onMomentumScrollEnd={(e) => { settle(e.nativeEvent.contentOffset.x); paused.current = false; }}
        getItemLayout={(_, i) => ({ length: step, offset: inset + step * i, index: i })}
      />
      {dots ? <Dots count={n} index={index} tone={dotsTone} className={cn('mt-3')} /> : null}
    </View>
  );
}
