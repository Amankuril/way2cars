import { View, ScrollView, KeyboardAvoidingView, RefreshControl, SafeAreaView } from '../rn';
import { useNavigation } from '../nav';
import { ArrowLeft } from 'lucide-react';
import { T } from './Text';
import { IconButton } from './Button';
import { cn } from './cn';
import { colors, gradients, shadows } from '@shared/theme/tokens';

/**
 * Screen shell: safe area, optional scroll + keyboard handling + pull to refresh (touch).
 * `tone="hero"`: the screen starts with a <HeroHeader> — the safe-area top turns navy.
 * The footer is a sticky action bar with a soft upward shadow.
 */
export function Screen({ children, scroll = true, header, footer, refreshing, onRefresh, bg = 'canvas', tone, edges = ['top', 'bottom'], contentClassName, keyboardShouldPersistTaps = 'handled', scrollRef, testID }) {
  const hero = tone === 'hero';
  const body = scroll ? (
    <ScrollView
      ref={scrollRef}
      testID={testID}
      className="flex-1"
      contentContainerClassName={cn('pb-8', contentClassName)}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} colors={[colors.brand[500]]} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View className={cn('flex-1', contentClassName)} testID={testID}>{children}</View>
  );
  const surface = bg === 'canvas' ? 'bg-canvas' : 'bg-surface';
  const inner = (
    <>
      {header}
      <KeyboardAvoidingView className="flex-1">
        {body}
        {footer ? <View className="z-10 bg-surface px-4 pb-3 pt-3" style={{ boxShadow: shadows.bar }}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </>
  );
  if (hero) {
    return (
      <SafeAreaView edges={edges.filter((e) => e !== 'bottom')} style={{ flex: 1, backgroundColor: gradients.hero[0] }}>
        <SafeAreaView edges={edges.includes('bottom') ? ['bottom'] : []} className={cn('flex-1', surface)}>{inner}</SafeAreaView>
      </SafeAreaView>
    );
  }
  return <SafeAreaView edges={edges} className={cn('flex-1', surface)}>{inner}</SafeAreaView>;
}

/** App header with back navigation. Title is left-aligned, as in native Android apps. */
export function Header({ title, subtitle, back = true, right, onBack, transparent }) {
  const nav = useNavigation();
  return (
    <View className={cn('h-14 flex-row items-center px-1', !transparent && 'border-b border-line bg-surface')}>
      {back ? <IconButton icon={ArrowLeft} label="Go back" onPress={onBack || (() => nav.goBack())} /> : <View className="w-3" />}
      <View className="ml-1 flex-1">
        <T variant="headline" numberOfLines={1} accessibilityRole="header">{title}</T>
        {subtitle ? <T variant="caption" tone="subtle" numberOfLines={1}>{subtitle}</T> : null}
      </View>
      {right ? <View className="flex-row items-center pr-1">{right}</View> : null}
    </View>
  );
}

/** Section with a heading and optional trailing action. */
export function Section({ title, action, children, className, first }) {
  return (
    <View className={cn(first ? 'mt-4' : 'mt-7', className)}>
      {title ? (
        <View className="mb-3 flex-row items-end justify-between px-4">
          <T variant="headline">{title}</T>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Flat white panel used to group rows — hairline borders, no shadows. */
export function Panel({ children, className, padded = true }) {
  return <View className={cn('mx-4 rounded-lg border border-line bg-surface', padded && 'p-4', className)}>{children}</View>;
}

export const Divider = ({ className, inset }) => <View className={cn('h-px bg-line', inset && 'ml-4', className)} />;
