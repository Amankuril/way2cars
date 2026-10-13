import { useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withSequence, withTiming, useReducedMotion } from 'react-native-reanimated';
import { T } from './Text';
import { colors, shadows, motion } from '../theme/tokens';

/**
 * Bottom tab bar with a sliding pill behind the active icon and an icon "pop" on selection.
 * Presentational: items = [{ key, label, icon: (props) => node, badge, testID }].
 * For React Navigation use `tabBar={(p) => <NavTabBar {...p} />}`.
 */
export function AnimatedTabBar({ items, activeIndex, onSelect, bottomInset = 0 }) {
  const reduce = useReducedMotion();
  const [width, setWidth] = useState(0);
  const tabW = items.length ? width / items.length : 0;
  const x = useSharedValue(0);
  useEffect(() => {
    if (!tabW) return;
    x.value = reduce ? activeIndex * tabW : withSpring(activeIndex * tabW, motion.spring);
  }, [activeIndex, tabW, reduce, x]);
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View accessibilityRole="tablist" style={{ backgroundColor: colors.surface, paddingBottom: bottomInset, boxShadow: shadows.bar, borderTopWidth: 1, borderTopColor: colors.line }}>
      <View style={{ height: 64, flexDirection: 'row' }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {tabW ? (
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 7, left: 0, width: tabW, alignItems: 'center' }, pill]}>
            <View style={{ width: 60, height: 32, borderRadius: 16, backgroundColor: colors.brand[50] }} />
          </Animated.View>
        ) : null}
        {items.map((it, i) => <Tab key={it.key} item={it} focused={i === activeIndex} onPress={() => onSelect(i)} reduce={reduce} />)}
      </View>
    </View>
  );
}

function Tab({ item, focused, onPress, reduce }) {
  const s = useSharedValue(1);
  useEffect(() => {
    if (focused && !reduce) s.value = withSequence(withTiming(0.82, { duration: 90 }), withSpring(1, { damping: 9, stiffness: 260 }));
  }, [focused, reduce, s]);
  const icon = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const color = focused ? colors.brand[600] : colors.ink[500];
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={item.label} testID={item.testID} style={{ flex: 1, alignItems: 'center', paddingTop: 11 }}>
      <Animated.View style={[{ height: 24, justifyContent: 'center' }, icon]}>
        {item.icon({ color, focused, size: 22 })}
        {item.badge ? <View style={{ position: 'absolute', right: -5, top: -1, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger[500], borderWidth: 2, borderColor: colors.surface }} /> : null}
      </Animated.View>
      <T variant="caption" className={focused ? 'mt-2 text-[11px] font-bold text-brand-700' : 'mt-2 text-[11px] font-semibold text-ink-500'} numberOfLines={1}>{item.label}</T>
    </Pressable>
  );
}

/** Adapter for @react-navigation/bottom-tabs: `<Tab.Navigator tabBar={(p) => <NavTabBar {...p} />}>`. */
export function NavTabBar({ state, descriptors, navigation, insets }) {
  const items = state.routes.map((route) => {
    const { options } = descriptors[route.key];
    const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : options.title ?? route.name;
    return { key: route.key, label, icon: options.tabBarIcon || (() => null), badge: options.tabBarBadge, testID: options.tabBarButtonTestID || `tab-${route.name}` };
  });
  const onSelect = (i) => {
    const route = state.routes[i];
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (state.index !== i && !event.defaultPrevented) navigation.navigate(route.name, route.params);
  };
  return <AnimatedTabBar items={items} activeIndex={state.index} onSelect={onSelect} bottomInset={insets?.bottom || 0} />;
}
