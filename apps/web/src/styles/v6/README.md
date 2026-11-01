# v6 design system ("desk")

Every signed-in page renders inside `components/v6/frame.tsx` (via `AppShell`). The frame
supplies the sidebar, the top bar (page title, subtitle, actions), the phone tab bar and the
dark/light theme. A page's job is only its content.

Reference implementation: `app/dashboard/page.tsx` + `components/v6/desk.tsx` + `styles/v6/desk.css`.
Approved mock: `design/dashboard-v8/a-desk-v2/` (dark + light screenshots in that folder).

## Files
- `tokens.css`: colours, radii, fonts. Dark by default; `html[data-theme=light] .v6` swaps them.
- `components.css`: shared `x-` classes (cards, buttons, segmented controls, tabs, tags, side chips,
  stat strips, tables, forms, empty/skeleton/banner states, popovers, dialogs).
- `frame.css`: the app frame. Don't restyle it from a page.
- `<page>.css`: one file per page or page group for layout and page-only pieces, prefixed with a
  short page prefix (dashboard uses `dk-`). Import it from the page's component file.

## Migrating a page off the legacy styles
1. Pass `legacy={false}` to `<AppShell>`. Without it the page is wrapped in the old `.v3.v5` scope.
2. Give the page title in `pageTitle`, a muted context line in `pageSubtitle`, and page-level
   controls (range, filters, primary action) in `actions`. Don't repeat the title inside the page.
3. Replace every `v3-*`, `d-*` and other legacy class, and every legacy Tailwind colour token
   (`text-fg`, `bg-surface`, `border-border`, `bg-[var(--acc)]`…) with `x-` classes and tokens.
   Grep the page and its components for `v3-`, `className="d-`, `text-fg`, `bg-surface`, `--acc`,
   `#` hex colours and inline `style={{ color`. None should remain.
4. Colours only through tokens: `var(--g)` profit/brand, `var(--r)` loss/risk, `var(--tx|mut|dim)`
   text, `var(--s1)` card, `var(--s2)` inset, `var(--line)` hairlines. No amber, violet or blue.
   The one exception is a chart with several series (compare, option legs): its lines and legend
   keys use `var(--series-1…6)`; never for state, text or buttons.
   Charts: grid `var(--grid)`, axis text `var(--axis)`, tooltips `var(--tip)` with light text.
5. Typography: Satoshi 400/500 only (never 600/700/900, never `font-bold`/`font-black`), JetBrains
   Mono (`.m`) for numbers only (prices, P&L, counts, times); labels, dates and headings stay sans.
   Sentence case; no uppercase letter-spaced labels; no serif or italic accents.
6. One primary action per card (`x-btn--hi`); everything else `x-btn`. Long/short is `SideChip`
   from `components/v6/desk.tsx`. Symbols use `x-mk` + `tickerMark()` from `lib/desk.ts`.
7. Unknown is "—", never 0. Empty data gets `x-empty` with one sentence and at most one button.
   Loading gets `x-skel` blocks shaped like the content.
8. Both themes must work: never hard-code a colour that only reads on dark.

## Shared React pieces (`components/v6/ui/`)
- `InfoTip`: the ⓘ next to a metric; copy for each metric lives in `lib/metric-help.ts`.
- `Tooltip` / `IconButton`: an icon-only button gets `IconButton label="…"`; its name is the
  tooltip. Never use the native `title` attribute for this.
- `useMenu(open, close)`: put the ref on the wrapper around a `[aria-haspopup]` trigger and its
  `[role=menu]` panel; items need `role="menuitem"` (or `menuitemradio`). Gives arrows, Home/End,
  type-ahead, Tab/outside-click close and Esc back to the trigger.
- `Sparkline`: the only sparkline. `zero` for P&L-like series, `label` when it carries meaning.
- `DateRangePicker` (+ `lib/date-presets.ts`), `Freshness` ("Updated 12s ago").
- Formatting: `lib/format.ts` (`fmtUsd`, `fmtPct`, `pnlClass`…): real minus, "—" for unknown.
- Every primitive has a server-render smoke test in `components/v6/ui/primitives.test.ts`; the
  dev-only gallery at `/dev/ui` shows them all in both themes.

## Layout
- Content width is the frame's; use grids with `minmax(0, 1fr)` columns and `min-width: 0` on
  children so nothing pushes the page wider than the viewport.
- Breakpoints: ≤1280 (KPI rails collapse), ≤1180 (sidebar becomes an icon rail), ≤1100 (two-column
  rows stack), ≤760 (phone: frame shows a tab bar; cards pad 18/16; tables become card lists).
- Phone: no horizontal page scroll at 360px. Wide tables either drop low-value columns or switch
  to stacked cards (see `.dk-tbl` / `.dk-cards`). Segmented controls scroll inside themselves.
- Leave 96px at the bottom on phones (the frame already pads `.f-main`) for the tab bar.

## QA checklist per page
- Brave at 1440, 1280, 1024, 768, 390, 360, in dark and light (`?theme=light` forces light).
- `document.documentElement.scrollWidth === clientWidth` at every width.
- No console errors. No clipped or overlapping text. Hover/focus states visible. Esc closes popovers.
