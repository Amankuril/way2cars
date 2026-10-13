import { View, ScrollView, KeyboardAvoidingView, Platform, StatusBar, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import { T } from './Text';
import { IconButton } from './Button';
import { cn } from './cn';
import { colors } from '../theme/tokens';

/** Screen shell: safe area, status bar, optional scroll + keyboard handling + pull to refresh. */
export function Screen({ children, scroll = true, header, footer, refreshing, onRefresh, bg = 'canvas', edges = ['top', 'bottom'], contentClassName, keyboardShouldPersistTaps = 'handled' }) {
  const body = scroll ? (
    <ScrollView
      className="flex-1"
      contentContainerClassName={cn('pb-8', contentClassName)}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} colors={[colors.brand[500]]} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View className={cn('flex-1', contentClassName)}>{children}</View>
  );
  return (
    <SafeAreaView edges={edges} className={cn('flex-1', bg === 'canvas' ? 'bg-canvas' : 'bg-surface')}>
      <StatusBar barStyle="dark-content" backgroundColor={bg === 'canvas' ? colors.canvas : colors.surface} />
      {header}
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {body}
        {footer ? <View className="border-t border-line bg-surface px-4 pb-3 pt-3">{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** App header with back navigation. Title is left-aligned, as in native Android apps. */
export function Header({ title, subtitle, back = true, right, onBack, transparent }) {
  const nav = useNavigation();
  return (
    <View className={cn('h-14 flex-row items-center px-1', !transparent && 'border-b border-line bg-surface')}>
      {back ? <IconButton icon={ArrowLeft} label="Go back" onPress={onBack || (() => nav.goBack())} /> : <View className="w-3" />}
      <View className="ml-1 flex-1">
        <T variant="headline" numberOfLines={1}>{title}</T>
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
