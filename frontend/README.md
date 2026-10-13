# WAY2CARS Web (`@way2cars/frontend`)

One Vite + React 19 + Tailwind 3.4 app (JavaScript/JSX), one build, four sub-apps:

| Path | What | Source |
|---|---|---|
| `/` | Landing page with "Rent a car" and "Become a host" entry points | `src/landing/` |
| `/admin/*` | Back-office dashboard (moved here from `apps/admin`, behaviour unchanged) | `src/admin/` |
| `/user/*` | Web replica of the renter Android app (`apps/user`) | `src/user/` |
| `/vendor/*` | Web replica of the host Android app (`apps/vendor`) | `src/vendor/` |

`/user` and `/vendor` are mobile-first. On a phone they fill the screen. On a wider screen they render
inside a centred phone-width column (480px max, full height) with a hairline border on the canvas page,
so they look like the APK.

## Develop

```bash
npm install                          # from the repo root (npm workspaces, npm only)
npm run dev -w @way2cars/frontend    # http://localhost:5173  (port is fixed: backend CORS allows only :5173)
npm run build -w @way2cars/frontend  # → frontend/dist
npm run preview -w @way2cars/frontend
```

Vite proxies `/api` and `/uploads` to `API_PROXY_TARGET` (default `http://localhost:5000`). That keeps
the httpOnly refresh cookies same-origin.

Dev sign-in for `/user` and `/vendor`: the dummy numbers `9999900001` … `9999900004` accept the code
`123456`. Admins are created with `npm run admin:create -w @way2cars/backend`, and two-factor enrolment
is enforced.

## Structure

```
src/
  main.jsx              picks the sub-app from the first path segment and lazy-loads it (own chunk)
  index.css             Tailwind + admin component classes + the .rn-* React Native layout classes
  landing/              "/" page
  admin/                admin dashboard (router basename /admin) — see "Admin" below
  mobile/               ← the foundation shared by /user and /vendor
    rn.jsx              React Native primitives on the DOM (View, Text, Pressable, FlatList, TextInput, Modal, Alert…)
    tw.js               cn(): class joiner with NativeWind "last class wins" semantics (tailwind-merge)
    nav.jsx             react-navigation API on react-router (useNavigation, useRoute, useFocusEffect, tabs)
    frame.jsx           MobileFrame: the phone column + overlay root for modals/toasts/alerts/pickers
    ui/                 web port of apps/shared/native (T, Button, Field, Screen, Header, Sheet, Confirm, …)
    app/                web port of apps/shared/native/app + native-module stand-ins (see table)
    screens/            web port of apps/shared/native/screens (Phone, Otp, Faq, CmsPage, Notifications, …)
    dev/Kitchen.jsx     dev-only showcase of every primitive: /user/__kitchen, /vendor/__kitchen
    OfflineBanner.jsx
  user/                 App.jsx · api.js · env.js · auth/ · navigation/{routes,Guard,RootNavigator,links}
  vendor/               same layout as user/
```

## How sub-app routing works

1. `src/main.jsx` checks `location.pathname`: `/admin…` → `admin/main.jsx`, `/user…` → `user/App.jsx`,
   `/vendor…` → `vendor/App.jsx`, anything else → the landing page. Each is a dynamic import, so each is
   its own chunk. The shared mobile code is in a `mobile` chunk, and vendor libraries are in
   `react`, `query`, `charts`, `forms` and `twmerge`.
2. Each sub-app owns a `createBrowserRouter` with its basename. Going from one sub-app to another is
   a full page load (a plain `<a href="/vendor">`).
3. User and vendor build their routers with `createMobileRouter()` from `src/mobile/nav.jsx`:

```js
createMobileRouter({
  basename: '/user',
  routes: ROUTES,            // { ScreenName: '/path/:param' } — names identical to the native navigator
  screens,                   // { ScreenName: Component | { component, access, animation } }
  tabs: { Main: { screens: ['Explore', 'Trips', 'Help', 'Account'], icons: { Explore: Compass, … } } },
  initial: 'Main',           // where goBack() goes with no history, and unknown URLs
  Guard,                     // ({ name, access, children }) → auth gating (mirrors RootNavigator's conditionals)
});
```

- **Tabs.** A tab group (here `Main`) becomes a layout route. It renders the active tab's screen with
  a bottom tab bar pinned to the bottom of the frame: 62px, 22px icons, brand-600 when active and
  ink-500 when inactive, 11px semibold labels, plus the safe-area inset. `navigate('Main', { screen: 'Trips' })` works.
- **Stack screens** fill the frame. A push slides in from the right; `animation: 'slide_from_bottom'`
  slides up instead. Back is the browser history.
- **Guards** replace the native "different navigator per auth state" pattern. A signed-out visitor to
  any `auth` screen is sent to `Phone`, and the URL is remembered. After OTP login, `RedirectAfterLogin`
  returns them there. The user app also forces `ProfileSetup` until `account.profileCompleted`. The
  vendor app forces `Onboarding` while `status` is `onboarding` or `rejected`.
- **Session.** The web clients use `clientType: 'web'`. The refresh token lives in an httpOnly cookie
  (`/api/v1/auth/<realm>`), and `api.restore()` restores the session on page load, so a refresh keeps
  you signed in. A localStorage hint (`w2c.session.<realm>`) skips the refresh call for visitors who
  never signed in.

### Route-table conventions

- Use the native screen names exactly (`Trip`, `Vehicle`, `NewTicket`…). Put every screen in
  `navigation/routes.js`, then register its component in `navigation/RootNavigator.jsx`. Each one is
  currently a `placeholder('Title')`.
- Path params are the ids the screen reads from `route.params` (`/trips/:id`, `/checkout/:vehicleId`).
  Optional segments use `:id?` (`/fleet/vehicle-form/:id?`). A static segment beats a param
  (`/help/tickets/new` vs `/help/tickets/:id`).
- **Every screen must work from a cold URL.** Refetch from params; don't depend on in-memory state
  passed from the previous screen.
- Params that aren't in the path go to the query string: strings as-is, numbers and booleans as text,
  small objects and arrays as JSON (≤400 chars). They are also kept with exact types in history state.
  After a refresh, types survive. From a pasted link, numbers arrive as strings, so coerce them
  (`Number(route.params.dailyPaise)`). Big objects (e.g. `{ address }`) only live in history state,
  so make those screens degrade gracefully, for instance by fetching by id.
- Function params are dropped, and a warning is logged in dev.

## Porting a native screen (phase 2 recipe)

1. Copy `apps/<app>/src/screens/x/FooScreen.jsx` to `src/<app>/screens/x/FooScreen.jsx` and keep the
   export name and the `({ navigation, route })` signature.
2. Rewrite the imports using the table below. Usually that's all you need to change.
3. In `navigation/RootNavigator.jsx`, swap `Foo: placeholder('…')` for `Foo: FooScreen`. Add the
   path in `routes.js` if it's missing.
4. Port the screen's local components and hooks (`components/`, `hooks/`, `services/`) the same way.
5. Open the screen at 390×844 and at 1440×900, next to the APK, and compare.

### Import mapping

| Native import | Web import |
|---|---|
| `'react-native'` (`View, Text, Pressable, ScrollView, FlatList, SectionList, Image, TextInput, Switch, ActivityIndicator, Modal, KeyboardAvoidingView, RefreshControl, StyleSheet, Platform, Alert, Linking, Share, Dimensions, useWindowDimensions, AppState, Keyboard, StatusBar, TouchableOpacity, …`) | `'@/mobile/rn'` (same names) |
| `'react-native-safe-area-context'` (`SafeAreaView, useSafeAreaInsets, SafeAreaProvider`) | `'@/mobile/rn'` |
| `'@shared/native'` | `'@/mobile/ui'` |
| `'@shared/native/screens'` | `'@/mobile/screens'` |
| `'@shared/native/app/location'` | `'@/mobile/app/location'` (`currentPosition()`, same shape, `null` when denied) |
| `'@shared/native/app/session'` | `'@/mobile/app/session'` (`createWebApi({ realm })`) — already wired in `src/<app>/api.js` |
| `'@shared/native/app/push'` | `'@/mobile/app/push'` (no-ops, see limitations) |
| `'@shared/native/app/media'` | `'@/mobile/app/media'` (`pickImage`, `uploadAsset`) |
| `'@react-navigation/native'` (`useNavigation, useRoute, useFocusEffect, useIsFocused`) | `'@/mobile/nav'` |
| `'lucide-react-native'` | `'lucide-react'` (same icon names and props) |
| `'@react-native-community/datetimepicker'` (`DateTimePickerAndroid`) | `import { DateTimePickerAndroid } from '@/mobile/app/datetime'` (same `open({ value, mode, minimumDate, maximumDate, onChange })`, `event.type` is `'set'` or `'dismissed'`) |
| `'react-native-razorpay'` (default `RazorpayCheckout`) | `import RazorpayCheckout from '@/mobile/app/razorpay'` (same `open(options)` promise; cancel rejects with `code: 2`) |
| `'@react-native-async-storage/async-storage'` | `import AsyncStorage from '@/mobile/app/storage'` |
| `'@react-native-community/netinfo'` | `import NetInfo from '@/mobile/app/netinfo'` |
| `'@react-native-clipboard/clipboard'` (`Clipboard.setString`) | `import { Clipboard } from '@/mobile/rn'` |
| `'react-native-maps'` (`MapView, Circle, Marker, PROVIDER_GOOGLE`) | `'@/mobile/app/maps'` (Google Maps embed; overlays not drawn) |
| `'react-native-blob-util'` (invoice download) | `'@/mobile/app/files'` (`openPdf(api, path, name)`, `downloadFile(api, path, name)`) |
| `'../../api'`, `'../../auth/AuthContext'`, `'../../env'` | same relative paths inside `src/<app>/` (already ported) |
| `'@shared/lib/*'`, `'@shared/theme/tokens'` | unchanged (`@shared` aliases `apps/shared`; `tokens.js` is served as ESM by a Vite plugin) |
| `require('../assets/x.png')` | `import x from '@shared/assets/x.png'`, then `<Image source={x} />` |

## Layout gotchas (RN vs DOM)

`src/index.css` gives every primitive Yoga's defaults, so NativeWind classes behave as on the
device. Things to know:

- **View** is `flex flex-col items-stretch shrink-0 min-w-0 min-h-0 relative`, with `align-content: flex-start`.
  Like RN, nothing shrinks unless you say so (`flex-1`, `shrink`).
- **Text** at the top level is a block `<div>` with `white-space: pre-wrap`, so `'\n'` in strings
  breaks lines as in RN. Text inside Text is an inline `<span>`. The default size is 14px; always use `T`.
  Unlike RN, top-level Text may shrink (`flex-shrink: 1`), so a long label in a row wraps instead of
  overflowing the screen. `numberOfLines={1}` gives an ellipsis, and `>1` gives a line clamp.
- **Class conflicts.** NativeWind lets the *last class in the string* win, but CSS lets the last rule
  in the stylesheet win. `cn()` (`@/mobile/ui` or `@/mobile/tw`) uses tailwind-merge, which knows our
  custom font sizes (`text-body`, `text-label`…), to restore NativeWind behaviour. All primitives run
  `className` through it. If you build class strings yourself, use `cn()`, not template literals with
  conflicting classes.
- **Pressable** is a focusable `div[role=button]`, not `<button>`, so nesting is valid. Inner presses
  don't bubble to outer Pressables. `active:` classes give the pressed state, and `className`, `style`
  and `children` may be functions of `{ pressed }`. Disabled Pressables are inert.
- **ScrollView** grows and shrinks inside its parent (`flex-grow: 1; flex-shrink: 1`) like RN's. It
  needs a bounded parent: a `flex-1` chain up to the screen, which `Screen` and the frame provide.
  `horizontal` lays children out in a row (`width: max-content`). Scrollbars are hidden on touch and
  thin on hover for mice. `pagingEnabled` and `snapToInterval` use CSS scroll-snap.
- **FlatList and SectionList are not virtualised.** They render every item, so keep paginating with
  `onEndReached`, which uses an IntersectionObserver sentinel and fires once per data length. Supported:
  header, footer and empty components, `ItemSeparatorComponent`, `horizontal`, `numColumns` +
  `columnWrapperClassName`, `scrollEnabled={false}` (inside another scroller), `refreshing`/`onRefresh`,
  `scrollToEnd` and `scrollToOffset` and `scrollToIndex` via ref, and `onContentSizeChange`.
- **Pull to refresh** works on touch devices only. Its spinner only shows for refreshes the user started.
- **Icons** are never shrunk inside the frame (`svg { flex-shrink: 0 }`).
- **Style objects and arrays** work. They are flattened, numbers become px, `paddingHorizontal` and
  `marginVertical` expand, `transform` arrays and `fontVariant` convert, and `lineHeight` numbers
  become px. Shadow props approximate a `box-shadow`.
- **Image** accepts `{ uri }`, an imported asset, or `privateSource(url)` (`{ uri, headers }`). With
  headers, it fetches a blob with the bearer token, as native does. An `Image` without a size has no
  intrinsic RN size; give it `style` width/height as on native.
- **Modal**, `Sheet`, `Confirm`, toasts, `Alert.alert` and the date picker are portalled into the phone
  frame, never over the whole desktop page. Escape closes a modal (it fires `onRequestClose`). The
  browser back button does **not** close a sheet. It navigates, like Android back on a screen without
  a handler.
- **Dimensions and `useWindowDimensions`** report the **frame** width (≤480), not the window.
- **TextInput**: `keyboardType` maps to `inputMode`/`type`, `secureTextEntry` to `type=password`, and
  `autoComplete="sms-otp"` to `one-time-code`. Multiline inputs auto-grow up to their `max-h-*`.
  `onSubmitEditing` fires on Enter. Inputs below 16px make iOS Safari zoom, but the viewport sets
  `maximum-scale=1`, which prevents that.
- **File pickers need a user gesture.** Call `useUploader().take()` or `pickImage()` directly in the
  press handler. Don't `await` anything before it, or the browser blocks the dialog.
- **Screens remount** when you navigate (tabs too). `useFocusEffect` runs on every visit, and React
  Query's cache keeps that fast. Keep per-screen UI state in the URL (`navigation.setParams`) if it
  must survive.
- `navigation.reset({ index, routes })` replaces the current entry with `routes[0]` and pushes the rest,
  so back works as on native. `setOptions` and `addListener` are no-ops.

## Native features with no web equivalent (how they're stubbed)

| Native | Web behaviour |
|---|---|
| FCM push (`registerForPush`) | No-op (`'unsupported'`). The in-app Notifications inbox works. |
| Camera / gallery picker | `<input type=file accept=image/* capture>`. Phones offer the camera; desktop shows a file dialog. Photos are downscaled to 2400px, JPEG 0.8. |
| Keychain refresh token | httpOnly cookie, set by the backend for `X-W2C-Client: web`. |
| Geolocation permission | `navigator.geolocation`. **HTTPS (or localhost) only.** On the plain-HTTP IP deployment `currentPosition()` returns `null`, so "near me" falls back. |
| `react-native-maps` | Google Maps `output=embed` iframe centred on the region. No markers or circles. |
| Razorpay native SDK | `checkout.js`, loaded on demand. Same payload goes to `/bookings/payments/verify`. |
| Invoice download (blob-util) | Authenticated fetch, then a blob opened in a new tab (`openPdf`) or downloaded. |
| `Linking.openURL('tel:…')` | Hands off to the OS (phones dial; desktop asks for an app). http(s) opens a new tab. |
| `Share.share` | `navigator.share`, or else the text is copied to the clipboard with a "Copied" snack. |
| `Alert.alert` | In-app dialog styled like `Confirm` (never `window.confirm`). |
| Status bar, `BackHandler`, `Vibration`, `PermissionsAndroid`, `LayoutAnimation` | Harmless stubs. |
| `Animated` | **Not provided.** The app screens don't use it. Use CSS transitions or Tailwind `animate-*`. |

## Verify a port

- `npm run dev -w @way2cars/frontend`, then open `/user/__kitchen` or `/vendor/__kitchen` (dev only).
  It shows every primitive and design-system component, and is written like a native screen.
- Sign in with a dummy number. `9999900001` has a completed profile; `9999900003` hits `ProfileSetup`.
  Then reload the page: you must stay signed in.
- Check the browser console: no React "unknown prop" warnings and no failed requests. The primitives
  translate RN-only props (`accessibilityRole`, `testID` → `data-testid`, `hitSlop`, …) so nothing
  leaks to the DOM.
- `testID` becomes `data-testid`, so headless checks (puppeteer-core with `/usr/bin/google-chrome`)
  can target the same IDs as native tests.
- `npm run build -w @way2cars/frontend` must pass.
- Memory is tight on the dev machine: run one Vite server and at most one headless Chrome at a time.

## Admin

React 19 + Vite + Tailwind back office, served at `/admin/` (router basename `/admin`). It moved
from `apps/admin`; history is preserved with `git mv`.

- `src/admin/lib/`: API client (shared `apps/shared/lib/api-client.js`), hooks, labels, helpers.
- `src/admin/auth/`: session context (access token in memory, refresh via cookie) and route guards.
- `src/admin/components/`: layout, tables, filters, forms, dialogs, secure file viewers, charts.
- `src/admin/pages/<area>/`: lazy-loaded screens. Navigation lives in `src/admin/lib/nav.js`.
- Imports use `@/admin/...` (`@` = `frontend/src`).

Money is integer paise in the API and rupees in the UI. Dates are shown in IST. Sidebar items and
actions are hidden when the signed-in admin lacks the permission, and the API enforces it as well.

## Production

`deploy/deploy.sh` builds this workspace and rsyncs `dist/` to `/var/www/way2cars/web`. Nginx
(`deploy/nginx/way2cars-ip.conf`) serves it at `/`, with an SPA fallback for `/admin`, `/user` and
`/vendor`, and proxies `/api` and `/uploads` to the backend on :5000. The API is same-origin, so no
build-time env is needed.
