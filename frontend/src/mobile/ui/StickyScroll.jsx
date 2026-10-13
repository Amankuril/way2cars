import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from '../rn';
import './kit.css';

/*
 * Web port of apps/shared/native/StickyScroll.jsx. Reanimated's UI-thread scroll handler becomes a
 * passive scroll listener that writes styles straight to the DOM once per animation frame (no React
 * re-render per scroll event).
 */
const ScrollY = createContext(null);

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function StickyScrollView({ children, sticky, threshold = 160, contentContainerClassName, refreshControl, keyboardShouldPersistTaps = 'handled', testID }) {
  const listeners = useRef(new Set());
  const bar = useRef(null);
  const yRef = useRef(0);
  const frame = useRef(0);
  const [active, setActive] = useState(false);
  const activeRef = useRef(false);

  const paint = useCallback(() => {
    frame.current = 0;
    const y = yRef.current;
    const t = clamp01((y - (threshold - 48)) / 48);
    if (bar.current) {
      bar.current.style.opacity = String(t);
      bar.current.style.transform = `translateY(${(1 - t) * -16}px)`;
    }
    const on = y > threshold - 20;
    if (on !== activeRef.current) { activeRef.current = on; setActive(on); }
    listeners.current.forEach((fn) => fn(y));
  }, [threshold]);

  useEffect(() => { paint(); return () => cancelAnimationFrame(frame.current); }, [paint]);

  const onScroll = (e) => {
    yRef.current = e.nativeEvent.contentOffset.y;
    if (!frame.current) frame.current = requestAnimationFrame(paint);
  };

  const ctx = useRef({ subscribe: (fn) => { listeners.current.add(fn); fn(yRef.current); return () => listeners.current.delete(fn); } }).current;

  return (
    <ScrollY.Provider value={ctx}>
      <View className="flex-1">
        <ScrollView className="flex-1" onScroll={onScroll} scrollEventThrottle={16} refreshControl={refreshControl} keyboardShouldPersistTaps={keyboardShouldPersistTaps} testID={testID}>
          <View className={contentContainerClassName}>{children}</View>
        </ScrollView>
        {sticky ? (
          <View ref={bar} className="w2c-sticky" pointerEvents={active ? 'box-none' : 'none'} accessibilityElementsHidden={!active} style={{ position: 'absolute', left: 0, right: 0, top: 0, opacity: 0, zIndex: 20 }}>
            {sticky}
          </View>
        ) : null}
      </View>
    </ScrollY.Provider>
  );
}

export function Parallax({ children, height, speed = 0.45 }) {
  const ctx = useContext(ScrollY);
  const inner = useRef(null);
  useEffect(() => {
    if (!ctx) return undefined;
    return ctx.subscribe((y) => {
      if (!inner.current) return;
      inner.current.style.transform = y < 0 ? `translateY(${y / 2}px) scale(${1 + -y / height})` : `translateY(${y * speed}px)`;
    });
  }, [ctx, height, speed]);
  return (
    <View style={{ height, overflow: 'hidden' }}>
      <View ref={inner} style={{ height, willChange: 'transform' }}>{children}</View>
    </View>
  );
}
