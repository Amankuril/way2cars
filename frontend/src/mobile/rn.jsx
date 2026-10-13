/**
 * React Native primitives for the DOM.
 *
 * Lets NativeWind screens from apps/user and apps/vendor be ported by changing
 * `from 'react-native'` → `from '@/mobile/rn'`. Each primitive accepts the RN props that the
 * apps use (className, style objects/arrays, onPress, accessibility*, testID…) and renders plain
 * DOM + Tailwind. Layout defaults mirror Yoga (see `.rn-*` classes in src/index.css).
 */
import {
  Children, Fragment, createContext, forwardRef, isValidElement, useCallback, useContext, useEffect,
  useImperativeHandle, useLayoutEffect, useRef, useState, useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from './tw';

// ------------------------------------------------------------------------------------ helpers

/** Max width of the phone column on desktop (MobileFrame). Dimensions report this, not the window. */
export const FRAME_MAX_WIDTH = 480;

/** DOM node that Modals, toasts and dialogs portal into (provided by MobileFrame). */
export const OverlayContext = createContext(null);

const ROLE = {
  button: 'button', link: 'link', header: 'heading', heading: 'heading', image: 'img', imagebutton: 'button',
  tab: 'tab', tablist: 'tablist', checkbox: 'checkbox', switch: 'switch', radio: 'radio', radiogroup: 'radiogroup',
  search: 'search', alert: 'alert', adjustable: 'slider', menu: 'menu', menuitem: 'menuitem', progressbar: 'progressbar',
  list: 'list', summary: 'region', combobox: 'combobox', toolbar: 'toolbar', timer: 'timer',
};
const DOM_EVENT = /^on(Click|DoubleClick|ContextMenu|Mouse|Pointer|Key|Focus|Blur|Touch|Wheel|Scroll|Drag|Drop|Copy|Cut|Paste|Animation|Transition)/;
const DOM_ATTR = new Set(['id', 'title', 'tabIndex', 'role', 'dir', 'lang', 'hidden', 'draggable']);

/** Maps RN accessibility props to ARIA and keeps only props React DOM understands (no unknown-prop warnings). */
function domProps(p) {
  const out = {};
  for (const k in p) {
    if (DOM_ATTR.has(k) || k.startsWith('aria-') || k.startsWith('data-') || (DOM_EVENT.test(k) && typeof p[k] === 'function')) out[k] = p[k];
  }
  if (p.accessibilityLabel != null) out['aria-label'] = p.accessibilityLabel;
  const role = p.accessibilityRole;
  if (role && ROLE[role]) out.role = ROLE[role];
  if (role === 'header') out['aria-level'] = 2;
  const s = p.accessibilityState;
  if (s) {
    if (s.disabled) out['aria-disabled'] = true;
    if (s.selected != null) out['aria-selected'] = !!s.selected;
    if (s.checked != null) out['aria-checked'] = s.checked === 'mixed' ? 'mixed' : !!s.checked;
    if (s.expanded != null) out['aria-expanded'] = !!s.expanded;
    if (s.busy) out['aria-busy'] = true;
  }
  if (p.accessibilityHint) out['aria-description'] = p.accessibilityHint;
  if (p.accessibilityLiveRegion && p.accessibilityLiveRegion !== 'none') out['aria-live'] = p.accessibilityLiveRegion;
  if (p.accessibilityElementsHidden || p.importantForAccessibility === 'no-hide-descendants') out['aria-hidden'] = true;
  if (p.testID) out['data-testid'] = p.testID;
  if (p.nativeID) out.id = p.nativeID;
  return out;
}

const EXPAND = {
  marginHorizontal: ['marginLeft', 'marginRight'], marginVertical: ['marginTop', 'marginBottom'],
  paddingHorizontal: ['paddingLeft', 'paddingRight'], paddingVertical: ['paddingTop', 'paddingBottom'],
  marginStart: ['marginInlineStart'], marginEnd: ['marginInlineEnd'], paddingStart: ['paddingInlineStart'], paddingEnd: ['paddingInlineEnd'],
  start: ['insetInlineStart'], end: ['insetInlineEnd'],
  borderStartWidth: ['borderInlineStartWidth'], borderEndWidth: ['borderInlineEndWidth'],
  borderTopStartRadius: ['borderStartStartRadius'], borderTopEndRadius: ['borderStartEndRadius'],
  borderBottomStartRadius: ['borderEndStartRadius'], borderBottomEndRadius: ['borderEndEndRadius'],
};
const IGNORED_STYLE = new Set(['tintColor', 'textAlignVertical', 'includeFontPadding', 'overlayColor', 'resizeMode', 'elevation',
  'shadowColor', 'shadowOffset', 'shadowOpacity', 'shadowRadius', 'textShadowColor', 'textShadowOffset', 'textShadowRadius']);
const PX_TRANSFORM = /^translate/;
const transformToCss = (t) => Object.entries(t).map(([k, v]) => `${k}(${typeof v === 'number' && PX_TRANSFORM.test(k) ? `${v}px` : v})`).join(' ');

/** RN style (object | array | falsy, nested) → React DOM style object. */
export function flattenStyle(style) {
  if (!style) return undefined;
  if (Array.isArray(style)) {
    const merged = {};
    for (const s of style) Object.assign(merged, flattenStyle(s));
    return merged;
  }
  if (typeof style !== 'object') return undefined;
  const out = {};
  for (const k in style) {
    const v = style[k];
    if (v == null) continue;
    if (EXPAND[k]) {
      for (const t of EXPAND[k]) out[t] = v;
    } else if (k === 'transform') {
      out.transform = Array.isArray(v) ? v.map(transformToCss).join(' ') : v;
    } else if (k === 'fontVariant') {
      out.fontVariantNumeric = (Array.isArray(v) ? v : [v]).join(' ');
    } else if (k === 'lineHeight') {
      out.lineHeight = typeof v === 'number' ? `${v}px` : v;
    } else if (k === 'flex' && typeof v === 'number') {
      out.flex = v > 0 ? `${v} 1 0%` : v === 0 ? '0 0 auto' : '0 1 auto';
    } else if (k === 'fontWeight') {
      out.fontWeight = v === 'normal' ? 400 : v === 'bold' ? 700 : v;
    } else if (!IGNORED_STYLE.has(k)) {
      out[k] = v;
    }
  }
  if (style.resizeMode) out.objectFit = RESIZE[style.resizeMode] || 'cover';
  if (style.shadowOpacity || style.elevation) {
    const h = style.shadowOffset?.height ?? Math.round((style.elevation || 2) / 2);
    const r = style.shadowRadius ?? style.elevation ?? 4;
    out.boxShadow = `0 ${h}px ${r * 2}px rgba(14, 23, 27, ${style.shadowOpacity ?? 0.12})`;
  }
  return out;
}

function pointerEventsClass(pe) {
  return pe === 'none' ? 'pointer-events-none' : pe === 'box-none' ? 'rn-box-none' : pe === 'box-only' ? 'rn-box-only' : null;
}

function setRef(ref, value) {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}
function useMergedRef(...refs) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((node) => refs.forEach((r) => setRef(r, node)), refs);
}

/** onLayout({ nativeEvent: { layout: { x, y, width, height } } }) via ResizeObserver. */
function useOnLayout(ref, onLayout) {
  const cb = useRef(onLayout);
  cb.current = onLayout;
  const enabled = !!onLayout;
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      cb.current?.({ nativeEvent: { layout: { x: el.offsetLeft, y: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight } } });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, enabled]);
}

const renderNode = (C, props) => (C == null || C === false ? null : isValidElement(C) ? C : typeof C === 'function' ? <C {...props} /> : C);

// ---------------------------------------------------------------------------------- View/Text

export const View = forwardRef(function View({ className, style, children, pointerEvents, onLayout, ...rest }, ref) {
  const inner = useRef(null);
  useOnLayout(inner, onLayout);
  return (
    <div ref={useMergedRef(ref, inner)} className={cn('rn-view', pointerEventsClass(pointerEvents), className)} style={flattenStyle(style)} {...domProps(rest)}>
      {children}
    </div>
  );
});

const TextAncestor = createContext(false);

/**
 * RN <Text>. Outermost renders a block <div>; nested Text renders an inline <span> (RN semantics).
 * numberOfLines → ellipsis/line-clamp. onPress makes it a keyboard-accessible link-like element.
 */
export const Text = forwardRef(function Text({ className, style, children, numberOfLines, onPress, onLongPress, selectable, ellipsizeMode, adjustsFontSizeToFit, allowFontScaling, maxFontSizeMultiplier, minimumFontScale, ...rest }, ref) {
  const nested = useContext(TextAncestor);
  const Tag = nested ? 'span' : 'div';
  const clamp = numberOfLines === 1 ? 'rn-text-1' : numberOfLines > 1 ? 'rn-text-clamp' : null;
  const st = flattenStyle(style) || {};
  if (numberOfLines > 1) st.WebkitLineClamp = numberOfLines;
  const press = onPress
    ? {
        onClick: (e) => { e.stopPropagation(); onPress(e); },
        onKeyDown: (e) => { if (e.key === 'Enter') { e.preventDefault(); onPress(e); } },
        tabIndex: 0,
        role: 'link',
      }
    : null;
  return (
    <TextAncestor.Provider value>
      <Tag ref={ref} className={cn(nested ? 'rn-text-nested' : 'rn-text', clamp, onPress && 'cursor-pointer', className)} style={st} {...domProps(rest)} {...press}>
        {children}
      </Tag>
    </TextAncestor.Provider>
  );
});

// ---------------------------------------------------------------------------------- Pressables

/**
 * RN <Pressable>: a focusable div[role=button] (never <button>, so nesting is valid HTML).
 * `active:` Tailwind variants give the pressed look; className/style/children may be functions of { pressed }.
 * Inner presses do not bubble to outer Pressables (RN responder semantics).
 */
export const Pressable = forwardRef(function Pressable({ onPress, onPressIn, onPressOut, onLongPress, delayLongPress = 500, disabled, className, style, children, hitSlop, pressRetentionOffset, android_ripple, android_disableSound, unstable_pressDelay, pointerEvents, onLayout, ...rest }, ref) {
  const [pressed, setPressed] = useState(false);
  const inner = useRef(null);
  const longTimer = useRef(null);
  const longFired = useRef(false);
  useOnLayout(inner, onLayout);
  const state = { pressed, hovered: false, focused: false };
  const cls = typeof className === 'function' ? className(state) : className;
  const st = typeof style === 'function' ? style(state) : style;
  const kids = typeof children === 'function' ? children(state) : children;
  const interactive = !disabled && (onPress || onLongPress || onPressIn);
  const end = (e) => {
    clearTimeout(longTimer.current);
    if (pressed) { setPressed(false); onPressOut?.(e); }
  };
  const handlers = interactive
    ? {
        onPointerDown: (e) => {
          if (e.button && e.button !== 0) return;
          longFired.current = false;
          setPressed(true);
          onPressIn?.(e);
          if (onLongPress) longTimer.current = setTimeout(() => { longFired.current = true; onLongPress(e); }, delayLongPress);
        },
        onPointerUp: end,
        onPointerLeave: end,
        onPointerCancel: end,
        onClick: (e) => {
          e.stopPropagation();
          if (longFired.current) { longFired.current = false; return; }
          onPress?.(e);
        },
        onKeyDown: (e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPress?.(e); }
        },
      }
    : null;
  const dom = domProps(rest);
  return (
    <div
      ref={useMergedRef(ref, inner)}
      role={onPress || onLongPress ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-disabled={disabled || undefined}
      {...dom}
      className={cn('rn-view', interactive && 'rn-pressable', disabled && 'rn-disabled', pointerEventsClass(pointerEvents), cls)}
      style={flattenStyle(st)}
      {...handlers}
    >
      {kids}
    </div>
  );
});

export const TouchableOpacity = forwardRef(function TouchableOpacity({ activeOpacity = 0.2, className, ...props }, ref) {
  return <Pressable ref={ref} {...props} className={({ pressed }) => cn('transition-opacity', className, pressed && 'opacity-[var(--rn-ao)]')} style={[{ '--rn-ao': activeOpacity }, props.style]} />;
});
export const TouchableHighlight = forwardRef(function TouchableHighlight({ underlayColor, ...props }, ref) {
  return <Pressable ref={ref} {...props} style={({ pressed }) => [props.style, pressed && underlayColor ? { backgroundColor: underlayColor } : null]} />;
});
export const TouchableWithoutFeedback = forwardRef(function TouchableWithoutFeedback({ children, ...props }, ref) {
  return <Pressable ref={ref} {...props}>{children}</Pressable>;
});

/** RN core <Button> (rarely used; the design-system Button lives in @/mobile/ui). */
export function Button({ title, onPress, color = '#1875B9', disabled, accessibilityLabel, testID }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityLabel={accessibilityLabel} testID={testID} className={cn('h-10 items-center justify-center rounded px-4', disabled && 'opacity-50')} style={{ backgroundColor: color }}>
      <Text className="text-label font-semibold uppercase text-white">{title}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------------- Image

const RESIZE = { cover: 'cover', contain: 'contain', stretch: 'fill', center: 'none', repeat: 'none' };
const blobCache = new Map(); // uri → Promise<objectURL> for header-authenticated sources

function resolveSource(source) {
  if (!source) return null;
  if (Array.isArray(source)) return resolveSource(source[0]);
  if (typeof source === 'string') return { uri: source };
  if (typeof source === 'number') return null; // require() ids do not exist on the web — import the asset instead
  if (typeof source === 'object' && source.default) return { uri: source.default };
  return source.uri ? source : null;
}

/** Private files: fetch with the source headers (e.g. Authorization) and show a blob URL. */
function useSourceUri(src) {
  const uri = src?.uri;
  const headers = src?.headers;
  const authed = !!(headers && Object.keys(headers).length && !/^(data|blob):/.test(uri || ''));
  const [blobUri, setBlobUri] = useState(null);
  const [failed, setFailed] = useState(false);
  const headerKey = authed ? JSON.stringify(headers) : '';
  useEffect(() => {
    if (!authed || !uri) return undefined;
    let alive = true;
    setFailed(false);
    let p = blobCache.get(uri);
    if (!p) {
      p = fetch(uri, { headers: { 'X-W2C-Client': 'web', ...headers }, credentials: 'same-origin' })
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((b) => URL.createObjectURL(b));
      p.catch(() => blobCache.delete(uri));
      blobCache.set(uri, p);
      if (blobCache.size > 150) blobCache.delete(blobCache.keys().next().value);
    }
    p.then((u) => alive && setBlobUri(u), () => alive && setFailed(true));
    return () => { alive = false; };
  }, [uri, authed, headerKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!uri) return { uri: null, failed: false };
  return authed ? { uri: blobUri, failed } : { uri, failed: false };
}

export const Image = forwardRef(function Image({ source, src, defaultSource, resizeMode, className, style, onLoad, onError, onLoadEnd, onLoadStart, accessibilityLabel, alt, blurRadius, fadeDuration, progressiveRenderingEnabled, accessibilityIgnoresInvertColors, ...rest }, ref) {
  const resolved = resolveSource(source || src);
  const { uri, failed } = useSourceUri(resolved);
  const fallback = resolveSource(defaultSource)?.uri;
  const st = flattenStyle(style) || {};
  if (resolved?.width && st.width == null) st.width = resolved.width;
  if (resolved?.height && st.height == null) st.height = resolved.height;
  if (resizeMode) st.objectFit = RESIZE[resizeMode] || 'cover';
  if (blurRadius) st.filter = `blur(${blurRadius}px)`;
  const shown = uri || fallback;
  if (!shown || failed) {
    // Keeps the box (RN shows an empty frame while loading or on error).
    return <div ref={ref} role={accessibilityLabel ? 'img' : undefined} aria-label={accessibilityLabel} className={cn('rn-view rn-image', className)} style={st} {...domProps(rest)} />;
  }
  return (
    <img
      ref={ref}
      src={shown}
      alt={accessibilityLabel || alt || ''}
      draggable={false}
      decoding="async"
      className={cn('rn-image', className)}
      style={st}
      onLoad={(e) => {
        onLoad?.({ nativeEvent: { source: { width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight, uri: shown } } });
        onLoadEnd?.();
      }}
      onError={(e) => { onError?.({ nativeEvent: { error: 'Image failed to load' } }); onLoadEnd?.(e); }}
      {...domProps(rest)}
    />
  );
});
Image.getSize = (uri, ok, fail) => {
  const img = new window.Image();
  img.onload = () => ok?.(img.naturalWidth, img.naturalHeight);
  img.onerror = () => fail?.(new Error('Image failed to load'));
  img.src = uri;
};
Image.prefetch = (uri) => new Promise((resolve) => { const img = new window.Image(); img.onload = () => resolve(true); img.onerror = () => resolve(false); img.src = uri; });
Image.resolveAssetSource = (s) => resolveSource(s);

export function ImageBackground({ source, resizeMode = 'cover', imageStyle, imageClassName, className, style, children, ...rest }) {
  return (
    <View className={className} style={style} {...rest}>
      <Image source={source} resizeMode={resizeMode} className={cn('absolute inset-0 h-full w-full', imageClassName)} style={imageStyle} />
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------------- ScrollView

function scrollEvent(el) {
  return {
    nativeEvent: {
      contentOffset: { x: el.scrollLeft, y: el.scrollTop },
      contentSize: { width: el.scrollWidth, height: el.scrollHeight },
      layoutMeasurement: { width: el.clientWidth, height: el.clientHeight },
    },
  };
}

/** Pull-to-refresh for touch screens (RefreshControl). Indicator only shows for user-initiated refreshes. */
function usePullToRefresh(elRef, rc) {
  const [pull, setPull] = useState(0);
  const [userRefresh, setUserRefresh] = useState(false);
  const start = useRef(null);
  const refreshing = !!rc?.refreshing;
  useEffect(() => { if (!refreshing) setUserRefresh(false); }, [refreshing]);
  const handlers = rc?.onRefresh && rc.enabled !== false
    ? {
        onTouchStart: (e) => { start.current = elRef.current?.scrollTop <= 0 ? e.touches[0].clientY : null; },
        onTouchMove: (e) => {
          if (start.current == null) return;
          const dy = e.touches[0].clientY - start.current;
          setPull(dy > 0 && elRef.current?.scrollTop <= 0 ? Math.min(dy * 0.45, 90) : 0);
        },
        onTouchEnd: () => {
          if (pull >= 60) { setUserRefresh(true); rc.onRefresh(); }
          start.current = null;
          setPull(0);
        },
      }
    : null;
  const height = pull || (userRefresh && refreshing ? 52 : 0);
  const indicator = height ? (
    <div className="rn-view items-center justify-end overflow-hidden" style={{ height, transition: pull ? 'none' : 'height 160ms ease' }}>
      <div className="rn-view mb-2 h-9 w-9 items-center justify-center rounded-full bg-surface shadow-pop">
        <Spinner size={20} color={rc.colors?.[0] || rc.tintColor || '#1875B9'} spin={!pull || pull >= 60} progress={pull / 60} />
      </div>
    </div>
  ) : null;
  return { handlers, indicator };
}

export const ScrollView = forwardRef(function ScrollView(props, ref) {
  const {
    horizontal, className, style, contentContainerClassName, contentContainerStyle, children, refreshControl,
    onScroll, onMomentumScrollEnd, onScrollEndDrag, onScrollBeginDrag, scrollEnabled = true, onContentSizeChange, pagingEnabled, snapToInterval,
    showsVerticalScrollIndicator, showsHorizontalScrollIndicator, keyboardShouldPersistTaps, keyboardDismissMode, decelerationRate,
    nestedScrollEnabled, bounces, overScrollMode, scrollEventThrottle, stickyHeaderIndices, alwaysBounceVertical, contentInsetAdjustmentBehavior,
    automaticallyAdjustContentInsets, contentOffset, snapToAlignment, disableIntervalMomentum, invertStickyHeaders, pointerEvents, onLayout,
    __before, __after, ...rest
  } = props;
  const el = useRef(null);
  const content = useRef(null);
  useOnLayout(el, onLayout);
  const { handlers: ptr, indicator } = usePullToRefresh(el, refreshControl?.props);

  useImperativeHandle(ref, () => ({
    scrollTo: (a, b, animated) => {
      const o = typeof a === 'object' && a ? a : { y: a, x: b, animated };
      el.current?.scrollTo({ left: o.x ?? el.current.scrollLeft, top: o.y ?? el.current.scrollTop, behavior: o.animated === false ? 'auto' : 'smooth' });
    },
    scrollToEnd: (o = {}) => {
      const n = el.current;
      if (n) n.scrollTo({ left: horizontal ? n.scrollWidth : 0, top: horizontal ? 0 : n.scrollHeight, behavior: o.animated === false ? 'auto' : 'smooth' });
    },
    scrollToOffset: ({ offset = 0, animated } = {}) => el.current?.scrollTo({ [horizontal ? 'left' : 'top']: offset, behavior: animated === false ? 'auto' : 'smooth' }),
    flashScrollIndicators: () => {},
    getScrollableNode: () => el.current,
    getInnerViewNode: () => content.current,
  }), [horizontal]);

  const sizeCb = useRef(onContentSizeChange);
  sizeCb.current = onContentSizeChange;
  const wantsSize = !!onContentSizeChange;
  useEffect(() => {
    const n = content.current;
    if (!wantsSize || !n || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => sizeCb.current?.(n.scrollWidth, n.scrollHeight));
    ro.observe(n);
    return () => ro.disconnect();
  }, [wantsSize]);

  const endTimer = useRef(null);
  const handleScroll = onScroll || onMomentumScrollEnd || onScrollEndDrag
    ? (e) => {
        const ev = scrollEvent(e.currentTarget);
        onScroll?.(ev);
        if (onMomentumScrollEnd || onScrollEndDrag) {
          clearTimeout(endTimer.current);
          endTimer.current = setTimeout(() => { onMomentumScrollEnd?.(ev); onScrollEndDrag?.(ev); }, 120);
        }
      }
    : undefined;

  const snapping = pagingEnabled || snapToInterval;
  return (
    <div
      ref={el}
      className={cn('rn-view rn-scroll', scrollEnabled ? (horizontal ? 'rn-scroll-x' : 'rn-scroll-y') : 'rn-scroll-static', horizontal && 'flex-row', snapping && horizontal && 'rn-snap', pointerEventsClass(pointerEvents), className)}
      style={flattenStyle(style)}
      onScroll={handleScroll}
      onPointerDown={onScrollBeginDrag ? (e) => onScrollBeginDrag(scrollEvent(e.currentTarget)) : undefined}
      {...ptr}
      {...domProps(rest)}
    >
      <div ref={content} className={cn('rn-view rn-scroll-content', horizontal && 'flex-row', contentContainerClassName)} style={flattenStyle(contentContainerStyle)}>
        {indicator}
        {__before}
        {children}
        {__after}
      </div>
    </div>
  );
});

/** Props are read by ScrollView/FlatList; renders nothing by itself. */
export function RefreshControl() {
  return null;
}

// ---------------------------------------------------------------------------------- Lists

/** Calls onEndReached when the end sentinel comes within `threshold` viewports (once per data length). */
function EndSentinel({ onEndReached, threshold = 0.5, length, horizontal }) {
  const ref = useRef(null);
  const cb = useRef(onEndReached);
  cb.current = onEndReached;
  const lastLen = useRef(-1);
  useEffect(() => {
    const n = ref.current;
    if (!n || typeof IntersectionObserver === 'undefined') return undefined;
    const margin = `${Math.round(Math.max(threshold, 0.05) * (horizontal ? window.innerWidth : window.innerHeight))}px`;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && lastLen.current !== length) {
        lastLen.current = length;
        cb.current?.({ distanceFromEnd: 0 });
      }
    }, { rootMargin: horizontal ? `0px ${margin} 0px 0px` : `0px 0px ${margin} 0px` });
    io.observe(n);
    return () => io.disconnect();
  }, [length, threshold, horizontal]);
  return <div ref={ref} aria-hidden style={{ width: 1, height: 1, flexShrink: 0 }} />;
}

const noopSeparators = { highlight() {}, unhighlight() {}, updateProps() {} };
const defaultKey = (item, index) => (item && typeof item === 'object' ? item.key ?? item.id ?? item._id ?? index : index);

/**
 * RN <FlatList> (non-virtualised: renders every item — paginate with onEndReached as the apps already do).
 * Supports header/footer/empty, separators, horizontal, numColumns, onEndReached, refreshing/onRefresh.
 */
export const FlatList = forwardRef(function FlatList(props, ref) {
  const {
    data, renderItem, keyExtractor = defaultKey, ListHeaderComponent, ListFooterComponent, ListEmptyComponent, ItemSeparatorComponent,
    ListHeaderComponentStyle, ListFooterComponentStyle, numColumns = 1, columnWrapperClassName, columnWrapperStyle,
    onEndReached, onEndReachedThreshold, refreshing, onRefresh, refreshControl, horizontal, inverted, extraData, initialNumToRender,
    maxToRenderPerBatch, windowSize, getItemLayout, removeClippedSubviews, updateCellsBatchingPeriod, viewabilityConfig,
    onViewableItemsChanged, initialScrollIndex, maintainVisibleContentPosition, ...scrollProps
  } = props;
  const items = data || [];
  const sv = useRef(null);
  useImperativeHandle(ref, () => ({
    scrollToEnd: (o) => sv.current?.scrollToEnd(o),
    scrollToOffset: (o) => sv.current?.scrollToOffset(o),
    scrollToIndex: ({ index, animated }) => {
      const node = sv.current?.getInnerViewNode()?.querySelector(`[data-rn-index="${index}"]`);
      node?.scrollIntoView({ behavior: animated === false ? 'auto' : 'smooth', block: 'start', inline: 'start' });
    },
    scrollToItem: ({ item, animated }) => {
      const index = items.indexOf(item);
      sv.current?.getInnerViewNode()?.querySelector(`[data-rn-index="${index}"]`)?.scrollIntoView({ behavior: animated === false ? 'auto' : 'smooth' });
    },
    getScrollableNode: () => sv.current?.getScrollableNode(),
    flashScrollIndicators: () => {},
  }));

  const sep = (i) => (ItemSeparatorComponent && i > 0 ? renderNode(ItemSeparatorComponent, { highlighted: false, leadingItem: items[i - 1] }) : null);
  let body;
  if (!items.length) {
    body = renderNode(ListEmptyComponent);
  } else if (numColumns > 1 && !horizontal) {
    const rows = [];
    for (let i = 0; i < items.length; i += numColumns) rows.push(items.slice(i, i + numColumns));
    body = rows.map((row, r) => (
      <Fragment key={r}>
        {sep(r)}
        <div className={cn('rn-view flex-row', columnWrapperClassName)} style={flattenStyle(columnWrapperStyle)} data-rn-index={r * numColumns}>
          {row.map((item, k) => <Fragment key={keyExtractor(item, r * numColumns + k)}>{renderItem({ item, index: r * numColumns + k, separators: noopSeparators })}</Fragment>)}
        </div>
      </Fragment>
    ));
  } else {
    body = items.map((item, index) => (
      <Fragment key={keyExtractor(item, index)}>
        {sep(index)}
        <IndexMarker index={index}>{renderItem({ item, index, separators: noopSeparators })}</IndexMarker>
      </Fragment>
    ));
  }
  const header = ListHeaderComponent ? <div className="rn-view" style={flattenStyle(ListHeaderComponentStyle)}>{renderNode(ListHeaderComponent)}</div> : null;
  const footer = ListFooterComponent ? <div className="rn-view" style={flattenStyle(ListFooterComponentStyle)}>{renderNode(ListFooterComponent)}</div> : null;
  const rc = refreshControl || (onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined);
  return (
    <ScrollView ref={sv} horizontal={horizontal} refreshControl={rc} {...scrollProps}>
      {inverted ? <div className="rn-view flex-col-reverse">{body}</div> : null}
      {header}
      {inverted ? null : body}
      {footer}
      {onEndReached && items.length ? <EndSentinel onEndReached={onEndReached} threshold={onEndReachedThreshold} length={items.length} horizontal={horizontal} /> : null}
    </ScrollView>
  );
});

/** Lets scrollToIndex find items without wrapping them in an extra layout box. */
function IndexMarker({ index, children }) {
  const only = Children.count(children) === 1 && isValidElement(children);
  if (!only) return children;
  return (
    <>
      <span data-rn-index={index} aria-hidden style={{ display: 'block', width: 0, height: 0, flexShrink: 0 }} />
      {children}
    </>
  );
}

/** RN <SectionList>: sections [{ title?, data, key? }], renderSectionHeader/Footer, separators. */
export const SectionList = forwardRef(function SectionList(props, ref) {
  const { sections = [], renderItem, renderSectionHeader, renderSectionFooter, keyExtractor = defaultKey, SectionSeparatorComponent, ItemSeparatorComponent,
    ListHeaderComponent, ListFooterComponent, ListEmptyComponent, stickySectionHeadersEnabled, ...rest } = props;
  const flat = [];
  sections.forEach((section, si) => {
    flat.push({ kind: 'header', section, key: `h-${section.key ?? si}` });
    section.data.forEach((item, index) => flat.push({ kind: 'item', section, item, index, key: `i-${section.key ?? si}-${keyExtractor(item, index)}` }));
    flat.push({ kind: 'footer', section, key: `f-${section.key ?? si}` });
  });
  const total = sections.reduce((n, s) => n + s.data.length, 0);
  return (
    <FlatList
      ref={ref}
      {...rest}
      data={total ? flat : []}
      keyExtractor={(x) => x.key}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={ListFooterComponent}
      ListEmptyComponent={ListEmptyComponent}
      renderItem={({ item: x }) => {
        if (x.kind === 'header') return <>{SectionSeparatorComponent ? renderNode(SectionSeparatorComponent) : null}{renderSectionHeader?.({ section: x.section }) ?? null}</>;
        if (x.kind === 'footer') return renderSectionFooter?.({ section: x.section }) ?? null;
        return <>{x.index > 0 && ItemSeparatorComponent ? renderNode(ItemSeparatorComponent) : null}{renderItem({ item: x.item, index: x.index, section: x.section, separators: noopSeparators })}</>;
      }}
    />
  );
});

// ---------------------------------------------------------------------------------- TextInput

const KEYBOARD = {
  'number-pad': { inputMode: 'numeric', type: 'text', pattern: '[0-9]*' },
  numeric: { inputMode: 'numeric', type: 'text' },
  'decimal-pad': { inputMode: 'decimal', type: 'text' },
  'phone-pad': { inputMode: 'tel', type: 'tel' },
  'email-address': { inputMode: 'email', type: 'email' },
  url: { inputMode: 'url', type: 'url' },
  'web-search': { inputMode: 'search', type: 'search' },
  'visible-password': { type: 'text' },
};
const AUTOCOMPLETE = {
  'sms-otp': 'one-time-code', tel: 'tel-national', 'tel-national': 'tel-national', 'birthdate-full': 'bday', 'postal-code': 'postal-code',
  'name-given': 'given-name', 'name-family': 'family-name', 'street-address': 'street-address', 'password-new': 'new-password', off: 'off',
};
const RETURN_KEY = { done: 'done', go: 'go', next: 'next', search: 'search', send: 'send', previous: 'previous' };

/**
 * RN <TextInput> → <input>/<textarea>. onChangeText, keyboardType, secureTextEntry, maxLength, multiline
 * (auto-grows up to max-h), editable, onSubmitEditing, autoFocus, placeholderTextColor, caretHidden.
 */
export const TextInput = forwardRef(function TextInput(props, ref) {
  const {
    value, defaultValue, onChangeText, onChange, onSubmitEditing, onKeyPress, onFocus, onBlur, onEndEditing, keyboardType, secureTextEntry,
    multiline, numberOfLines, maxLength, editable = true, readOnly, autoFocus, placeholder, placeholderTextColor, autoCapitalize, autoComplete,
    autoCorrect, returnKeyType, enterKeyHint, blurOnSubmit, submitBehavior, selectTextOnFocus, caretHidden, cursorColor, selectionColor,
    className, style, textAlign, pointerEvents, textContentType, textAlignVertical, underlineColorAndroid, clearButtonMode, contextMenuHidden,
    showSoftInputOnFocus, inputMode, importantForAutofill, spellCheck, rows, ...rest
  } = props;
  const el = useRef(null);
  const controlled = 'value' in props;
  useImperativeHandle(ref, () => ({
    focus: () => el.current?.focus(),
    blur: () => el.current?.blur(),
    clear: () => { if (el.current) { el.current.value = ''; onChangeText?.(''); } },
    isFocused: () => document.activeElement === el.current,
    setNativeProps: () => {},
    get node() { return el.current; },
  }), [onChangeText]);

  // Multiline inputs grow with their content (max-h-* classes cap the height, then they scroll).
  useLayoutEffect(() => {
    const n = el.current;
    if (!multiline || !n) return;
    n.style.height = 'auto';
    n.style.height = `${n.scrollHeight}px`;
  }, [multiline, value]);

  const kb = KEYBOARD[keyboardType] || {};
  const st = flattenStyle(style) || {};
  if (placeholderTextColor) st['--rn-ph'] = placeholderTextColor;
  if (caretHidden) st.caretColor = 'transparent';
  else if (cursorColor || selectionColor) st.caretColor = cursorColor || selectionColor;
  if (textAlign) st.textAlign = textAlign;
  const common = {
    ref: el,
    className: cn('rn-input', pointerEventsClass(pointerEvents), className),
    style: st,
    placeholder,
    maxLength,
    autoFocus,
    readOnly: !editable || readOnly,
    autoCapitalize: autoCapitalize === 'none' ? 'off' : autoCapitalize,
    autoComplete: autoComplete ? AUTOCOMPLETE[autoComplete] || autoComplete : undefined,
    autoCorrect: autoCorrect === false ? 'off' : undefined,
    spellCheck: spellCheck ?? (autoCorrect === false ? false : undefined),
    enterKeyHint: enterKeyHint || RETURN_KEY[returnKeyType],
    inputMode: inputMode || kb.inputMode,
    ...(controlled ? { value: value ?? '' } : { defaultValue }),
    onChange: (e) => {
      const text = e.target.value;
      onChange?.({ ...e, nativeEvent: { text } });
      onChangeText?.(text);
    },
    onFocus: (e) => { if (selectTextOnFocus) e.target.select(); onFocus?.(e); },
    onBlur: (e) => { onBlur?.(e); onEndEditing?.({ nativeEvent: { text: e.target.value } }); },
    onKeyDown: (e) => {
      onKeyPress?.({ nativeEvent: { key: e.key === 'Backspace' ? 'Backspace' : e.key } });
      if (e.key === 'Enter' && !multiline) {
        onSubmitEditing?.({ nativeEvent: { text: e.currentTarget.value } });
        if (blurOnSubmit !== false && submitBehavior !== 'submit') e.currentTarget.blur();
      }
    },
    ...domProps(rest),
  };
  if (multiline) return <textarea rows={rows || numberOfLines || 1} {...common} />;
  return <input type={secureTextEntry ? 'password' : kb.type || 'text'} pattern={kb.pattern} {...common} />;
});

// ---------------------------------------------------------------------------------- Switch / Spinner

/** Android-style switch (track 36×14, thumb 20). */
export function Switch({ value, onValueChange, disabled, trackColor = {}, thumbColor, ios_backgroundColor, accessibilityLabel, className, style, testID }) {
  const on = !!value;
  const track = on ? trackColor.true ?? '#A8CDE9' : trackColor.false ?? '#C3CCD1';
  const thumb = thumbColor ?? (on ? '#1875B9' : '#FFFFFF');
  const toggle = () => !disabled && onValueChange?.(!on);
  return (
    <div
      role="switch"
      aria-checked={on}
      aria-label={accessibilityLabel}
      aria-disabled={disabled || undefined}
      data-testid={testID}
      tabIndex={disabled ? -1 : 0}
      onClick={(e) => { e.stopPropagation(); toggle(); }}
      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } }}
      className={cn('rn-view rn-pressable h-8 w-12 items-center justify-center', disabled && 'opacity-50', className)}
      style={flattenStyle(style)}
    >
      <div className="rn-view h-[14px] w-9 rounded-full transition-colors" style={{ backgroundColor: track }} />
      <div
        className="rn-view absolute top-1.5 h-5 w-5 rounded-full transition-transform"
        style={{ left: 4, backgroundColor: thumb, transform: on ? 'translateX(20px)' : 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}
      />
    </div>
  );
}

function Spinner({ size = 20, color = '#999', spin = true, progress = 1 }) {
  const r = (size - 3) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={spin ? 'rn-spinner' : undefined} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={size > 24 ? 3.5 : 2.5} strokeLinecap="round" strokeDasharray={`${c * 0.7 * Math.min(progress, 1)} ${c}`} />
    </svg>
  );
}

export function ActivityIndicator({ size = 'small', color = '#999', animating = true, hidesWhenStopped = true, className, style, accessibilityLabel = 'Loading', testID }) {
  if (!animating && hidesWhenStopped) return null;
  const px = typeof size === 'number' ? size : size === 'large' ? 36 : 20;
  return (
    <div role="progressbar" aria-label={accessibilityLabel} aria-busy data-testid={testID} className={cn('rn-view items-center justify-center', className)} style={flattenStyle(style)}>
      <Spinner size={px} color={color} spin={animating} />
    </div>
  );
}

// ---------------------------------------------------------------------------------- Modal

/**
 * RN <Modal>, portalled into the phone frame (so it never covers the desktop page outside the column).
 * animationType: none | fade | slide. onRequestClose fires on Escape (Android back on device).
 * Web-only `webLayer` (z-index) puts system pickers above app sheets.
 */
export function Modal({ visible = true, transparent, animationType = 'none', onRequestClose, onShow, onDismiss, children, testID, webLayer }) {
  const host = useContext(OverlayContext);
  const [mounted, setMounted] = useState(visible);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      setClosing(false);
      onShow?.();
      return undefined;
    }
    if (!mounted) return undefined;
    if (animationType === 'none') {
      setMounted(false);
      onDismiss?.();
      return undefined;
    }
    setClosing(true);
    const t = setTimeout(() => { setMounted(false); setClosing(false); onDismiss?.(); }, 190);
    return () => clearTimeout(t);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = useRef(onRequestClose);
  close.current = onRequestClose;
  useEffect(() => {
    if (!visible) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close.current?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible]);

  if (!mounted) return null;
  const anim = animationType === 'slide' ? (closing ? 'rn-anim-slide-out' : 'rn-anim-slide-in') : animationType === 'fade' ? (closing ? 'rn-anim-fade-out' : 'rn-anim-fade-in') : null;
  const node = (
    <div role="dialog" aria-modal="true" data-testid={testID} className={cn('rn-view rn-modal', !transparent && 'bg-surface', closing && 'pointer-events-none', anim)} style={webLayer ? { zIndex: webLayer } : undefined}>
      {children}
    </div>
  );
  if (host) return createPortal(node, host);
  return createPortal(<div style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>{node}</div>, document.body);
}

// ---------------------------------------------------------------------------------- Safe area & misc layout

const EDGE_PAD = { top: 'paddingTop', bottom: 'paddingBottom', left: 'paddingLeft', right: 'paddingRight' };
/** react-native-safe-area-context SafeAreaView: pads the chosen edges with env(safe-area-inset-*). */
export const SafeAreaView = forwardRef(function SafeAreaView({ edges = ['top', 'bottom', 'left', 'right'], mode, style, ...rest }, ref) {
  const list = Array.isArray(edges) ? edges : Object.keys(edges);
  const pad = Object.fromEntries(list.filter((e) => EDGE_PAD[e]).map((e) => [EDGE_PAD[e], `env(safe-area-inset-${e})`]));
  return <View ref={ref} style={[pad, style]} {...rest} />;
});
export const SafeAreaProvider = ({ children }) => children;
export const useSafeAreaInsets = () => ({ top: 0, bottom: 0, left: 0, right: 0 });
export const useSafeAreaFrame = () => { const { width, height } = useWindowDimensions(); return { x: 0, y: 0, width, height }; };

export const KeyboardAvoidingView = forwardRef(function KeyboardAvoidingView({ behavior, keyboardVerticalOffset, contentContainerStyle, enabled, ...rest }, ref) {
  return <View ref={ref} {...rest} />;
});

export function StatusBar() {
  return null;
}
StatusBar.setBarStyle = () => {};
StatusBar.setBackgroundColor = () => {};
StatusBar.setHidden = () => {};
StatusBar.setTranslucent = () => {};
StatusBar.currentHeight = 0;

// ---------------------------------------------------------------------------------- APIs

export const StyleSheet = {
  create: (s) => s,
  flatten: (s) => flattenStyle(s) || {},
  compose: (a, b) => (a && b ? [a, b] : a || b),
  hairlineWidth: 1,
  absoluteFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  absoluteFillObject: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
};

export const Platform = {
  OS: 'web',
  Version: 0,
  isTV: false,
  isTesting: false,
  constants: {},
  select: (o) => ('web' in o ? o.web : o.default),
};

const frameSize = () => ({
  width: typeof window === 'undefined' ? FRAME_MAX_WIDTH : Math.min(window.innerWidth, FRAME_MAX_WIDTH),
  height: typeof window === 'undefined' ? 800 : window.innerHeight,
  scale: typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1,
  fontScale: 1,
});
let dimsCache = frameSize();
const subscribeResize = (cb) => {
  const on = () => { dimsCache = frameSize(); cb(); };
  window.addEventListener('resize', on);
  return () => window.removeEventListener('resize', on);
};
/** Dimensions/useWindowDimensions report the PHONE FRAME (≤480px wide), not the desktop window. */
export const Dimensions = {
  get: () => frameSize(),
  addEventListener: (_type, cb) => {
    const unsub = subscribeResize(() => cb({ window: frameSize(), screen: frameSize() }));
    return { remove: unsub };
  },
};
export function useWindowDimensions() {
  return useSyncExternalStore(subscribeResize, () => dimsCache, () => dimsCache);
}
export const PixelRatio = {
  get: () => window.devicePixelRatio || 1,
  getFontScale: () => 1,
  getPixelSizeForLayoutSize: (n) => Math.round(n * (window.devicePixelRatio || 1)),
  roundToNearestPixel: (n) => Math.round(n * (window.devicePixelRatio || 1)) / (window.devicePixelRatio || 1),
};

export const Linking = {
  /** tel:/mailto:/sms: hand off to the OS; http(s) opens a new tab; in-app paths navigate. */
  async openURL(url) {
    if (/^(tel|mailto|sms|geo|upi|intent):/i.test(url)) window.location.href = url;
    else if (/^https?:/i.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
    else window.location.assign(url);
    return true;
  },
  canOpenURL: async () => true,
  getInitialURL: async () => window.location.href,
  openSettings: async () => {},
  addEventListener: () => ({ remove() {} }),
};

export const Clipboard = {
  async setString(text) {
    try {
      await navigator.clipboard.writeText(String(text));
    } catch {
      const ta = document.createElement('textarea');
      ta.value = String(text);
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;opacity:0;left:-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      ta.remove();
    }
  },
  async getString() {
    try { return await navigator.clipboard.readText(); } catch { return ''; }
  },
  async hasString() { return !!(await Clipboard.getString()); },
};

export const Share = {
  sharedAction: 'sharedAction',
  dismissedAction: 'dismissedAction',
  /** navigator.share when available; otherwise copies the text and shows a short "Copied" note. */
  async share({ message, url, title } = {}) {
    if (navigator.share) {
      try {
        await navigator.share({ title, text: message, url });
        return { action: 'sharedAction' };
      } catch (e) {
        if (e?.name === 'AbortError') return { action: 'dismissedAction' };
      }
    }
    await Clipboard.setString([message, url].filter(Boolean).join(' '));
    notify({ kind: 'snack', message: 'Copied to clipboard — paste it anywhere to share.' });
    return { action: 'sharedAction', activityType: 'clipboard' };
  },
};

export const AppState = {
  get currentState() { return document.visibilityState === 'visible' ? 'active' : 'background'; },
  addEventListener(type, cb) {
    if (type !== 'change') return { remove() {} };
    const on = () => cb(document.visibilityState === 'visible' ? 'active' : 'background');
    document.addEventListener('visibilitychange', on);
    return { remove: () => document.removeEventListener('visibilitychange', on) };
  },
};
export const Keyboard = {
  dismiss: () => document.activeElement?.blur?.(),
  addListener: () => ({ remove() {} }),
  isVisible: () => false,
};
export const BackHandler = { addEventListener: () => ({ remove() {} }), exitApp: () => {} };
export const Vibration = { vibrate: (p = 400) => navigator.vibrate?.(p), cancel: () => navigator.vibrate?.(0) };
export const I18nManager = { isRTL: false, allowRTL() {}, forceRTL() {} };
export const LayoutAnimation = { configureNext() {}, create: () => ({}), Presets: { easeInEaseOut: {}, linear: {}, spring: {} }, easeInEaseOut() {}, linear() {}, spring() {} };
export const PermissionsAndroid = {
  PERMISSIONS: {},
  RESULTS: { GRANTED: 'granted', DENIED: 'denied', NEVER_ASK_AGAIN: 'never_ask_again' },
  request: async () => 'granted',
  check: async () => true,
};
export const useColorScheme = () => 'light';
export const ToastAndroid = { SHORT: 0, LONG: 1, show: (message) => notify({ kind: 'snack', message }) };

// ---------------------------------------------------------------------------------- Alert host

let hostListeners = new Set();
let pending = [];
function notify(item) {
  pending = [...pending, { id: Math.random().toString(36).slice(2), ...item }];
  hostListeners.forEach((l) => l());
}

/** Alert.alert(title, message?, buttons?, { cancelable }) → in-app dialog styled like the app's Confirm. */
export const Alert = {
  alert(title, message, buttons, options = {}) {
    notify({ kind: 'alert', title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }], cancelable: options.cancelable, onDismiss: options.onDismiss });
  },
  prompt(title, message, callbackOrButtons) {
    const buttons = typeof callbackOrButtons === 'function' ? [{ text: 'Cancel', style: 'cancel' }, { text: 'OK', onPress: callbackOrButtons }] : callbackOrButtons;
    notify({ kind: 'alert', title, message, buttons, prompt: true });
  },
};

/** Mounted once by MobileFrame. Renders Alert dialogs and short snack messages. */
export function AlertHost() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    hostListeners.add(l);
    return () => hostListeners.delete(l);
  }, []);
  const [promptText, setPromptText] = useState('');
  const alert = pending.find((p) => p.kind === 'alert');
  const snack = pending.find((p) => p.kind === 'snack');
  const remove = useCallback((id) => {
    pending = pending.filter((p) => p.id !== id);
    hostListeners.forEach((l) => l());
  }, []);
  useEffect(() => {
    if (!snack) return undefined;
    const t = setTimeout(() => remove(snack.id), 2600);
    return () => clearTimeout(t);
  }, [snack, remove]);
  useEffect(() => {
    if (!alert) return undefined;
    setPromptText('');
    const onKey = (e) => {
      if (e.key === 'Escape' && alert.cancelable !== false) {
        remove(alert.id);
        alert.buttons.find((b) => b.style === 'cancel')?.onPress?.();
        alert.onDismiss?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [alert, remove]);

  return (
    <>
      {alert ? (
        <div className="rn-view rn-modal rn-anim-fade-in z-30 items-center justify-center bg-black/40 px-6" role="alertdialog" aria-modal="true" aria-labelledby={`al-${alert.id}`}>
          <div className="rn-view w-full max-w-[400px] rounded-lg bg-surface p-5">
            <div id={`al-${alert.id}`} className="rn-text font-sans text-headline font-bold text-ink-900">{alert.title}</div>
            {alert.message ? <div className="rn-text mt-2 font-sans text-bodySm font-medium text-ink-600">{alert.message}</div> : null}
            {alert.prompt ? (
              // eslint-disable-next-line jsx-a11y/no-autofocus
              <input autoFocus value={promptText} onChange={(e) => setPromptText(e.target.value)} className="rn-input mt-4 h-12 rounded-md border border-ink-200 px-3.5 text-body" />
            ) : null}
            <div className="rn-view mt-5 flex-row flex-wrap justify-end gap-1">
              {alert.buttons.map((b, i) => (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus={i === alert.buttons.length - 1}
                  onClick={() => { remove(alert.id); b.onPress?.(alert.prompt ? promptText : undefined); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); remove(alert.id); b.onPress?.(alert.prompt ? promptText : undefined); } }}
                  className={cn('rn-view rn-pressable h-10 items-center justify-center rounded-md px-4', b.style === 'destructive' ? 'active:bg-danger-50' : 'active:bg-ink-100')}
                >
                  <span className={cn('rn-text font-sans text-label font-semibold', b.style === 'destructive' ? 'text-danger-600' : b.style === 'cancel' ? 'text-ink-600' : 'text-brand-600')}>{b.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {snack ? (
        <div className="rn-view rn-anim-fade-in pointer-events-none absolute bottom-24 left-4 right-4 z-40 rounded-md bg-ink-900 px-4 py-3" aria-live="polite">
          <span className="rn-text font-sans text-bodySm font-medium text-white">{snack.message}</span>
        </div>
      ) : null}
    </>
  );
}

// Re-exported for nav/ui internals.
export { renderNode, useMergedRef, domProps };
