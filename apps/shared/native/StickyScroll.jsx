import { createContext, useContext, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, useAnimatedReaction, interpolate, Extrapolation, runOnJS } from 'react-native-reanimated';

/** Scroll position (Reanimated shared value) of the nearest StickyScrollView. */
const ScrollY = createContext(null);

/**
 * ScrollView whose `sticky` overlay (a compact bar) fades/slides in once the user scrolls past
 * `threshold` px — e.g. Home's "Where to?" bar, Vehicle's title bar. Children can use <Parallax>.
 * Scroll tracking runs on the UI thread (useAnimatedScrollHandler).
 */
export function StickyScrollView({ children, sticky, threshold = 160, contentContainerClassName, refreshControl, keyboardShouldPersistTaps = 'handled', testID }) {
  const y = useSharedValue(0);
  const [active, setActive] = useState(false);
  const onScroll = useAnimatedScrollHandler((e) => { y.value = e.contentOffset.y; });
  useAnimatedReaction(() => y.value > threshold - 20, (on, prev) => { if (on !== prev) runOnJS(setActive)(on); }, [threshold]);
  const barStyle = useAnimatedStyle(() => {
    const t = interpolate(y.value, [threshold - 48, threshold], [0, 1], Extrapolation.CLAMP);
    return { opacity: t, transform: [{ translateY: (1 - t) * -16 }] };
  });
  return (
    <ScrollY.Provider value={y}>
      <View style={{ flex: 1 }}>
        <Animated.ScrollView style={{ flex: 1 }} onScroll={onScroll} scrollEventThrottle={16} refreshControl={refreshControl} keyboardShouldPersistTaps={keyboardShouldPersistTaps} testID={testID}>
          <View className={contentContainerClassName}>{children}</View>
        </Animated.ScrollView>
        {sticky ? (
          <Animated.View pointerEvents={active ? 'box-none' : 'none'} accessibilityElementsHidden={!active} importantForAccessibility={active ? 'auto' : 'no-hide-descendants'} style={[{ position: 'absolute', left: 0, right: 0, top: 0 }, barStyle]}>
            {sticky}
          </Animated.View>
        ) : null}
      </View>
    </ScrollY.Provider>
  );
}

/**
 * Parallax block for the top of a StickyScrollView: moves at `speed` × scroll and stretches when
 * pulled down (iOS overscroll). `height` is required.
 */
export function Parallax({ children, height, speed = 0.45 }) {
  const y = useContext(ScrollY);
  const fallback = useSharedValue(0);
  const sv = y || fallback;
  const style = useAnimatedStyle(() => {
    const v = sv.value;
    if (v < 0) return { transform: [{ translateY: v / 2 }, { scale: 1 + -v / height }] };
    return { transform: [{ translateY: v * speed }, { scale: 1 }] };
  });
  return (
    <View style={{ height, overflow: 'hidden' }}>
      <Animated.View style={[{ height }, style]}>{children}</Animated.View>
    </View>
  );
}
