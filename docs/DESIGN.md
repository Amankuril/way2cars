# WAY2CARS design system — renter redesign (phases A and B)

The renter app (native `apps/user`, web replica `frontend/src/user`) uses a shared **motion + design kit**.
The kit has the same component names and props on both platforms:

| Platform | Import | Source |
|---|---|---|
| Native (renter + host APKs) | `@shared/native` | `apps/shared/native/{Motion,Surfaces,Carousel,StickyScroll,Scenes,TabBar,Feedback}.jsx` |
| Web (`/user`, `/vendor`) | `@/mobile/ui` | `frontend/src/mobile/ui/` (same file names) + `kit.css` |

Phase A redesigned these screens: Home, CitySelect, Search results, Vehicle, Checkout, Offers and the bottom tabs.
Phase B covers Trips, Pickup/Return, Account, KYC, Wallet, Support and Auth. Build those screens from the
pieces below. Don't add one-off styles.

## Principles

1. **Brand first.** Use blue `brand` (#1875B9) → cyan `accent` (#1BA4C4), charcoal `ink` and the Manrope typeface.
   Use gradients for heroes, CTAs and coupon stubs only. Body surfaces are white cards on the `canvas` background.
2. **Depth over borders.** Redesigned screens use elevated `Card`s (rounded-2xl with a soft shadow) instead of
   hairline `Panel`s. Keep `Panel` only for dense settings lists.
3. **Real data only.** Every number, label and claim must come from the API or from `/public/config`.
   Coupon values come from the coupon. Refund windows come from the cancellation tiers. The support phone comes
   from `config.support.phone`. Never fake strike-through prices, km packages, partial payments or deposit claims.
   Marketing copy must describe features the product actually has.
4. **Motion has a purpose.** Motion should give feedback (press), show orientation (entrances, sticky bars), show
   progress (CarLoader, skeletons) or show a change (AnimatedNumber). Never loop decoration forever where people
   read. The FAB pulses 4 times and then stops.
5. **Accessible.** Tap targets are at least 44px. Text contrast is AA. Every animation honours reduce motion.
   Icon-only buttons need an `accessibilityLabel`.

## Tokens (`apps/shared/theme/tokens.js`)

Existing values are unchanged. These were added:

- `radius['2xl'] = 22`, `radius['3xl'] = 28`. Use the Tailwind classes `rounded-2xl` (cards) and `rounded-3xl`
  (heroes, sheets, the loader).
- `shadows.{card, raised, float, brand, bar}`: CSS `box-shadow` strings. **Use `style={{ boxShadow: shadows.card }}`**
  on native and web alike. RN 0.81 on the new architecture supports `boxShadow`, and the web layer passes it through.
  Don't use `shadow-*` classes on native, because NativeWind maps them to shadow props that only work on iOS.
- `gradients.{hero, brand, deep, sunrise}`: stop arrays for `GradientFill` and `GradientHero`.
- `motion.{fast 160, base 260, slow 420, stagger 60, pressScale 0.97, spring, springSoft}`.

## Components

| Component | Purpose / key props |
|---|---|
| `PressableScale` | A Pressable with a spring "squish" when pressed. `className` and `style` style the pressable. `containerStyle` styles the animated wrapper (e.g. `{ flex: 1 }` in a row). `scaleTo`. |
| `FadeInView` | Entrance animation for cards and list items. `index` staggers siblings (capped at 8). `from`: `up` (default), `down` or `none`. `className` goes on an inner View. Use `style` for wrapper layout, e.g. `{ flex: 1 }` or a negative `marginTop` (see the note on Android touches below). |
| `AnimatedNumber` | Rolls to a new value like an odometer. Pass `value` as a formatted string (`money(x)`). Used for prices and totals. |
| `Dots` | Page indicator. The active dot stretches into a pill. `tone`: `brand` \| `inverse`. |
| `Skeleton` | Shimmer placeholder with the same props as before. Presets: `SkeletonVehicleCard({ compact })`, `SkeletonRow`, `SkeletonCard({ height })`. |
| `Card` | White, rounded-2xl, soft shadow. `flat` gives a bordered card with no shadow. |
| `GradientFill` | Fills its parent with a linear gradient. `stops` and `angle` (`diagonal` \| `vertical` \| `horizontal`). The parent needs `overflow-hidden` and a radius. |
| `GradientHero` | Navy → brand → cyan hero with soft shapes and a dashed "road". `rounded` (bottom corners), `angle`. |
| `SectionHeader` | `eyebrow`, `title`, `subtitle`, plus an optional `actionLabel` and `onAction` ("See all ›"). |
| `SpecChip` | Small non-interactive chip with an icon, e.g. "5 seats". `tone`: `neutral` \| `brand` \| `solid` \| `inverse` \| `success`. (`Chip` stays the interactive filter chip.) |
| `IconTile` | Rounded-square tinted icon holder. `tone` and `size`. |
| `DashedDivider` | A dashed rule. Android can't draw single-side dashed borders, so use this in price breakdowns and tickets. |
| `TicketCard` | Coupon ticket with a gradient stub, scalloped edge, perforation with notches and "Copy code" (shows "Copied" for 1.8s). `value`, `code`, `title`, `description`, `meta`, `onCopy(code)`, `width`. `notchColor` must match the page background. |
| `Accordion` | FAQ list in a card, one item open at a time. `items=[{ id, title, content }]`. |
| `FAB` | Floating round action button (absolute, bottom-right). It springs in and pulses 4 times. Home uses it for "Call support" and only when `config.support.phone` is set. |
| `Carousel` | Snapping horizontal list with dots and optional `autoPlay` (ms). Auto-play pauses while dragging and is off with reduce motion. `itemWidth`, `gap`, `inset`, `renderItem({ item, index, active })`. |
| `StickyScrollView` | Scroll view whose `sticky` overlay fades and slides in after `threshold` px. Takes `refreshControl` and `contentContainerClassName`. On native it uses Reanimated `useAnimatedScrollHandler` (UI thread). On web it uses a rAF-throttled listener that writes styles directly to the DOM. |
| `Parallax` | Use inside a `StickyScrollView`. Moves at `speed` × scroll and stretches on pull-down. `height` is required. |
| `CarLoader` | Animated scene: a car cruising past a skyline, trees and road dashes. `title`, `subtitle`, `children` (e.g. a `TripRoute`). Use it for search and other long loads. |
| `CarArt` | The static car illustration, for empty states (`still`). |
| `TripRoute` | Pickup → duration → return, with a dashed arrow. `start`/`end` are `{ overline, title, subtitle }`. Pass `label`. `animated` adds a travelling dot. |
| `AnimatedTabBar` | Bottom tabs with a sliding pill and an icon pop. On native, wire it with `tabBar={(p) => <NavTabBar {...p} />}`. On web, add `tabs.Main.tabBar = AnimatedTabBar` in the router config (opt-in; the host app keeps the classic bar). |
| `Sheet`, toasts | Same API. The sheet now springs up, and toasts show a tone icon. `Button` is `rounded-lg` and shrinks to 0.98 when pressed. |
| `FillSvg`, `useBoxSize` | Absolute-fill SVG layer drawn at its **measured** pixel size (children may be a function of `{ w, h }`). Use it for every full-bleed SVG. `GradientFill`, `GradientHero`, `DashedDivider`, `Skeleton` and `CarLoader` are built on it. |
| `HeroHeader` | Gradient header for stack screens: back button, `title`/`subtitle`/`eyebrow`, `right`, `children` (balance, avatar row…). `compact` puts the title in the top bar. Use it as the first child of `<Screen tone="hero">`. |
| `Screen` | New `tone="hero"` (navy status-bar area with light icons, for screens that start with a `HeroHeader`), `scrollRef`, `testID`. The `footer` is a sticky action bar with an upward shadow (`shadows.bar`). |
| `StepProgress` | Numbered steps with check marks and animated connectors. `steps`, `current`, `tone`: `default` \| `inverse` (on a hero). |
| `Timeline` | Vertical status timeline. `items=[{ key, title, subtitle, state }]`, `state`: `done` \| `current` \| `todo` \| `stopped`. The current dot pings three times and then rests. |
| `ActionTile` | Square quick-action tile (icon tile + label + optional caption) with press feedback. Put several in a row; each takes an equal share. |
| `EmptyState`, `EmptyArt` | Illustrated: a soft halo, a dashed orbit and a tilted gradient icon tile pop in, then the copy rises. `art` swaps in a custom illustration (e.g. `<CarArt still />`). `tone="danger"` is used by `ErrorState`. |
| `ListItem`, `Segmented`, `Confirm`, `Field`, `OtpInput`, `PhotoTile` | Restyled with the same props. `ListItem` has 40px rounded-xl tiles and `iconTone` (`brand`, `accent`, `success`, `warning`, `danger`, `neutral`). `Segmented` has a sliding white pill. `Confirm` is a rounded-3xl dialog that pops in, with a tone icon and two equal buttons. `Field` is 52px with a focus ring. OTP digits pop in. `PhotoTile` is a dashed brand capture tile. |

Screen-level helpers in the renter app: `components/offers.js` (`offerValue`, `offerTerms` built from the coupon's
own limits) and the redesigned `VehicleCard`, `Gallery` and `PriceBreakdown`.

## Motion rules

- **UI thread only (native).** Use Reanimated shared values, `withSpring`/`withTiming`/`withRepeat`, layout
  animations (`entering`, `exiting`, `layout`) and `useAnimatedScrollHandler`. Don't drive animations from JS
  intervals. Timers are only for discrete steps, such as the carousel auto-advance.
- **NativeWind and Reanimated:** never put `className` on a Reanimated `Animated.*` component. NativeWind
  doesn't style it. Put layout classes on a plain inner `View` and give the animated wrapper `style` only. Every kit
  component follows this pattern.
- **Reduce motion:** native uses `useReducedMotion()` from `@shared/native`, which re-exports Reanimated's. Loops
  freeze and entrances become instant. Web uses `prefers-reduced-motion` in `kit.css` and turns every `w2c-*`
  animation off.
- **Durations:** use 160ms for press and exit, 260ms for state changes and 420–560ms for entrances. Springs use
  damping 18–22. Stagger list items by 60ms and cap the stagger at 8 items.
- **Android touches:** a child pulled outside its parent's bounds with a negative margin can't be tapped on
  Android. Put negative margins on the outermost wrapper. For example, `FadeInView style={{ marginTop: -72 }}`, not
  `className="-mt-[72px]"`.
- **Web parity:** every native animation has a CSS twin in `frontend/src/mobile/ui/kit.css`, with the same names,
  durations and curves.

## Android rendering rules (learned on a device)

- **Never size an SVG with percentages.** react-native-svg on Android resolves `width="100%"` once and doesn't repaint
  after a relayout. On the device, the Home hero gradient stopped about 7% short of the right edge and left a stale
  rectangle behind the city pill, and the coupon stub band ended 60px short of the card edge. Use `FillSvg` (or
  numeric sizes from `onLayout`). Every kit layer is drawn at its measured size and re-mounted when that size changes.
- **Text colour overrides.** NativeWind doesn't reliably let a later colour class beat an earlier one, so
  `<T variant="overline" className="text-accent-200">` rendered ink-900 (dark on dark). `T` now drops its tone class
  whenever `className` sets a text colour. For text on gradients that must stay legible, also pass `style={{ color }}`.
- Translucent pills on gradients: use `PressableScale` with an rgba `style` background and a numeric `borderRadius`.
  Don't rely on `bg-white/15` combined with `active:` classes.
- Shadow and clipping: put `boxShadow` and the radius on an outer view, and `overflow-hidden` and the radius on an
  inner view. `TicketCard` and `EmptyArt` follow this pattern.

## Porting notes (web)

- `react-native-svg` → `@/mobile/svg` (same component names, rendered as inline SVG).
- `StatusBar.pushStackEntry`/`popStackEntry` are no-op stubs on web. Home uses them on native to get light
  status-bar icons over the navy hero.
- In the DOM, absolutely positioned layers paint above static siblings. Kit views and text are `position: relative`,
  and `kit.css` makes the frame's SVG icons relative, so the document order is also the paint order, as on native.
- To port a renter file, change its imports per `frontend/README.md`. The scratch script used for phase A only
  rewrote imports. The web-only extras (Gallery desktop arrows, Search's "ask for a city" redirect) are kept by hand.

## Phase B checklist

- Replace `Panel` + `Section` with `SectionHeader` + `Card` and give lists `FadeInView` entrances.
- Use `SkeletonRow` or `SkeletonCard` for loading states, not a full-screen spinner. Keep `Loading` for tiny inline
  waits.
- Trip cards: put `TripRoute` (pickup → return) inside a `Card`, and keep the status `Pill`.
- Pickup and Return: use `CarLoader`-style illustrations for empty or waiting states, and `AnimatedNumber` for
  fuel/km deltas.
- Account: a `GradientHero` header with the avatar, then `Card` lists with `IconTile` rows.
- Keep every testID, route param and query key unchanged.
