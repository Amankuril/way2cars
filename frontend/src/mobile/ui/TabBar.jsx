import { useState } from 'react';
import { View, Pressable } from '../rn';
import { T } from './Text';
import { colors, shadows } from '@shared/theme/tokens';
import './kit.css';

/**
 * Web port of apps/shared/native/TabBar.jsx (AnimatedTabBar): sliding pill + icon pop.
 * Plugged into the router with `tabs: { Main: { …, tabBar: AnimatedTabBar } }` (see mobile/nav.jsx).
 */
export function AnimatedTabBar({ items, activeIndex, onSelect, bottomInset = 0 }) {
  const [width, setWidth] = useState(0);
  const tabW = items.length ? width / items.length : 0;
  return (
    <View accessibilityRole="tablist" style={{ backgroundColor: colors.surface, paddingBottom: `calc(${bottomInset}px + env(safe-area-inset-bottom))`, boxShadow: shadows.bar, borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: colors.line, zIndex: 10 }}>
      <View style={{ height: 64, flexDirection: 'row' }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {tabW ? (
          <View pointerEvents="none" className="w2c-tab-pill" style={{ position: 'absolute', top: 7, left: 0, width: tabW, alignItems: 'center', transform: `translateX(${activeIndex * tabW}px)` }}>
            <View style={{ width: 60, height: 32, borderRadius: 16, backgroundColor: colors.brand[50] }} />
          </View>
        ) : null}
        {items.map((it, i) => <Tab key={it.key} item={it} focused={i === activeIndex} onPress={() => onSelect(i)} />)}
      </View>
    </View>
  );
}

function Tab({ item, focused, onPress }) {
  const color = focused ? colors.brand[600] : colors.ink[500];
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={item.label} testID={item.testID} style={{ flex: 1, alignItems: 'center', paddingTop: 11 }}>
      <View key={focused ? 'on' : 'off'} className={focused ? 'w2c-pop' : undefined} style={{ height: 24, justifyContent: 'center' }}>
        {item.icon({ color, focused, size: 22 })}
        {item.badge ? <View style={{ position: 'absolute', right: -5, top: -1, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger[500], borderWidth: 2, borderStyle: 'solid', borderColor: colors.surface }} /> : null}
      </View>
      <T variant="caption" className={focused ? 'mt-2 text-[11px] font-bold text-brand-700' : 'mt-2 text-[11px] font-semibold text-ink-500'} numberOfLines={1}>{item.label}</T>
    </Pressable>
  );
}
