# TRADElogs UI audit: every route, desktop and mobile

Date: 29 Oct 2026. Source: mock dev server at http://localhost:3010 (NEXT_PUBLIC_USE_MOCKS=true), branch feat/landing-v3.
Target system: `reports/ui-direction-report.md`. In short: canvas `#0B0B0C`, surface-1 `#151517` at radius 24, surface-2 `#1C1C1F` at radius 16, almost no borders, green `#08C465` for profit and brand, red `#FE3A31` for loss and risk, no third accent, sans at 400/500, JetBrains Mono for numbers only, one primary action per card, calm density.

**Screenshots** are in `/private/tmp/claude-501/-Users-jochannnn-Desktop-tradinjournal/1fae7206-4fde-472c-8b82-3e30cdd42537/scratchpad/audit/`:
- Full-page shots: `<route>-d.png` (1440×900) and `<route>-m.png` (390×844).
- Overlays: `x-*.png`.
- Readable slices: `crops/`.
- Per-route style metrics (fonts, borders, accents, button classes): `metrics.json`.
- Capture scripts: `scratchpad/shot/audit.mjs`, `audit2.mjs`, `audit3.mjs`, `land.mjs`.

**Capture notes:**
- In mock mode, `/login` and `/signup` redirect to `/dashboard`. They were captured with `?stay` (`login-stay-*`, `signup-stay-*`).
- `/access/elefin` and `/access/inactive` were captured by stubbing `/data/access/status`.
- `/news` and `/economic-calendar` are permanent redirects to `/markets` (`app/news/page.tsx`, `app/economic-calendar/page.tsx`). There is nothing to design there.
- `/admin` calls `/api/admin/*` even in mock mode. Those calls return 500, so only its error state could be seen.
- No route has horizontal page scroll at 390px. `scrollWidth` equals the viewport everywhere. All clipping below is inside containers.

Severity: **H** = visibly broken, misleading, or a major source of the "cluttered" feel. **M** = clear inconsistency with the target system. **L** = polish.

---

## 1. Cross-cutting issues

### 1a. CSS architecture
- **H** Every app page loads three stacked stylesheets, imported in `components/app-shell.tsx:18-20`:
  - `styles/app-v3.css` (2,372 lines): a light theme with violet `--acc:#6E4BFF` and `--paper:#F4F3F8`.
  - `styles/app-v5-auto.css` (1,090 lines): auto-generated recolour, "do not hand-edit".
  - `styles/app-v5.css` (825 lines): hand overrides.
  - On top of those sit `app/globals.css` (517 lines, the older "Obsidian" Tailwind tokens with radius 10) and `components/landing-v5/landing.css` (588 lines).
  - Every visual rule exists 2–3 times, and the last one wins by source order or specificity.
- **H** The auto file produces wrong intermediate values that only survive because `app-v5.css` patches them later. Examples:
  - `.v5 .st-priv { background: var(--ink); color:#000 }`, i.e. a white card with black text (`app-v5-auto.css:820`), re-patched at `app-v5.css:567`.
  - `.v5 ::-webkit-scrollbar-thumb { background:#D5D3DC }`, a light-grey scrollbar (`app-v5-auto.css:24`), re-patched at `app-v5.css:68`.
  - Any new v3 rule leaks light or violet colours until someone notices.
- **H** Token drift. `app-v5.css:10-58` defines `--paper:#030303`, `--card:#0F0F0F`, `--line:#1E1E1E`, and the card surface as `linear-gradient(180deg,#111,#0B0B0B)` plus a ring. The target is canvas `#0B0B0C`, surface-1 `#151517` and surface-2 `#1C1C1F`, with no gradient and no ring.
- **H** Several greens and reds are in use instead of one each:
  - Text uses `--long/--acc-2:#2EE58A` and `--color-profit:#2EE58A`.
  - Fills use `#08C465`.
  - `#7DF2B6` ("acc-pale") is used for italic words and pills.
  - `#19C37D` is a fallback in `components/v3/trade-candles.tsx:118`.
  - Loss is `#FF6A62` for text and `#FE3A31` for fills.
  - Pick one green and one red, optionally with a single tint.
- **H** Amber is a live third accent:
  - The tokens exist: `--amber:#F2B53A`, `--color-warning:#F2B53A`, `.v3-pill.a`.
  - It is used for: the 45% win-rate chip, the SignalX "Open" chip, the whole `/access/inactive` card, Macro "Key tension:" and MEDIUM chips, calendar impact dots, watch stars and the "M" filter, landing "Timing" bar, the notification ring `border-warning` (`components/notification-bell.tsx:32`), and the news ticker tiles (XAU, EUR, NDX…).
- **M** Leftover violet:
  - `#6E4BFF` hard-coded as a fallback in `components/v3/analytics-parts.tsx:131,134` and `components/v3/trade-candles.tsx:115` (`--tc-zone` `#EEEAFF`, `--tc-grid` `#EDECF0`).
  - `components/v3/partner-parts.tsx:25`.
  - `tone: 'purple'|'blue'` in `components/macro/regime-narrative.tsx:45-50`, masked in CSS by `.v5 .mr-pills .t-purple,.t-blue {color:#7DF2B6}` (`app-v5.css:574`).
  - `.v3-pill.v` ("violet") is still used, e.g. `components/settings/settings-aside.tsx:21`.
  - `StatusCard tone="v"` (`app/maintenance/page.tsx:20`).
- **M** Light pop-overs on a dark UI:
  - `.v5 :is(.a-tip,.pt-toast){background:#fff;color:#000}` (`app-v5.css:576`).
  - White value pills on charts: dashboard `$36,174.75`, analytics tooltips, candle "Exit" pill `.tc-pill.x`.
  - Pick one dark tooltip style.
- **M** Scale of the styling surface:
  - 58 `!important`.
  - About 230 distinct hex colours across the five CSS files.
  - 21 distinct border-radius values in `app-v3.css` alone: 999, 12, 14, 16, 10, 8, 22, 20, 6, 4, 18, 7, 24, 3, 9, 30, 26…
  - 18 + 14 + 27 + 18 + 54 gradient declarations and 97 + 71 + 44 + 15 + 50 box-shadows.
  - The metrics on one route: `/dashboard` has 134 bordered elements, 31 shadows and 16 gradients. `/trades` has 620 bordered elements.
- **M** Three styling systems in components:
  - Hand-written v3 class prefixes: `d-`, `t-`, `a-`, `c-`, `r-`, `n-`, `mk-`, `ch-`, `sx-`, `cs-`, `br-`, `pf-`, `st-`, `sc-`, `au-`, `lg-`.
  - Tailwind utilities with the old `globals.css` tokens: `components/admin/*`, most of `components/macro/*` (about 300 utility usages), `components/notification-bell.tsx`.
  - Inline `style={{…}}`: about 70 occurrences, e.g. `components/app-shell.tsx:147-171`.
- **L** Dead or unused components that still carry old styling. No imports were found for:
  - `browser-frame`, `dashboard-calendar`, `drawdown-chart`, `empty-state`, `equity-chart`, `floating-card`, `insights-strip`, `reveal`, `reveal-group`, `rolling-chart`, `scatter-chart`, `screenshot-frame`, `terminal-cta-button`, `watermark-number`, `landing/product-mocks`.
  - In particular, `components/empty-state.tsx` exists but no page uses it, so every page invents its own empty state.
- **L** The `AppShell` `theme?: 'v5'|'v3'` prop (`app-shell.tsx:37`) keeps the light theme alive as a code path.

### 1b. Typography
- **H** The serif-italic accent word is in almost every app page H1. It uses Instrument Serif italic, often in green:
  - dashboard "really", trades "positions.", analytics "edge.", notebook "entries.", brokers "brokers.", macro "growth.", SignalX "X";
  - plus serif-italic body text in the dashboard "ONE THING TO FIX" box.
  - Rule: drop it in the app.
  - Causes: `.v3-h1 em` (`app-v3.css:209`), `.v5 .mr h2 em, .br-hero h1 em` (`app-v5.css:573`), and per-page `em`.
- **M** A second, different "italic accent" (faux Satoshi italic in green or red) is used on auth, status and legal pages: "back.", "account.", "password?", "inbox.", "policy.", "missing a token.". On `/calendar` the italic is "2026".
  - So there are two accent-italic systems and neither fits the target.
- **M** Font loading and weights do not match:
  - `app/layout.tsx:2,14` loads Inter through next/font, but every computed font is Satoshi from the fontshare CDN (`layout.tsx:35`). `globals.css:22` still says "Inter is the single brand typeface". The Inter download is wasted.
  - Satoshi loads only 400/500/700, yet 600 and 900 are used: `font-black` 42 times, mostly admin and auth headings. The browser synthesises them.
  - JetBrains Mono loads 400/500, but 700 is used on dashboard, analytics and macro. Also synthesised.
  - The target is 400/500 only. The 700 count per page: journal 81, trades 53, macro 8, coach 9.
- **M** Mono is misused and inconsistent:
  - It is used for dates and volume on `/trades` (302 mono-400 nodes), uppercase letter-spaced table headers (`SYMBOL`, `DIR`, `NET P&L`), "engine v4.2 · 33 indicators · as of …" on macro, "ONE THING TO FIX", `// CONFLUENCE ENGINE`, and SignalX timeframes.
  - Meanwhile money is sans on the trade detail, journal, calendar, brokers totals, macro indicator rows and analytics KPIs.
  - Rule: numbers are mono everywhere, labels are never mono.
- **M** Uppercase letter-spaced labels are scattered: table heads, admin tabs `OVERVIEW/USERS…`, the admin `REFRESH` button, macro `BULLISH/BEARISH/NEUTRAL` chips, Fed tiles `10Y REAL YIELD`, `NOT FINANCIAL ADVICE · GROUNDED…`, landing eyebrows. The target is sentence case.

### 1c. Shell (`components/app-shell.tsx`; `app-v5.css:72-104`; `app-v3.css:70-200`)
- **H** Naming confusion in the nav:
  - `/journal` is labelled "Chart replay" and `/notebook` is labelled "Journal" (`app-shell.tsx:48-49`). The crumb on `/notebook` reads "Journal / Journal" and on `/journal` "Journal / Chart replay".
  - SignalX is also called "TradeAI signals" (macro side-nav) and "the Signals tab" (macro paper-blotter empty state).
- **H** Two separate ⌘K searches. The topbar `.v3-search` "Jump to a page… ⌘K" and the macro `macro-search-trigger` "Search indicators, assets… ⌘K" are both on `/macro`.
- **M** Topbar actions differ on every page, so the bar never looks the same:
  - dashboard: range seg, "Synced just now", Sync, Add broker, bell;
  - analytics: range seg;
  - charts: layout toggles and Alert;
  - trades and notebook: Export CSV;
  - trade detail: prev/next arrows;
  - other pages: nothing.
  - Define one slot: an optional range control plus at most one action.
- **M** The dashboard topbar "Add broker" (`header-add-broker`, `v3-btn--ink d-add`) renders disabled as a grey pill with a "+" circle and looks broken. The account menu's "+ Add broker" (`app-shell.tsx:198`) is enabled at the same time (limit 2 of 2), which is inconsistent.
- **M** The sidebar account switcher `.v3-acct-btn` is the loudest object on screen: a green gradient fill, a green inset ring and a solid green "XG" tile (`app-v5.css:75-79`). It competes with page content on every page.
  - The dropdown `.v3-acct-menu` covers nav items instead of pushing them down.
  - Initials are inconsistent: "IM" in the menu, "IC" on `/brokers`.
- **M** The active nav item shows three indicators at once: a left green bar outside the rail, a filled pill and a green icon. One is enough.
- **L** The sync status card `.v3-sync` is a bordered box inside the sidebar. It could be a single line with a dot.
- **L** The mobile drawer cuts off the user/Sign-out footer below the fold (`x-mobile-drawer.png`). Admin/Brokers/Settings sit under the sync card.
- **L** Page content padding differs: `/admin` starts at x=268 and ends at x=1420; every other page uses x=280–1408.

### 1d. Page-header patterns (six different ones; unify to title + muted subline + one action)
1. dashboard: greeting H1 with an italic word and a meta line;
2. trades and notebook: "big count + italic noun" (`78 positions.`, `0 entries.`);
3. analytics and calendar: eyebrow plus H1 (`Analytics · all time` / `Dissect your edge.`, `Daily P&L` / `October 2026`);
4. brokers and settings: hero card with green glow, dot grid or fake chart banner;
5. charts, markets, journal, coach and admin: no header;
6. macro: ticker strip, search and mono meta row, then a header inside the content.

### 1e. Charts (at least seven implementations, no shared theme)
- **H** Chart implementations, all styled differently:
  - Hand-rolled SVG in `components/v3/dashboard-parts.tsx`: equity, hour bars, day bars.
  - `components/v3/analytics-parts.tsx`: area, rolling, scatter, session heatmap.
  - `components/year-heatmap.tsx`.
  - `components/v3/trade-candles.tsx` and `components/replay/trade-chart.tsx`: illustrative candles.
  - klinecharts on `/charts` (`components/charts/kline-chart.tsx`).
  - TradingView embed on `/macro/assets/[symbol]`.
  - Custom sparklines and yield curve in `components/macro/*`.
  - Leaflet map in admin.
- **H** Most SVG charts have no y-axis and no gridlines. X labels are detached from the bars by 100–200px:
  - dashboard "P&L by day" (`DayBars`);
  - analytics "P&L by day" and "Hour of day";
  - dashboard "P&L by hour" (`HourBars`).
- **H** The drawdown series on the dashboard Net P&L card ("Drawdown" tab) is drawn in green with a green fill. Risk should be red. See `x-dash-drawdown.png` (`HeroPnl` in `dashboard-parts.tsx`).
- **M** Tooltip and marker styles differ:
  - white pill (dashboard equity);
  - white `.a-tip` (analytics);
  - green and white pills on candles (`.tc-pill`);
  - klinecharts default crosshair labels;
  - TradingView's own UI.
- **M** Candle colours differ per page: brand green/red on klinecharts; `--long-fill`/`--short-fill` on `trade-candles`; TradingView default teal/red.
  - TradingView also logs "Passed color string does not match any of the known color representations" three times per load on `/macro/assets/XAU`. The theme colours passed to the widget are invalid (probably CSS variables).

### 1f. Repeated content (a big part of "a lot everywhere")
- **H** The same statistics appear on several pages with different visuals:
  - KPI strip (win rate, profit factor, expectancy, drawdown): dashboard, analytics, trades summary, calendar.
  - P&L by day: dashboard and analytics.
  - P&L by hour: dashboard and analytics.
  - Instruments: dashboard and analytics.
  - Avg win/loss: dashboard, analytics strike-rate card, trade detail.
  - Economic calendar: markets rail and a macro panel.
  - Headlines: markets and a macro panel.
  - The 8-asset macro bias: shown three times on `/macro` alone.
- **H** The dashboard has three AI text surfaces: "Your review" (plus a "One thing to fix" box), "What your trades say" (6 insights) and "Coach review" (`AiReportCard`). Merge them into one.

### 1g. Symbol, side and status markers
- **M** Symbol markers come in four kinds:
  - initials circles `.d-sym i` "NA/GB/XA" (dashboard, trades, analytics, day modal);
  - "S"/"L" red/green letter tiles (journal list);
  - amber or green ticker tiles "XAU/EUR/REG" (news cards);
  - broker initial tiles (brokers, account menu).
  - The initials are meaningless ("NA" for NAS100, "US" for both USDJPY and US30).
- **M** Long/short is shown in five ways:
  - mono uppercase `↘ SHORT` chip (trades);
  - `SHORT · 1.48` chip (journal);
  - `Long`/`Short` sentence chips (SignalX);
  - `LONG`/`SHORT` plain coloured text (macro confluence);
  - `BUY`/`SELL` (raw deals).

### 1h. Empty, loading and error states
- **H** No shared empty state. Each page builds its own:
  - analytics: a dashed 450px-tall box with one sentence ("Psychology edge", "Setup edge");
  - notebook: an icon tile, bullets and a secondary button;
  - macro paper blotter: a 96px icon tile with no button;
  - dashboard: text only;
  - brokers: a dashed "Broker limit reached" card with a "+" tile that looks clickable;
  - admin: red text in a bordered bar.
  - Rule (report §4): one object, one sentence, one button.
- **M** Zero values are shown as stats instead of an empty state:
  - notebook KPI strip "0 / 0 / — / — / empty bar";
  - empty dashboard "+$0.00" with a green ▲ 0.00% badge (`x-dash-empty.png`);
  - empty KPI tiles showing "—".

### 1i. Emoji and unicode used as icons
- **M** Emoji and unicode glyphs instead of the line-icon set (`components/v3/icons.tsx`):
  - 🔔 📰 📅 and flags in notifications (`components/notification-bell.tsx:34`);
  - 🔒 via CSS `content` (`.st-priv b::before`, `app-v3.css:1886`);
  - ⚡ "Analyze" (`components/trader/trader-master.tsx:135`);
  - ✦ "Brief" (`components/news/news-feed.tsx:353,369`);
  - macro group glyphs ↗ ◱ ⚒ ∿ ◈ ≋ ⚡ ⇅ $ (`lib/macro-meta.ts:37-46`; ⚡ renders as a yellow emoji);
  - Georgia-italic "ƒx" (`app-v3.css:1079`);
  - flag emoji in the calendar rail.

### 1j. Mobile
- **M** Pages are very long:
  - dashboard 4,716px, analytics 4,796, macro 7,274, trades 4,412, landing 13,223.
  - Odd counts of KPI tiles (5) leave an orphan full-width tile (dashboard, analytics, notebook).
- **M** Horizontally scrolling chip rows have no edge fade or affordance and cut chips mid-word:
  - markets category and symbol chips ("Regula…", "EURUSD (");
  - journal filters ("Reviewed 0" cut).
- **L** Range seg `1W…All` is repeated in the page body on mobile (dashboard, analytics) and in the topbar on desktop. This is acceptable, but it takes a full row.

---

## 2. Primitive inventory: current → should become

| Primitive | What exists today (class / file) | Should become |
|---|---|---|
| **Card** | `.v3-card` (r20, 1px border, `--surface` gradient + `--surface-ring`; `app-v3.css:211`, `app-v5.css`); `.tcard` (globals, admin); `SortableCard` with drag handle (`components/sortable-card.tsx`, analytics); glow hero cards `.mr`, `.br-hero`, `.st-priv` (radial green glow + dot grid, `app-v5.css:567-573`); status card `.sc` (r30, `components/v3/status-card.tsx`); macro Tailwind cards `rounded-[18px]`/`rounded-2xl`; profile banner card `pf-*` | `Card` = surface-1 `#151517`, r24, no border, no gradient, 24–28px padding; `CardHeader` (title + muted subline left, one pill action right) |
| **Inner well / tile** | `.d-kv div`, `.a-tiles > div` (r12), `.d-in` (r14 + border), `.d-day` (r11 + border), Best/Worst hour boxes (bordered), trade-detail 8-cell divided grid, settings bordered stat tiles, brokers row cells | `Well` = surface-2 `#1C1C1F`, r16, no border |
| **Stat tile** | `KpiStrip` (5 separate cards + red/green split bar, `dashboard-parts.tsx`); analytics joined KPI strip with dividers; calendar joined strip; trade-detail grid; brokers 3 cards; settings tiles; macro trend cards with gradient sparkline; Fed `10Y REAL YIELD` uppercase tiles; SignalX track-record 2×2 | `Stat` = label, mono number (22px), one-line caption, optional thin bar |
| **Button: primary** | `.v3-btn--ink` (white pill + black arrow circle); auth submit `.au-*` (green pill + black arrow circle + glow); `.v3-btn--acc` (green + coloured shadow); journal "Save entry" (green gradient + glow, `app/journal/page.tsx:316`); SignalX "⚡ Analyze" (green gradient + glow); `.mk-brief-btn` "✦ Brief" (green + glow); location form submit (white rectangle r8, `components/location-form.tsx`); `.lg-cta` (legal white pill); `.l5-btn--acc/--beam/--white` (landing); `.btn-primary` (globals) | `Button variant="primary"`: one white pill per card, no glow, optional → |
| **Button: secondary** | `.v3-btn--o` (outline); `.sc-ghost`; `.btn-ghost` (admin `REFRESH`, uppercase); Copy/Regenerate pills; Cancel pills; notebook "Save entry" disabled graphite | `Button variant="secondary"` = graphite pill, no border |
| **Button: icon** | brokers key/trash circles; topbar sync/bell circles; calendar ‹ ›; chart drawing tools; send button (green circle); `.v3-modal-x` | `IconButton` (graphite circle, 36px) |
| **Button: destructive** | confirm "Remove broker" red pill; `.pt-btn-danger` | `Button variant="danger"` (red; destructive only) |
| **Link / tertiary** | green "Ask coach →", "See all →", "Journal →", "View all 78 →", "Read more ↗", "Open trade log →", green "Refresh" (mono, macro), green "Edit"/"Cancel" (settings) | `TextLink` (white or muted with →); green only when it means profit |
| **Segmented control** | `.v3-seg` (white active); `.d-tabs` Equity/Drawdown/Daily P&L (**green** active); trades filter seg with counts (large, white); Positions / Raw deals tabs; `.mk-tabs` News/Calendar; admin tabs (uppercase boxed, `components/admin/admin-tabs.tsx`); charts timeframe bar + layout toggle; settings Low/Medium/High; calendar "‹ Today ›"; cal-rail Upcoming/Today/Week/All + H/M/L red/amber circles; SignalX 15m/1h/4h/1d | One `Segmented` (graphite track, one active style) |
| **Vertical sub-nav** | macro side-nav `components/macro/macro-side-nav.tsx` (15 items, a second sidebar) | Fold into a `Segmented`/tabs row or into the main nav |
| **Filter chip** | `.r-chips` (journal), `.mk-chips` (news categories), "High impact" red-outline chip, symbol chips (news, SignalX, markets), `.a-chips`, `.ma-chips`, emotion chips (journal + notebook), Strategies preset chips | `FilterChip` (graphite; active = white) |
| **Status / tag chip** | `.v3-pill` g/r/**a**/**v**/n; `.tc-pill` (Entry green / Exit white); `.ch-pill`; `.mr-pills`; macro BULLISH/BEARISH/NEUTRAL uppercase rectangles; evidence `+ … / − …` chips; SignalX Hit T2/Stopped/**Open (amber)**; news Your market / Top story / Bullish / Bearish / High / Neutral; Active; New; "2 active"; "Peak $36,621"; win-rate % chips (amber at 45%); tag chips `#liquidity-grab`; LONG/SHORT mono chips; BUY/SELL | `Chip` with tone ∈ {neutral, profit, loss}; at most one chip per row item |
| **Input / select / textarea** | `.v3-field` (search); `.tinput` (r12); auth `.au-fields` inputs (r16); location form inputs (r8, 13px); connect-broker selects (square corners, `components/connect-broker-modal.tsx`); native `type=date` (notebook) and native number spinner (alert dialog); macro search input; coach composer; journal/notebook textareas | `Input`/`Select`/`Textarea` on surface-2, r14, no border (focus = 1px ring), custom date picker, hide spinners |
| **Toggle** | `components/v3/toggle.tsx` (green) | keep; green only means "on" |
| **Table** | `.v3-table`, `.d-table` (dashboard recent), `.t-table`/`components/deals-table.tsx`, analytics instrument table, executions table, macro indicator rows | `Table` (sans labels in sentence case, mono numbers, `--line` row dividers only) |
| **Progress / bar** | KPI red+green split bars; calibration bars with tick; macro bias gradient red→green slider; recession-odds bar; news relevance bars (unlabelled); strategy holdout green/red bar; instruments bars | `Bar` (2px–6px, single tone) |
| **Icon tile** | green soft squares (verify, notebook empty, status cards, settings aside, coach "TL" gradient avatar, macro AI); insight icons (red/green squares); macro unicode glyphs; emoji | `IconTile` per report §4 (green / red / graphite) + one line-icon set |
| **Symbol mark** | initials circles, S/L tiles, ticker tiles, broker tiles | `SymbolMark` (one style, real ticker abbreviations) |
| **Empty state** | `components/empty-state.tsx` (unused) + six ad-hoc variants (see §1h) | `EmptyState` (object + sentence + one button) |
| **Popover / dialog** | `.v3-modal` (connect broker, password, confirm, day trades, alert, news, sources: consistent); notification popover (Tailwind, `notification-bell.tsx`); `.v3-cmdk`; macro search modal; `.v3-acct-menu` | `Dialog` + `Popover` from one token set |
| **Tooltip** | white `.a-tip`, white chart pills, `.pt-toast` white, `components/macro/info-tip.tsx` | one dark `Tooltip` |
| **Page header** | six patterns (see §1d) | `PageHeader` (title, muted subline, one action) |

---

## 3. Per-route issues

### `/` (landing): `app/page.tsx`, `components/landing-v5/{nav,hero,sections,effects,ui,data}.tsx`, `landing.css`
Screens: `root-d.png`, `root-m.png`. Content reveals on scroll; static full-page captures show blank sections unless the page is scrolled first.
- **M** A serif-italic green word is in almost every section heading: "Now", "coach.", "not just", "history.", "one", "By design.", "three", "90s", "Mon", "answered.", "90 seconds.". Report §4 allows one, in the hero. Spans are `span.l5-s` (17 nodes).
- **M** The Security section is a full-width **white** section (`section.l5-sec`, 1440×892, `#fff`) between dark sections. The weekly-review mail mock `div.l5-mail` is also light (`#FAFAFA`). This is a hard theme break.
- **M** Amber "Timing" bar in the Behaviour score mock, a third accent.
- **M** The top of the page stacks three bars before the hero: the announcement pill bar, the nav, and a symbol ticker marquee.
- **M** The hero product shot is a picture of the current v5 dashboard, including its clutter (5 KPIs, 3 AI cards). It will need re-shooting after the redesign.
- **L** Many glow treatments: green radial glows behind the hero, CTA, phone, three-steps card 03, the beam button `.l5-btn--beam`, and the candle-forest footer. 54 gradients in `landing.css`.
- **L** Mobile: "SYNCS READ-ONLY WITH ANY METATRADER 5 BROKER" overlaps the faded product shot (`root-m.png`, slice 0, middle column).
- **L** Mono uppercase eyebrows with a leading dash ("— THE JOURNAL") and letter-spaced "A/B/C/D" card indices are decorative noise.

### `/login` (`login-stay-*.png`): `app/login/page.tsx`, `components/v3/auth-shell.tsx`, `app-v5.css:704-760`
- **M** Faux-italic green "back." (Satoshi has no italic face loaded at that weight).
- **M** The primary is a green pill with a black arrow circle and a green glow (`.au` submit). The app primary is a white pill.
- **L** Two reset links on one small form: "Forgot?" above the password and "Trouble signing in? Reset your password" below.
- **L** Satoshi 900 is used for headings but not loaded; the browser synthesises it.

### `/signup` (`signup-stay-*.png`): `app/signup/page.tsx`, `auth-shell.tsx`
- **M** The left panel is empty from the top to y≈430 on desktop. The ridgeline art from login, forgot and verify is missing here, so the panel looks unfinished.
- **M** Seven fields: name, email, password, country, city, postal and terms. Location could move to onboarding. This makes the densest form in the product.
- **L** Mono uppercase "YOU'RE HERE" step marker and mono "01/02/03".
- **L** The disabled primary ("Create account") is a dark pill and the enabled one is a green glow pill. That is a big jump between states.

### `/forgot` (`forgot-*.png`): `app/forgot/page.tsx`
- **L** Faux-italic green "password?" and "We've got you.".
- **L** The step bar uses green fill for step 1 of 2. This is fine, but it is another progress style.

### `/verify` (`verify-*.png`): `app/verify/page.tsx`
- **L** "Codes expire after 10 minutes" appears twice: under the OTP and in the left panel footer.
- **L** Without an email query param the copy reads "We sent a 6-digit code to **your email**", which looks like a placeholder.
- **L** The OTP boxes are bordered on a black canvas. Use surface-2 wells instead.

### `/dashboard` (`dashboard-*.png`, `x-dash-*.png`): `app/dashboard/page.tsx`, `components/v3/dashboard-parts.tsx` (HeroPnl, ReviewCard, KpiStrip, InsightList, MonthCalendar, RecentTrades, BehaviourCard, DayBars, Instruments, HourBars), `components/ai-report-card.tsx`, `app-v5.css:142-350`
- **H** Too many ideas on one screen: 5 KPI tiles, hero P&L, review card, behaviour card, 6-item insight list, month calendar, coach review, instruments, P&L by hour, recent trades and P&L by day. That is 11 cards and about 2,460px on desktop. The target is about 3 ideas per screen.
- **H** Three AI narrative surfaces (see §1f) say overlapping things:
  - "Your review" says Sats bleeds.
  - "What your trades say" says Sats bleed the most.
  - "Coach review" says Tuesdays are the weakest day.
  - The weakest day contradicts between cards: Sat in "Your review", Tue in "Coach review" (mock data).
- **H** "Drawdown" tab renders a **green** line and fill (`x-dash-drawdown.png`).
- **H** In "P&L by day" the weekday labels sit about 200px below the bars, at the bottom of a mostly empty card (`DayBars`). This happens on desktop and mobile.
- **M** Serif-italic "really" in the H1. "ONE THING TO FIX" uses a mono uppercase eyebrow plus serif-italic body text in a green-bordered box.
- **M** The topbar is crowded: a 5-item range seg, "Synced just now", Sync, a disabled grey "Add broker" pill and the bell. See §1c.
- **M** KPI tiles: each has a coloured bar, and "Avg win / loss" uses both green and red in one number plus a split bar. Five equal-weight tiles give no focal point.
- **M** The hero P&L card mixes several treatments:
  - "▲ 44.70%" mono badge;
  - sans "Balance" labels with mono values;
  - a white tooltip pill;
  - "Equity / Drawdown / Daily P&L" tabs with a **green** active state, while every other seg uses white;
  - "Start $25,000" mono label overlapping the line on the empty dashboard (`x-dash-empty.png`).
- **M** The review card has about 150px of dead space between the text and the Sun/Sat tiles. The tiles are bordered and the day names are coloured.
- **M** The behaviour card has a red 45% ring, mono "10W / 3L" and "1L" in green and red, and a row of key-value pairs with dividers. It is busy for a "discipline" summary.
- **M** In the month calendar, every day cell has a tinted green or red fill and a coloured border. Amounts are 9–10px mono and nearly illegible. The week starts on **Monday** here but on **Sunday** on `/calendar`.
- **M** Recent trades:
  - meaningless initials avatars ("NA", "US");
  - pastel mono `LONG`/`SHORT` chips;
  - uppercase mono table head;
  - on mobile the P&L column touches the card edge (`dashboard-m.png`, slice 1).
- **M** Instruments, P&L by hour and the Best/Worst hour tiles duplicate analytics. The hour chart has no y-axis. The Best/Worst tiles are bordered.
- **M** The empty state (`x-dash-empty.png`):
  - greeting still says "Here's how your trading is really going";
  - "+$0.00" shown with a green ▲ badge;
  - flat line plus tooltip;
  - no "connect / sync" call to action in any empty card.
- **M** Notifications popover (`x-dash-notif.png`, `components/notification-bell.tsx`):
  - every item uses the 📅 emoji;
  - Tailwind styling with `border-warning`;
  - no "mark all read" or footer;
  - the badge disappears while open.
- **M** The account menu (`x-dash-acct.png`) overlays nav items. Its "Add broker" is enabled while the header button is disabled.
- **L** ⌘K palette (`x-dash-cmdk.png`): the list is cut at the bottom ("Macro" half visible) with no fade. The group label "Journal" repeats on each row.
- **L** The mobile KPI grid leaves "Max drawdown" as an orphan full-width tile.

### `/trades` (`trades-*.png`, `x-trades-deals.png`): `app/trades/page.tsx`, `components/deals-table.tsx`, `app-v3.css:~440-575` (`t-*`, `.v3-table`)
- **H** At 1440 the TAG column is clipped by the card edge ("#liquidity-grab" cut). The table overflows its container horizontally.
- **H** Four filter controls compete:
  - a large All/Long/Short/Win/Loss seg with counts (top right);
  - a Positions / Raw deals tab;
  - an "All symbols" select;
  - a search field.
  - Add the summary strip and that is three rows of chrome before the first trade.
- **M** Serif-italic "78 positions." H1.
- **M** Mono is used for everything: dates (`Oct 29 06:42`), volume, entry/exit, held, uppercase letter-spaced headers. Dates and labels should be sans.
- **M** The table lives in an inner scroller (page is 1,020px tall). "Show 28 more" is hidden inside it, so there are two scrollbars on desktop.
- **M** Avatars, long/short chips and `#tag` chips put three chip styles on every row. Raw deals adds `BUY`/`SELL` chips and "Open/Close" text.
- **M** The summary strip (Net P&L, Win rate, Avg trade, Best, Worst) repeats the dashboard and analytics KPIs.
- **L** Mobile is long (4,412px) and has no sticky filter.

### `/trades/[positionId]` (`trades_8000000-*.png`): `app/trades/[positionId]/page.tsx`, `components/v3/trade-candles.tsx`
- **H** The candle chart is synthetic. It is labelled "Illustrative path · not tick data" in a tiny pill at the bottom left, which is easy to miss. The chart reads as real price action. Make the label prominent or show a neutral placeholder.
- **M** Net P&L appears twice: the big header number and the first stat cell.
- **M** The 8-cell stat grid has divider borders. Numbers are sans here but mono on `/trades`. Commission and swap are red even though they are fees, not losses.
- **M** The chart uses a green filled "entry zone" box, a green "Entry" pill and a white "Exit" pill. There is no price axis.
- **M** The Executions table header is clipped ("COMM." at the right edge). The journal entry empty box is dashed.
- **L** The topbar ← → arrow pair has no labels, and back is also "← Trade log" in the body.

### `/analytics` (`analytics-*.png`): `app/analytics/page.tsx`, `components/v3/analytics-parts.tsx`, `components/sortable-card.tsx`, `components/year-heatmap.tsx`, `app-v3.css:600-760` (`a-*`)
- **H** Two cards are huge dashed empty boxes (about 450px each): "Psychology edge" and "Setup edge". They take a third of the page for one sentence each.
- **H** "P&L by day" and "Hour of day" have detached x labels. Hour of day has no y-axis, and its red bar at 23:00 drops below the baseline into the label row.
- **M** Serif-italic "Dissect your edge." and a separate "Analytics · all time" eyebrow.
- **M** A drag handle (⋮⋮) on every card, plus "Drag cards to rearrange". This is permanent chrome for a rare action.
- **M** The 5-cell KPI strip, strike-rate card (donut plus 4 tiles) and distribution card (plus 4 tiles) repeat the same numbers: best, worst and avg each appear twice.
- **M** Session × weekday heatmap:
  - every cell is a tinted box;
  - the best cell "+2.7k" is bright green with green text, which is unreadable;
  - the total column is black boxes;
  - three outline chips below.
- **M** Instrument table has an **amber** 45% chip and pastel %-chips in every row.
- **M** Rolling edge and equity curve have no y-axis. "Peak $36,621.68" is a mono green pill.
- **M** The consistency heatmap is 12 months of tiny cells, with 11 months empty. Its legend sits bottom-right, detached.
- **M** The scatter (P&L vs hold time) has no y labels and only 2 x ticks. Dots are coloured but unlabelled.
- **L** The "Hour of day" Best/Worst/Most active tiles leave an orphan third tile.

### `/calendar` (`calendar-*.png`, `x-cal-day*.png`): `app/calendar/page.tsx`, `components/day-trades-modal.tsx`, `app-v3.css:~800-860` (`c-*`)
- **M** The week starts on **Sunday**, while the dashboard calendar starts on Monday.
- **M** Day cells have a tinted fill **and** a coloured border **and** coloured text, with intensity scaled by P&L. Applied to 27 cells it is loud. The today cell gets a white 2px border.
- **M** Faux-italic green "2026" in the H1 and an extra "Daily P&L" eyebrow.
- **M** The four KPI cells repeat the dashboard calendar header ("Month +$11,299.56").
- **L** Mobile drops the weekly column with no replacement, and amounts are abbreviated (+1.2k). This is fine, but it is inconsistent with the desktop full amounts.
- **L** The day modal is good. It still uses initials avatars and mono meta. On mobile the title wraps to three lines ("Friday, / October 23, / 2026") next to the P&L.

### `/charts` (`charts-*.png`, `x-charts-*.png`): `app/charts/page.tsx`, `components/charts/{kline-chart,layout-grid,symbol-search,timeframe-bar,indicator-menu,drawing-toolbar,watchlist,alerts-panel,alert-dialog}.tsx`, `app-v3.css:~1040-1240` (`ch-*`)
- **M** The four chart panes are each bordered cards; the active pane gets a **green** border. Chart axes use the klinecharts default sans and colours, unlike other charts.
- **M** The toolbar packs a lot into one row: symbol search, 8 timeframes, "ƒx Indicators" (Georgia italic), 4 drawing tools and delete.
- **M** The watchlist and alerts rail mixes mono symbols ("BTCUSDT ≥ 68,000") with sans names. "2 active" is a mono green pill.
- **L** The alert dialog shows the browser's native number spinner on Price. "Now 67,420" is mono and the label sans.
- **L** On mobile the EURUSD pane's time axis is clipped at the left ("01:30" cut). Four stacked charts make a 2,499px page.

### `/journal` (labelled "Chart replay") (`journal-*.png`, `x-journal-row*.png`): `app/journal/page.tsx`, `components/replay/trade-chart.tsx`, `app-v3.css:~880-1000` (`r-*`)
- **H** Naming: the route is `/journal`, the nav says "Chart replay", and `/notebook` is called "Journal". See §1c.
- **M** The filter chip row is clipped: "Reviewed 0" is cut off at the panel edge on desktop and mobile, with no scroll affordance.
- **M** The "Save entry" primary is a **green gradient pill with glow**. Notebook's "Save entry" is a graphite pill. These are two different primaries for the same action.
- **M** The trade review hero box is green-bordered with a green fill, mono meta and a big P&L. It repeats the header P&L in the middle column.
- **M** Three columns end at different heights (843 / 843 / 865). The positions list scrolls internally; on mobile it is only about 250px tall at the bottom of the page.
- **M** The list uses "S"/"L" red/green letter tiles, a different symbol mark from `/trades`. Money is sans here, mono on `/trades`.
- **M** The chart has no price axis. There is an "Illustrative" pill plus Short/Win/P&L chips in the header, and a tiny "1/78 ‹ ›" pager.
- **L** "⌘ Enter to save · ↑ ↓ to switch trades" hint text is low contrast (about #444 on #0F0F0F).

### `/notebook` (labelled "Journal") (`notebook-*.png`): `app/notebook/page.tsx` (`n-*` classes)
- **M** The H1 is "0 entries." in serif italic, with "Trading logbook" as eyebrow. The crumb reads "Journal / Journal".
- **M** The KPI strip shows five tiles of zeros and dashes when empty, which repeats the empty state on the right.
- **M** Export CSV is enabled in the topbar with 0 entries.
- **M** The date input is the native `type=date` (dd/mm/yyyy, browser calendar icon). The title placeholder is clipped ("London session revie").
- **M** Emotion chips duplicate the journal (chart replay) review panel. Two places capture the same data.
- **L** The disabled "Save entry" is a full-width graphite pill with barely visible text.

### `/markets` (`markets-*.png`, `x-markets-*.png`): `app/markets/page.tsx`, `components/news/{news-feed,news-modal,news-thumb,source-picker}.tsx`, `components/calendar/calendar-rail.tsx`, `app-v3.css:1240-1450` (`mk-*`)
- **H** "Chip soup" at the top:
  - 7 category chips;
  - a red-outlined "High impact" chip;
  - a green "Live" pill;
  - "Sources · 8";
  - a green glowing "✦ Brief";
  - a second row of 8 symbol chips with an "All" in green outline.
  - Three rows of controls before content.
- **H** Every news card carries 3–5 pills: "Your market", source/time, Bullish/Bearish/Neutral, High, category. Each also has an unlabelled green progress bar (relevance) and an **amber/brown** ticker tile ("XAU", "EUR", "NDX").
- **M** The lead story thumbnail is a generic green line-chart illustration (`news-thumb.tsx`), the same for every story. Placeholder art.
- **M** On desktop the news cards truncate headlines ("…yields tic…") and cut body text mid-line at the card bottom.
- **M** Calendar rail:
  - mono times;
  - amber/red impact dots;
  - flag emoji;
  - H/M/L red/amber circles;
  - **amber** watch stars;
  - mono "A 0.4▲ F 0.2 P -0.3".
  - Very dense; the "Now · 13:23" line is green.
- **M** "Sources · 8" button but the modal says "0 selected" (`x-markets-sources.png`). The state is inconsistent.
- **L** "✦ Your morning brief" shows "Writing your brief…" with no spinner or skeleton (`x-markets-brief.png`).
- **L** On mobile the category and symbol chip rows are clipped ("Regula…", "EURUSD (") with no fade.

### `/macro` (`macro-*.png`, `x-macro-*.png`): `app/macro/page.tsx`, `components/macro/*` (macro-ticker, macro-side-nav, macro-search, macro-dashboard, summary-cards, market-tiles, asset-bias-grid, global-bias-gauge, regime-narrative, regime-quadrant, confluence-panel, indicator-groups, yield-curve, policy-rates, fed-desk, macro-calendar-panel, events-headlines, bull-bear-scanner, paper-blotter, macro-assistant, macro-compliance), `lib/macro-meta.ts`, `app-v3.css:1450-1790`
- **H** A second sidebar: the 15-item `macro-side-nav` sits next to the app sidebar. Below it, the left column is empty for about 3,000px.
- **H** The same 8-asset bias appears three times on one page: "Asset macro bias" cards with slider, "Confluence engine" bars, and 8 market tiles with BULLISH/BEARISH chips and bars. The 4,041px desktop and 7,274px mobile page lengths come mostly from repetition.
- **H** The "Confluence engine" sub-view is broken (`x-macro-confluence.png`). A 1,400px card is about 500px empty at the top, with the gauge and bars pushed to the bottom.
- **M** Too many chrome rows before content: ticker marquee (with "Live" pill), search with its own ⌘K, mono "engine v4.2 · 33 indicators · as of 07:53 UTC · Refresh".
  - The ticker's first item is clipped under the "Live" pill ("4.2 -0.18%", "2 -0.18%").
- **M** **Amber** "Key tension:" and MEDIUM chips; regime pills come from `tone:'purple'|'blue'` remapped to pale green.
- **M** The regime card has a radial green glow and serif-italic "growth."; the bias gauge is a red→green gradient slider. Different visual language from the rest of the app.
- **M** Indicator groups:
  - unicode/emoji glyph headers (`lib/macro-meta.ts:37`; ⚡ renders yellow);
  - an "i" info icon on every row (33 of them);
  - sparklines with red/green endpoints;
  - values in sans, while the trend tiles above are mono.
- **M** Uppercase rectangular chips: `BULLISH`, `UPWARD`, `STANCE · DOVISH`, `8 ASSETS`, `GROWTH × INFLATION`, Fed tiles `10Y REAL YIELD`.
- **M** The Fed sub-view stops at y≈630, leaving the rest of the screen empty. The paper blotter empty state has no action and refers to a "Signals tab" that does not exist under that name.
- **L** `// MACRO AI` and `// CONFLUENCE ENGINE` code-comment eyebrows. "NOT FINANCIAL ADVICE · GROUNDED ON LIVE DASHBOARD STATE" uppercase footer, plus another disclaimer block below.
- **L** The macro search modal (`x-macro-search.png`) is a different component from the app ⌘K, with a different footer style.

### `/macro/assets/[symbol]` (`macro_assets_XAU-*.png`): `app/macro/assets/[symbol]/page.tsx`, `components/macro/count-up.tsx`
- **H** Data mismatch: the header shows last price **2,387.4** (mock), while the embedded TradingView chart shows XAUUSD around **4,025**. The page contradicts itself.
- **H** On mobile the TradingView embed renders as an empty card about 800px tall (`macro_assets_XAU-m.png`).
- **M** TradingView brings its own font, toolbar, colours (OANDA teal/red) and an "O∅ H∅ L∅ C∅" legend. The theme colours passed to it are invalid (console errors).
- **M** "Bias score 71%" is a score shown as a percent. The 120px green number and the 72px white price give two competing hero numbers.
- **L** The breadcrumb is duplicated: topbar "Macro / Gold" and body "‹ Macro / Gold XAUUSD".

### `/trader` (SignalX) (`trader-*.png`): `app/trader/page.tsx`, `components/trader/{trader-master,track-record,strategy-builder}.tsx`, `app-v3.css`/`app-v5.css` (`sx-*`)
- **M** "⚡ Analyze" is a green gradient pill with glow and a lightning emoji. "Compile" is a grey pill. Serif-italic green "X" in the title.
- **M** **Amber** "Open" status chip; "Hit T2/Stopped/Hit T1" chips use 3 tones.
- **M** Recent rows show "72%" confidence on every row (mock data). They look like placeholder data without a label.
- **M** Columns are unbalanced: the left column ends at y≈760 while the right column (Track record + Strategies) runs to about 1,450.
- **M** Strategy cards:
  - black chips "Breakout / LONG / 20 bars / 1h / 1.5 ATR / 2R";
  - mono holdout line;
  - green/red split bar;
  - 2 outline buttons.
  - Dense.
- **L** Mobile Recent rows truncate ("Oct 25…", "Oct …").

### `/coach` (`coach-*.png`): `app/coach/page.tsx`, `components/coach/*` (`cs-*`)
- **M** The layout differs from every other page: a full-bleed two-pane layout with no page header, and the history pane is a darker strip with a border.
- **M** Assistant messages use bold 700 headings and spans. The user bubble is solid green, so green is used for a non-profit meaning.
- **L** The "Preview mode: connect the real backend…" italic line is visible (mock text, `lib/mock-coach.ts:14`). It is only seen in mock mode.
- **L** The "New chat" white pill is full width (295px). The send button is a dim green circle when disabled.

### `/brokers` (`brokers-*.png`, `x-brokers-*.png`): `app/brokers/page.tsx`, `components/connect-broker-modal.tsx`, `components/update-broker-password-modal.tsx`, `components/confirm-dialog.tsx` (`br-*`)
- **M** Hero card with a radial green glow and dot grid (`.br-hero`, `app-v5.css:567-572`), plus serif-italic "brokers.".
- **M** The hero "Add broker" is disabled when the limit is reached. It renders as a grey pill with a "+" circle and looks broken.
- **M** Status is shown twice per row: an "● Active" chip next to the name and "● Connected" in the Status column. Each row also has a green left bar.
- **M** "Broker limit reached" is a dashed card with a green "+" tile that looks clickable but is not.
- **M** Connect modal: the Broker/Server selects have square corners while the MT5 login/password inputs are rounded (`x-brokers-add.png`).
- **L** Totals ($46,169.64) are sans while row balances are mono. "connected 13 months ago" wraps to 2 lines.

### `/settings` (`settings-*.png`, `x-settings-edit.png`): `app/settings/page.tsx`, `components/settings/{profile-card,notification-settings,settings-aside}.tsx`, `components/location-form.tsx` (`pf-*`, `st-*`)
- **M** The profile banner is a decorative green-gradient **fake equity line**, with a large gradient "AM" avatar overlapping it. Fake-looking data.
- **M** Nested bordered boxes: stat tiles (Connected accounts / Plan / Data source / Location) are bordered cards inside a card.
- **M** The location edit form (`location-form.tsx`) uses a different input spec (radius 8, 13px text, 11px labels) and a full-width white **rectangular** "Save location" button.
- **M** "Weekly review" appears twice: in "How alerts reach you" and as its own toggle card. The "Instant/Daily/Saturday" chips use `.v3-pill v`.
- **M** "🔒 Private & read-only" uses an emoji from CSS (`.st-priv b::before`) on a glow card.
- **L** The "15 min" stepper value is mono and its labels sans. Two separate cards repeat the "Sign out" action (sidebar footer plus profile).

### `/admin` (`admin-*.png`): `app/admin/page.tsx`, `components/admin/*`
- **H** In mock mode every `/api/admin/*` call returns 500 (`lib/admin-api.ts:191-210` has no mock prefix). The page shows only an error, so the real UI could not be audited. Add mocks under `/data/admin/*`.
- **H** A third design system: Tailwind with `globals.css` tokens (`tcard`, `btn btn-ghost`, `font-black`, `text-[9px] tracking-widest uppercase`, `text-warning`). It does not use v3/v5 primitives at all (211 Tailwind usages in `components/admin`).
- **M** Uppercase boxed tabs `OVERVIEW / USERS / ACCESS / SYSTEM` and an uppercase "REFRESH" button. Neither matches any other tab or button.
- **M** The error state is red text in a full-width bordered bar, with no icon and no retry button inside it.
- **L** Different page padding (x=268 to 1420).

### `/access/elefin` (`access_elefin-*.png`): `app/access/elefin/page.tsx`, `components/v3/status-card.tsx`
- **L** Faux-italic green "Elefin". Green glow primary with arrow (auth style). Otherwise clean.

### `/access/inactive` (`access_inactive-*.png`): `app/access/inactive/page.tsx`, `status-card.tsx`
- **H** The whole card is **amber**: top border, icon tile, eyebrow, italic "stay in.", and a "Your trades: 1" amber-bordered tile. Amber is the forbidden third accent. Use red (risk) or neutral.
- **M** The "Required 3" tile is green-bordered and the "Your trades 1" tile amber-bordered: two coloured bordered tiles side by side.
- **L** The secondary "Connect / sync broker" sits directly under a glowing green primary. Two full-width buttons.

### `/maintenance` (`maintenance-*.png`): `app/maintenance/page.tsx`
- **L** `tone="v"` (violet) is passed. It renders green now only because of the token remap.
- **L** The endpoint 500s in mock mode, so the fallback copy is shown. Two paragraphs say the same thing.

### `/privacy` and `/terms` (`privacy-*.png`, `terms-*.png`): `components/v3/legal-page.tsx`, `app/privacy/page.tsx`, `app/terms/page.tsx`
- **L** Faux-italic green "policy." / "service.". Mono green "01, 02…" section numbers.
- **L** On mobile the list items have no bullets, just an indent, so lists read as floating paragraphs.
- **L** The header "Sign in" is a white pill (`.lg-cta`), a different header from the landing nav and the auth pages.

### `/unsubscribe` (`unsubscribe-*.png`): `app/unsubscribe/page.tsx`
- **L** Faux-italic **red** "missing a token.". The red icon tile and red eyebrow are appropriate (error). Fine otherwise.

### `/news`, `/economic-calendar`
- No UI. Server redirects to `/markets`. Make sure nav and command palette entries no longer point here. The palette was checked and does not list them.

---

## 4. Suggested order of work (from the list above)
1. Replace the three-file cascade with one token file (`app-v6.css`) that has the target tokens, and delete `app-v5-auto.css`.
2. Build the primitives in §2. Kill amber, violet, glows, serif italic and synthesised weights.
3. Fix the high-severity broken items:
   - drawdown chart colour;
   - detached chart axes;
   - trades TAG clipping;
   - confluence engine blank;
   - macro asset price mismatch and blank mobile embed;
   - disabled Add broker look;
   - admin mocks.
4. De-duplicate content:
   - one AI card on the dashboard;
   - analytics owns the deep charts;
   - macro shows the asset bias once;
   - markets reduces chips to one row.
5. Rename the nav: Chart replay vs Journal vs Notebook; SignalX naming.
