/**
 * react-navigation → react-router adapter.
 *
 * Each sub-app declares a route table { ScreenName: '/path/:param' } mirroring the native navigator's
 * screen names, plus bottom-tab groups. Screens keep their native signature `({ navigation, route })`
 * and the hooks `useNavigation`, `useRoute`, `useFocusEffect`, `useIsFocused` behave like
 * @react-navigation/native. Every screen has a real, refresh-safe URL:
 *   - path params come from the pattern (`/trips/:id`);
 *   - other params are mirrored to the query string (strings as-is, numbers/booleans stringified,
 *     small objects/arrays as JSON) AND kept with exact types in history state;
 *   - so after a browser refresh params keep their types; from a pasted link they are strings/JSON.
 */
import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { createBrowserRouter, matchPath, Navigate, Outlet, useLocation, useNavigate, useNavigationType, useParams, useRouteError } from 'react-router';
import { View, Text, Pressable } from './rn';
import { cn } from './tw';
import { colors } from '@shared/theme/tokens';

const NavCtx = createContext(null);
const RouteNameCtx = createContext(null);

// ------------------------------------------------------------------------------------ params

function encodeQueryValue(v) {
  if (v == null || typeof v === 'function') return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  try {
    const json = JSON.stringify(v);
    return json.length <= 400 ? json : null; // big objects live in history state only
  } catch {
    return null;
  }
}
function decodeQueryValue(s) {
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
    try { return JSON.parse(s); } catch { return s; }
  }
  return s;
}
/** History state must be structured-cloneable: drop functions (warn — RN discourages them too). */
function cloneable(params) {
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'function') {
      if (import.meta.env.DEV) console.warn(`[nav] param "${k}" is a function and cannot survive a URL/refresh; dropped.`);
      continue;
    }
    out[k] = v;
  }
  try {
    structuredClone(out);
    return out;
  } catch {
    return JSON.parse(JSON.stringify(out));
  }
}

/** Resolves (name, params) → { name, pathname, search, state }. Handles navigate('Main', { screen: 'Trips', params }). */
export function resolveTarget(ctx, name, params) {
  let target = name;
  let p = params || {};
  for (let i = 0; i < 5 && ctx.tabs[target]; i += 1) {
    const tabs = ctx.tabs[target];
    if (p.screen) {
      target = p.screen;
      p = p.params || {};
    } else {
      target = tabs.initial || tabs.screens[0];
    }
  }
  const pattern = ctx.routes[target];
  if (pattern == null) throw new Error(`[nav] Unknown screen "${target}". Add it to the route table.`);
  const used = new Set();
  let pathname = pattern.replace(/:(\w+)(\?)?/g, (_m, key, optional) => {
    used.add(key);
    const v = p[key];
    if (v == null || v === '') {
      if (optional) return '';
      throw new Error(`[nav] Missing param "${key}" for ${target} (${pattern}).`);
    }
    return encodeURIComponent(String(v));
  });
  pathname = pathname.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1') || '/';
  const q = new URLSearchParams();
  const state = {};
  for (const [k, v] of Object.entries(p)) {
    if (used.has(k) || v === undefined) continue;
    state[k] = v;
    const enc = encodeQueryValue(v);
    if (enc != null) q.set(k, enc);
  }
  const search = q.toString();
  return { name: target, pathname, search: search ? `?${search}` : '', state: cloneable(state) };
}

/** Finds the screen name for a pathname (used outside screens, e.g. links). */
export function screenForPath(ctx, pathname) {
  for (const [name, pattern] of Object.entries(ctx.routes)) {
    if (ctx.tabs[name]) continue;
    if (matchPath({ path: pattern, end: true }, pathname)) return name;
  }
  return null;
}

// ------------------------------------------------------------------------------------ hooks

/** react-navigation's navigation object (stable identity, safe in effect deps). */
export function useNavigation() {
  const ctx = useContext(NavCtx);
  const nav = useNavigate();
  const location = useLocation();
  const routeName = useContext(RouteNameCtx);
  const live = useRef({ location, routeName });
  live.current = { location, routeName };
  return useMemo(() => {
    const go = (name, params, opts = {}) => {
      if (name && typeof name === 'object') return go(name.name, name.params, opts);
      const t = resolveTarget(ctx, name, params);
      return nav({ pathname: t.pathname, search: t.search }, { replace: !!opts.replace, state: { params: t.state } });
    };
    const canGoBack = () => (window.history.state?.idx ?? 0) > 0;
    const navigation = {
      navigate: (name, params) => go(name, params),
      push: (name, params) => go(name, params),
      replace: (name, params) => go(name, params, { replace: true }),
      goBack: () => (canGoBack() ? nav(-1) : go(ctx.initial, undefined, { replace: true })),
      pop: (n = 1) => (canGoBack() ? nav(-Math.min(n, window.history.state?.idx ?? 1)) : go(ctx.initial, undefined, { replace: true })),
      popToTop: () => go(ctx.initial, undefined, { replace: true }),
      /** reset({ index, routes }): replaces the current entry with routes[0], then pushes the rest up to index (back works). */
      reset: async ({ index, routes = [] } = {}) => {
        const list = routes.slice(0, (index ?? routes.length - 1) + 1);
        if (!list.length) return;
        await go(list[0].name, list[0].params, { replace: true });
        for (const r of list.slice(1)) await go(r.name, r.params);
      },
      setParams: (patch) => {
        const loc = live.current.location;
        const current = { ...(loc.state?.params || {}), ...patch };
        const q = new URLSearchParams(loc.search);
        for (const [k, v] of Object.entries(patch)) {
          const enc = encodeQueryValue(v);
          if (enc == null) q.delete(k);
          else q.set(k, enc);
        }
        const search = q.toString();
        nav({ pathname: loc.pathname, search: search ? `?${search}` : '' }, { replace: true, state: { params: cloneable(current) } });
      },
      canGoBack,
      setOptions: () => {},
      addListener: () => () => {},
      removeListener: () => {},
      dispatch: () => {},
      isFocused: () => true,
      getParent: () => navigation,
      getId: () => undefined,
      getState: () => ({ index: 0, routes: [{ name: live.current.routeName, key: live.current.location.key }] }),
    };
    return navigation;
  }, [ctx, nav]);
}

/** react-navigation's route: { key, name, params } (path params + query + history state). */
export function useRoute() {
  const name = useContext(RouteNameCtx);
  const pathParams = useParams();
  const loc = useLocation();
  return useMemo(() => {
    const params = {};
    for (const [k, v] of new URLSearchParams(loc.search)) params[k] = decodeQueryValue(v);
    Object.assign(params, loc.state?.params || {});
    for (const [k, v] of Object.entries(pathParams)) if (k !== '*' && v != null) params[k] = v;
    return { key: loc.key, name, path: loc.pathname, params };
  }, [name, pathParams, loc]);
}

/**
 * Runs `effect` when the screen gains focus (mount, or coming back to it — screens remount on the web)
 * and its cleanup on blur. Wrap the callback in useCallback, as with react-navigation.
 */
export function useFocusEffect(effect) {
  useEffect(() => effect(), [effect]);
}
export const useIsFocused = () => true;

// ------------------------------------------------------------------------------------ redirects

const nextKey = (basename) => `w2c.next:${basename}`;

/** Redirects to a screen. `rememberNext` stores the current URL to return to after sign-in. */
export function Redirect({ to, params, rememberNext }) {
  const ctx = useContext(NavCtx);
  const loc = useLocation();
  if (rememberNext) {
    try {
      sessionStorage.setItem(nextKey(ctx.basename), `${loc.pathname}${loc.search}`); // idempotent, safe in render
    } catch { /* storage unavailable */ }
  }
  const t = resolveTarget(ctx, to, params);
  return <Navigate to={{ pathname: t.pathname, search: t.search }} state={{ params: t.state }} replace />;
}

/** After sign-in: back to the URL remembered by <Redirect rememberNext>, else to `fallback` (default: initial). */
export function RedirectAfterLogin({ fallback }) {
  const ctx = useContext(NavCtx);
  // Read during render (pure); clear in an effect so StrictMode's double render can't lose it.
  let next = null;
  try {
    next = sessionStorage.getItem(nextKey(ctx.basename));
  } catch { /* storage unavailable */ }
  useEffect(() => {
    try { sessionStorage.removeItem(nextKey(ctx.basename)); } catch { /* ignore */ }
  }, [ctx.basename]);
  if (next && next.startsWith('/') && !next.startsWith('//')) return <Navigate to={next} replace />;
  return <Redirect to={fallback || ctx.initial} />;
}

// ------------------------------------------------------------------------------------ layout

/** Renders a screen component with its native props ({ navigation, route }). */
function ScreenHost({ component: Component }) {
  const navigation = useNavigation();
  const route = useRoute();
  return <Component navigation={navigation} route={route} />;
}

function ScreenRoute({ name, def, inTabs }) {
  const ctx = useContext(NavCtx);
  const loc = useLocation();
  const navType = useNavigationType();
  const Guard = ctx.Guard;
  const anim = !inTabs && navType === 'PUSH' ? (def.animation === 'slide_from_bottom' ? 'rn-anim-push-up' : def.animation === 'none' ? null : 'rn-anim-push') : null;
  return (
    <RouteNameCtx.Provider value={name}>
      <Guard name={name} access={def.access}>
        <View key={`${loc.pathname}${loc.search}`} className={cn('flex-1 bg-canvas', anim)}>
          <ScreenHost component={def.component} />
        </View>
      </Guard>
    </RouteNameCtx.Provider>
  );
}

/** Bottom tab bar — same metrics as the native MainTabs (62px, 22px icons, 11px semibold labels). */
export function TabBar({ name }) {
  const ctx = useContext(NavCtx);
  const loc = useLocation();
  const nav = useNavigate();
  const cfg = ctx.tabs[name];
  const active = cfg.screens.find((s) => matchPath({ path: ctx.routes[s], end: true }, loc.pathname)) || cfg.screens[0];
  return (
    <View
      accessibilityRole="tablist"
      className="flex-row border-t border-line bg-surface"
      style={{ minHeight: 62, paddingTop: 6, paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' }}
    >
      {cfg.screens.map((s) => {
        const focused = s === active;
        const Icon = cfg.icons?.[s];
        const color = focused ? colors.brand[600] : colors.ink[500];
        const label = cfg.labels?.[s] || s;
        const badge = cfg.badges?.[s];
        return (
          <Pressable
            key={s}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            testID={`tab-${s}`}
            onPress={() => {
              if (focused) return;
              const t = resolveTarget(ctx, s);
              nav({ pathname: t.pathname, search: t.search });
            }}
            className="flex-1 items-center justify-center"
          >
            <View>
              {Icon ? <Icon size={22} color={color} strokeWidth={focused ? 2.4 : 2} /> : null}
              {badge ? <BadgeDot value={badge} /> : null}
            </View>
            <Text className="mt-0.5 font-sans" style={{ fontSize: 11, lineHeight: '14px', fontWeight: 600, color }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function BadgeDot({ value }) {
  const n = typeof value === 'function' ? value() : value;
  if (!n) return null;
  return <View className="absolute -right-1.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-danger-500" />;
}

/** Layout route for a bottom-tab group: active tab screen above, tab bar pinned at the bottom of the frame. */
export function MobileTabs({ name }) {
  const ctx = useContext(NavCtx);
  const Guard = ctx.Guard;
  return (
    <RouteNameCtx.Provider value={name}>
      <Guard name={name} access={ctx.tabs[name].access}>
        <View className="flex-1 bg-canvas">
          <View className="flex-1">
            <Outlet />
          </View>
          <TabBar name={name} />
        </View>
      </Guard>
    </RouteNameCtx.Provider>
  );
}

/** Outlet for the stack: each screen fills the frame; pushes slide in from the right like native-stack. */
export function MobileStack() {
  return (
    <View className="flex-1 overflow-hidden bg-canvas">
      <Outlet />
    </View>
  );
}

function NotFoundRedirect() {
  const ctx = useContext(NavCtx);
  return <Redirect to={ctx.initial} />;
}

function RouteError() {
  const err = useRouteError();
  if (import.meta.env.DEV) console.error(err);
  return (
    <View className="flex-1 items-center justify-center bg-canvas px-8">
      <Text className="text-center font-sans text-headline font-bold text-ink-900">Something went wrong</Text>
      <Text className="mt-1.5 text-center font-sans text-bodySm font-medium text-ink-600">{err?.message || 'Please reload the page.'}</Text>
      <Pressable onPress={() => window.location.reload()} className="mt-5 h-12 items-center justify-center rounded-md border border-ink-200 bg-surface px-5 active:bg-ink-50">
        <Text className="font-sans text-label font-semibold text-ink-900">Reload</Text>
      </Pressable>
    </View>
  );
}

const Passthrough = ({ children }) => children;

/**
 * Builds the sub-app router.
 *
 * @param {object} o
 * @param {string} o.basename   '/user' | '/vendor'
 * @param {Record<string,string>} o.routes  { ScreenName: '/path/:param' } — include tab screens; tab GROUP names map to null.
 * @param {Record<string, Function | { component, access?, animation? }>} o.screens
 * @param {Record<string, { screens: string[], icons?: object, labels?: object, initial?: string, access?: string }>} o.tabs
 * @param {string} o.initial    screen (or tab group) used for goBack() with no history and unknown URLs
 * @param {Function} [o.Guard]  ({ name, access, children }) → element; auth gating (see src/user/navigation).
 */
export function createMobileRouter({ basename, routes, screens, tabs = {}, initial, Guard = Passthrough }) {
  const ctx = { basename, routes, tabs, initial, Guard };
  const norm = (s) => (typeof s === 'function' || s?.$$typeof ? { component: s } : s);
  const inTabs = new Set(Object.values(tabs).flatMap((t) => t.screens));
  const route = (name, tabbed) => {
    const def = norm(screens[name]);
    if (!def?.component) throw new Error(`[nav] No component for screen "${name}".`);
    if (routes[name] == null) throw new Error(`[nav] No path for screen "${name}".`);
    return { path: routes[name], element: <ScreenRoute name={name} def={def} inTabs={tabbed} /> };
  };
  const children = [
    ...Object.keys(tabs).map((group) => ({ element: <MobileTabs name={group} />, children: tabs[group].screens.map((s) => route(s, true)) })),
    ...Object.keys(screens).filter((n) => !inTabs.has(n)).map((n) => route(n, false)),
    { path: '*', element: <NotFoundRedirect /> },
  ];
  return createBrowserRouter(
    [{ element: <NavCtx.Provider value={ctx}><MobileStack /></NavCtx.Provider>, errorElement: <NavCtx.Provider value={ctx}><RouteError /></NavCtx.Provider>, children }],
    { basename },
  );
}

export { NavCtx as NavigationContext, RouteNameCtx as RouteNameContext };
