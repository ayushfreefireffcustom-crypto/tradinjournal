# TRADElogs master TODO

Started 29 Oct 2026. Tick items as they land: `- [x]`. Each item should be small enough to finish and verify on its own.

**Sources this list is built from** (re-check them before starting a phase):
- `reports/competitor-functionality-report.md`: MirrorPip and Cryptomaty inventory, gaps, integration plan.
- `reports/ui-direction-report.md`: target design system.
- `reports/ui-audit.md`: page-by-page UI issues, from screenshots of every route.
- MirrorPip-X code in `~/Desktop/mirrorpip-x`: the copy engine and the Delta adapter we are porting.

**Ground rules** (apply to every item):
- **Commits**
  - Commit only, never push. Railway deploys on push.
  - No "Claude" in commits.
  - Work on branches: `feat/ui-v6` for Part A, `feat/trading-platform` for Part B onward.
- **Database**
  - Develop against the local test DB (`postgresql://tj@localhost:5444/tradinjournal_test`).
  - Neon (production) only through `prisma migrate deploy`, after `migrate status`, a SQL review and the user's OK.
  - Never delete data.
- **Secrets**
  - Never echo secrets.
  - Never rotate `CREDENTIAL_ENCRYPTION_KEY`.
  - Exchange keys go through `apps/api/src/lib/secrets.ts` (`enc:v1:`).
- **Exchanges**
  - **Delta testnet only** until the user says go live. The SEBI/legal check comes before that.
- **Data**
  - No fake numbers in the product. Sample data is labelled. Unknown shows as "—" or "Unknown", never 0.
- **Definition of done** for every item:
  - typecheck passes
  - tests pass, with new tests where there's logic
  - checked in the browser at 1440 and 390 widths
  - no console errors

Legend:
- Size: `S` ≤ half a day, `M` ≈ 1–2 days, `L` ≈ 3+ days. A todo should rarely be L; split L items.
- Evidence: `MP` = MirrorPip, `CM` = Cryptomaty, `MPX` = our MirrorPip-X code. "seen" means observed live; "code" means found only in their shipped code.

---

# PART A — Fix the existing UI (do this first)

> Order of work: **A0 (cross-cutting cleanup + decisions) and A4 (per-page fixes) are at the bottom of this file**. Do A0 decisions → A1 → A2 → A3 → A0 cleanup → A4 pages → A5 → A6 → A7.

## A1. Design foundation (v6 tokens)
- [x] A1.1 Create branch `feat/ui-v6` from `main` `S`
- [x] A1.2 Write `apps/web/src/styles/tokens.css` with the tokens from the UI report `S`: — done 30 Oct as `styles/v6/tokens.css`, scoped to `.v6` (dark default, `html[data-theme=light]` overrides; theme set before paint in `app/layout.tsx`)
  - canvas `#0B0B0C`
  - surface-1 `#151517`
  - surface-2 `#1C1C1F`
  - line `rgba(255,255,255,.06)`
  - text / muted / dim
  - green `#08C465`, red `#FE3A31`
  - radii 24/16/12/999
  - spacing 4/8/12/16/20/24/32/40
  - shadows (none by default, 1 elevation for popovers)
  - motion durations
- [ ] A1.3 Add the type scale as tokens: 12 / 13 / 14 / 15 / 18 / 22 / 32 / 44 / 56; line-heights; letter-spacing −0.02/−0.03 for headings `S`
- [ ] A1.4 Confirm which fonts are already loaded (`app/layout.tsx`) and keep one sans + JetBrains Mono. Remove unused font loads `S`
- [x] A1.5 `.num` utility: mono, `tabular-nums`, used for every price, P&L, count and time `S` — `.v6 .num`
- [ ] A1.6 P&L colour helpers: `.pos`/`.neg`/`.flat`, plus a JS `pnlClass(n)` in one shared file `S`
- [ ] A1.7 Number formatters in one module: `fmtUsd`, `fmtPct`, `fmtNum`, `fmtCompact`, `fmtDuration`, `fmtUnknown` ("—"). Replace the duplicates found by grep `M`
- [x] A1.8 Dark scrollbars, selection colour, focus-ring token (green 2px offset) `S` — v6 scope only
- [x] A1.9 `prefers-reduced-motion` handling in the tokens file `S`
- [ ] A1.10 Plan how to retire `styles/app-v5-auto.css` (an auto-generated recolour of v3): list every class it covers that is still used `S`
- [ ] A1.11 Decide the final CSS structure: `tokens.css` + `components.css` + per-feature CSS. Document it in `apps/web/src/styles/README.md` `S`

## A2. Shared UI primitives (React, `apps/web/src/components/ui/`)
- [x] A2.1 `Card`: surface-1, radius 24, padding 24 (20 on mobile). Variants `inset` (surface-2, radius 16) and `flush` `S` — as `x-card` / `x-inset` CSS classes in styles/v6/components.css
- [x] A2.2 `CardHeader`: title + muted subline on the left, one action slot on the right `S` — `x-ch`
- [x] A2.3 `Button`: `primary` (white pill), `secondary` (graphite pill), `ghost`, `danger` (red), `link` (text + →); sizes sm/md; loading state; icon slot `S` — `x-btn` + --hi/--g/--danger/--ghost/--dash/--sm/--lg/--icon
- [ ] A2.4 `IconButton` (round, 36px), with a tooltip label for a11y `S`
- [x] A2.5 `Segmented` (range chips, tab switches) with keyboard arrows `S` — `x-seg`
- [x] A2.6 `Tabs` (underline variant for page sub-nav) `S` — `x-tabs`
- [x] A2.7 `Chip`/`Tag`: neutral, pos, neg, with optional removable × `S` — `x-tag` + --g/--r/--solid
- [ ] A2.8 `Badge` ("New", counts) `S`
- [x] A2.9 `Stat`: label, big `.num` value, sub-line, optional thin bar, optional ⓘ `S` — `x-stat`
- [x] A2.10 `StatStrip`: 3–4 stats split by hairlines, as in the reference (27 / 32 / 33) `S` — `x-strip`
- [ ] A2.11 `InfoTip` (ⓘ popover with "what it is / why it matters"). Replace `components/macro/info-tip.tsx` usage everywhere `S`
- [ ] A2.12 `Well`: a dark framed thumbnail container for mini-charts, with a mono caption `S`
- [ ] A2.13 `IconTile`: glossy rounded-square SVG master, palettes green/red/graphite `M`
- [ ] A2.14 Form set: `Field`, `Input`, `Select`, `Textarea`, `Checkbox`, `Switch`, `Radio`, `NumberStepper`, `SearchInput` (⌘K hint). Error and help text `M`
- [ ] A2.15 `Sheet`/`Dialog` (bottom sheet on mobile, centred dialog on desktop). Replace `components/confirm-dialog.tsx` and `components/v3/confirm-dialog.tsx` with one `M`
- [ ] A2.16 `Menu`/`Dropdown` with keyboard support `S`
- [ ] A2.17 `Tooltip` `S`
- [x] A2.18 `Table`: sticky header, sortable header cells, row hover, mobile card fallback, empty row `M` — `x-tbl` + `x-tblwrap`; dashboard shows the phone card fallback
- [x] A2.19 `EmptyState`: art slot + one sentence + one button. Replace `components/empty-state.tsx` `S` — `x-empty`
- [x] A2.20 `Skeleton` set (text, stat, chart, table rows), shaped like the real content `S` — `x-skel`
- [x] A2.21 `ErrorState` with retry, plus an inline `Banner` (info/warn/error), replacing ad-hoc red boxes (e.g. the dashboard "Broker bridge unavailable" box) `S` — `x-banner` --err/--ok
- [ ] A2.22 `Toast`: unify `components/toast.tsx` styling to the tokens `S`
- [ ] A2.23 `Avatar` + `AccountPill` (exchange/broker badge + name + last-4) `S`
- [ ] A2.24 `Pagination`/"Load more" `S`
- [ ] A2.25 `DateRangePicker` with presets: today, yesterday, this week, last week, this month, last month, YTD, last year, custom. Evidence: MP seen `M`
- [ ] A2.26 Chart kit: one `ChartTheme` (axes `--dim`, grid `--line`, tooltip card, crosshair) applied to equity, drawdown, bars, scatter, rolling, heatmap, kline `M`
- [ ] A2.27 `Sparkline` (single shared one; remove the duplicates in `macro/sparkline.tsx` etc.) `S`
- [ ] A2.28 A `/dev/ui` primitives gallery page (dev only) to review every primitive in one place `S`
- [ ] A2.29 Unit tests for formatters + `pnlClass`; a render smoke test for each primitive `S`

## A3. App shell
- [x] A3.0 v6 frame (`components/v6/frame.tsx`) behind `AppShell frame="v6"`: icon rail in a pill, top-bar pills, phone tab bar. Dashboard uses it (30 Oct) `M`
- [x] A3.0b Frame is the default for every page; pages not yet rebuilt render inside the old style scope (`legacy`) `M`
- [ ] A3.0d Rebuild each page on the v6 components (`legacy={false}`): trades, analytics, calendar, journal, notebook, charts, markets, macro, SignalX, coach, brokers, settings, admin, partner, auth/status/legal `L` (in progress 31 Oct)
- [ ] A3.0c Light theme for portalled UI (connect-broker modal, toasts, ⌘K palette still render dark) `S`
- [x] A3.1 Rebuild `components/app-shell.tsx` on the new primitives. Keep the props API (`accounts`, `selectedAccount`, `pageTitle`, `actions`…) `M` — v6 frame (`components/v6/frame.tsx`) is now the only shell; props API kept (31 Oct)
- [x] A3.2 Sidebar `M`: — labelled groups, green active edge, icon rail with tooltips at ≤1180px
  - groups (Journal / Markets / AI / Account)
  - active item with green edge
  - consistent line icons
  - collapsible to an icon rail
  - "New" badges only where true
- [x] A3.3 Account switcher moved into the top bar as an `AccountPill`. The sidebar account card is removed `S` — v6 frame: account pill with accounts, Sync now, Add/Manage brokers
- [x] A3.4 Top bar `S`: — v6 frame: search pill, range menu slot, account pill, theme toggle, bell, avatar menu; sync status lives in the account menu
  - breadcrumb/title
  - ⌘K search pill
  - range control slot
  - sync status (dot + "Synced 2m ago")
  - primary action
  - bell
  - avatar menu
- [x] A3.5 Mobile `M`: — v6 frame: bottom tab bar (Dashboard, Trade log, Chart replay, Coach, More sheet); no sideways scroll at 360/390
  - top bar + bottom tab bar (5 key destinations) or a drawer; pick the one that tests better at 390px
  - no horizontal scroll anywhere
- [x] A3.6 Sidebar footer: user + plan + sign out. Remove the duplicate sync card `S` — user card with plan; menu has theme, settings, sign out
- [x] A3.7 Page container: max width, gutters 32/16, consistent vertical rhythm between sections `S` — frame pads the content; `x-page` / `x-row` grids
- [x] A3.8 Page header pattern: H1 + subline + right-side actions, used by every page `S` — title + subtitle + actions in the frame top bar via AppShell props
- [ ] A3.9 Global ⌘K palette: pages + symbols + recent trades + actions, keyboard nav. Extends the existing implementation (find it via grep `cmdk|CommandPalette`) `M`
- [ ] A3.10 Notification bell dropdown restyled. Channel tabs come later (C1) `S`
- [ ] A3.11 Remove `app-v5-auto.css` once all pages are migrated (blocked by A4) `S`

## A4. Pages (filled from `reports/ui-audit.md`; see the bottom of this file)

## A5. Landing page (Apptics rhythm, black)
- [x] A5.1 Section pattern component: label pill + 2-line heading (left), muted paragraph + one dark pill CTA (right), bento below `M`
- [x] A5.2 Stat tile: icon tile + **bold number** + regular words, with a ghost watermark glyph `S`
- [ ] A5.3 Code-built glass art, one SVG/CSS scene per product area, each self-contained `L → split`:
  - [x] A5.3a Journal notebook slab + floating trade chips `M`
  - [ ] A5.3b Copy trading: leader card → you card + "Copied · 0.4s · slippage" toast `M`
  - [ ] A5.3c Strategy blocks ("RSI < 30", "EMA 50 > 200") + green Deploy chip `M`
  - [x] A5.3d Risk shield in red with "Daily loss cap hit" toasts `M`
  - [x] A5.3e Analytics: isometric glass bars in green `M`
  - [x] A5.3f AI coach chat bubble stack `M`
- [x] A5.4 Closing scene: 8 feature icon tiles scattered on a faint grid `M`
- [x] A5.5 Integrations grid (dashed lines): MT5, brokers, exchanges, TradingView, Telegram. Only logos we're allowed to use `S`
- [x] A5.6 FAQ accordion with hairlines and +/× `S`
- [x] A5.7 Footer with a giant ghosted "TRADElogs" wordmark, link columns and a contact card `S` (contact card points to the AI coach; there is no Telegram channel yet)
- [ ] A5.8 Rewrite landing copy for the new scope (journal + copy + strategies). No unverified numbers `M`
- [ ] A5.11 Delete the unused `components/landing-v5/` (keep `useSignedIn` by moving it to `lib/`, it is imported by landing-v6) and `public/landing/*` shots it used `S`
- [ ] A5.9 Landing performance: Lighthouse ≥ 90 on mobile, no layout shift, lazy art `M`
- [x] A5.10 Check the hero WebGL silk: keep it or replace it with a calmer glass object (decide with the user using screenshots) `S`

## A6. Auth and system pages
- [ ] A6.1 `/login`, `/signup`, `/forgot`, `/verify` on the new primitives (see the audit for specifics) `M`
- [ ] A6.2 `/maintenance`, `/access/elefin`, `/access/inactive`, `/unsubscribe` `S`
- [ ] A6.3 `/privacy`, `/terms` legal layout (`components/v3/legal-page.tsx`) `S`
- [ ] A6.4 404 and error pages (`not-found.tsx`, `error.tsx`, `global-error.tsx`); check whether they exist `S`
- [ ] A6.5 Loading states (`loading.tsx`) per route group `S`

## A7. UI QA pass
- [ ] A7.1 Screenshot every route at 1440/1024/390 before and after; keep them in `design/ui-v6/` `S`
- [ ] A7.2 Contrast check: text ≥ 4.5:1, muted ≥ 3:1 on its surfaces `S`
- [ ] A7.3 Keyboard pass: tab order, focus rings, Esc closes sheets, ⌘K `S`
- [ ] A7.4 Delete dead CSS (`app-v3.css` rules no longer referenced), dead components and `v3/` leftovers `M`
- [ ] A7.5 Bundle check: no page ships CSS from other pages unnecessarily `S`
- [ ] A7.6 User review checkpoint: show the screenshots and get sign-off before Part B `S`

---

# QUICK WINS (run alongside, small, no execution needed)
- [ ] QW.1 Custom date range on the dashboard, trades and analytics (uses A2.25). Evidence: MP seen `S`
- [ ] QW.2 Hide-balance toggle on money KPIs, remembered per device (localStorage wrapped in try/catch). Evidence: MP seen `S`
- [ ] QW.3 Sharpe ratio from the daily equity series in `lib/stats.ts` + an API equivalent; unit test `S`
- [ ] QW.4 Sortino ratio; unit test `S`
- [ ] QW.5 CAGR and recovery factor; unit tests `S`
- [ ] QW.6 Year P&L heatmap (12 month blocks, monthly totals under each). Extends `components/year-heatmap.tsx`. Evidence: MP seen `S`
- [ ] QW.7 Asset-allocation donut (top 6 + Others, P&L on hover). Evidence: MP seen `S`
- [ ] QW.8 ⓘ explanation on every dashboard/analytics metric (A2.11), with copy written for each metric `M`
- [ ] QW.9 "Unknown ≠ 0" sweep: every metric with no data renders "—" with a reason tooltip. Evidence: CM seen `S`
- [ ] QW.10 Exit-reason inference from MT5 deal comments (`[tp]`, `[sl]`, `so:`). Filter on `/trades` `M`
- [ ] QW.11 Source column/filter on trades (Manual / Copied / Strategy), ready for Part B `S`
- [ ] QW.12 Multiple watchlists (up to 8, unique names, rename/delete, at least 1 kept). Migrate the `Watchlist` model from one row per user to lists. Evidence: MP seen + code `M`
- [ ] QW.13 Watchlist CSV import (report skipped rows) and export `S`
- [ ] QW.14 Star-to-watchlist from charts, markets and macro asset pages `S`
- [ ] QW.15 "Test notification" button with an honest result ("this device didn't show it"). Evidence: CM seen `S`
- [ ] QW.16 Data-freshness labels ("updated 12s ago") on market/macro/news widgets. Evidence: CM seen `S`

---

# PART B — Trading platform foundation (Phase 0)

## B0. Research spikes (before writing code; record findings in `reports/`)
- [x] B0.1 Read the MPX `packages/exchange/src/{types,delta,crypto,registry,index}.ts` line by line; write `reports/mpx-port-notes.md` `S`
- [x] B0.2 Read the MPX engine `apps/engine/src/{main,watchers,fanout,sizing,position,reconcile,stats,killswitch}.ts`; add to the port notes `S`
- [x] B0.3 Read the MPX web API routes (`apps/web/src/app/api/**`) and `lib/services/copy.ts`; map each to an Express route in our API `S`
- [x] B0.4 Delta India API docs: orders (market/limit/stop), cancel, leverage, positions, `/v2/orders/{id}`, WS channels (`user_trades`, `orders`, `positions`, `margins`), rate limits, testnet differences. Note the exact endpoints `M`
- [x] B0.5 Same API research for the Binance USDⓈ-M futures API `M`
- [x] B0.6 Same API research for the Bybit v5 API `M`
- [x] B0.7 Same API research for the OKX v5 API `M`
- [x] B0.8 Same API research for CoinDCX futures, KuCoin futures, Shark, Pi42, Mudrex, CoinSwitch (the venues MP and CM list). Mark which have public trading APIs `M`
- [x] B0.9 Static egress IP options on Railway (or a proxy) for IP-whitelisted keys; costs; decide with the user `S`
- [x] B0.10 Legal: write a 1-page question list for a SEBI/algo-trading opinion (copy trading, strategy execution, paid leaders later) and send it to the user `S`
- [x] B0.11 Check `packages/core` / `lib/market/providers/binance.ts` for reusable candle/WS code for the indicator engine `S`

## B1. Database (local test DB first)
- [x] B1.1 Design the Prisma models with FKs to `user`. Write the schema diff for review `M`:
  - `ExchangeConnection` (exchange enum, label, apiKeyEnc, apiSecretEnc, passphraseEnc?, keyLast4, keyFingerprint, accountRef, env testnet|live, status, lastError, lastCheckedAt, permissions JSON)
  - `Leader`, `LeaderEquityPoint`, `LeaderStat`
  - `Follow`
  - `LeaderFill`
  - `Order` (generalised from MPX `CopyOrder`: source manual|copy|strategy|webhook; type market/limit/stop; tif; reduceOnly; status incl. SUBMITTED/OPEN/PARTIAL/FILLED/CANCELLED/REJECTED/SKIPPED/EXPIRED; exchangeOrderId; clientOrderId unique; slippageBps; leaderPrice; error)
  - `Position` (per connection + symbol: qty, avgEntry, mark, uPnL, rPnL, source)
  - `ExchangeFill` (our own fills, for history + journal)
- [x] B1.2 Enums: `Exchange` (DELTA_INDIA, BINANCE, BYBIT, OKX, COINDCX, KUCOIN… only those that have adapters), `ConnectionStatus`, `LeaderStatus`, `FollowStatus`, `SizingMode`, `OrderStatus`, `OrderType`, `OrderSource` `S`
- [x] B1.3 Indexes for the hot paths: fills by leader+time, orders by follow+status, positions by connection `S`
- [x] B1.4 Create the migration on the local test DB (`prisma migrate dev` with `DATABASE_URL` set to the test DB **only**) `S`
- [x] B1.5 Seed script for the test DB: one leader + two followers (fake users, no real keys) `S`
- [x] B1.6 Review the SQL; confirm it is additive only (no DROP or ALTER of existing tables) `S`

## B2. `packages/exchange`
- [x] B2.1 Create the package (raw TS like the other packages, so it runs under tsx) `S`
- [x] B2.2 Port the `Exchange` interface from MPX `types.ts`, then extend it `M`:
  - `placeOrder` (market/limit/stop, tif, reduceOnly)
  - `cancelOrder`
  - `getOrder`
  - `getOpenOrders`
  - `setLeverage`
  - `setMarginMode`
  - `closePosition`
  - `streamOrders`
  - `streamPositions`
- [x] B2.3 Port the Delta adapter (REST HMAC signing, products cache, tickers, wallet, positions, fills, market order) `M`
- [x] B2.4 Port the Delta WS (auth → subscribe after auth, heartbeat, 25s ping, 40s idle → reconnect) `M`
- [ ] B2.5 Add to Delta: limit orders, stop orders, cancel, order status, leverage, open orders, the `orders`/`positions` WS channels `M` (REST parts done 31 Oct; `orders`/`positions` WS channels left)
- [x] B2.6 Environment explicit and **required**: `DELTA_ENV=testnet|live`, no silent prod default. Fail fast on startup `S`
- [x] B2.7 Use our `lib/secrets.ts` for keys (move the shared crypto into a package if the engine needs it). No second vault `S`
- [x] B2.8 Key fingerprint (HMAC) for duplicate detection, without decrypting stored keys `S`
- [x] B2.9 Error taxonomy: `ExchangeAuthError`, `ExchangeRateLimitError`, `ExchangeRequestError`, `InsufficientMarginError`, `InstrumentError` `S`
- [x] B2.10 Rate limiter per exchange + key (token bucket; reuse `lib/market` token-bucket if it fits) `S`
- [x] B2.11 Unit tests: signing (known vectors), size rounding (0.997 → 1 regression from MPX), instrument mapping, error mapping `M`
- [ ] B2.12 Contract test against Delta testnet behind an env flag (verify → account → products → place tiny order → cancel) `M` (written: `pnpm --filter @tradinjournal/exchange test:testnet`; waiting on testnet keys)
- [x] B2.13 Exchange registry for the UI: status live/beta/soon, required permissions, whitelist IPs, how-to video URL, partner sign-up URL `S`

## B3. API: exchange connections (`apps/api/src/modules/exchanges/`)
- [x] B3.1 Routes `M`:
  - `GET /api/exchanges/catalog`
  - `GET /api/exchanges`
  - `POST /api/exchanges` (connect)
  - `POST /api/exchanges/:id/test`
  - `PATCH /api/exchanges/:id` (label)
  - `DELETE /api/exchanges/:id`
  - `GET /api/exchanges/:id/equity`
- [x] B3.2 Connect flow, in order `M`:
  1. validate shapes per exchange
  2. fingerprint dedup
  3. `verify`
  4. **refuse if withdraw permission is detected** (where the API exposes it)
  5. accountRef dedup
  6. encrypt
  7. save
- [x] B3.3 Max 8 connections per user (MP/CM parity) `S`
- [x] B3.4 Delete is blocked while the connection is a leader or has active follows/deployments; the error message says why `S`
- [x] B3.5 zod validation, `requireAuth`, `requireSameOrigin` applies, rate limit on connect/test `S`
- [x] B3.6 Never return key material; return `keyLast4` only `S`
- [x] B3.7 Audit-log connect/disconnect `S`
- [x] B3.8 Tests: auth gates, IDOR (another user's connection gives 404), dedup, delete-guard `M`
- [x] B3.9 Add the new routes to the access-control matrix test (scratchpad `gate/matrix.mjs` → move into the repo as a test) `S`

## B4. Engine service (`apps/engine`)
- [ ] B4.1 Scaffold `apps/engine` (tsx start, logger, config via `@tradinjournal/config`, graceful shutdown) `S`
- [ ] B4.2 Kill switch read from `SystemSetting` (2s cache), honoured before every order `S`
- [ ] B4.3 Health endpoint/heartbeat log; Railway service definition documented in `DEPLOY.md` `S`
- [ ] B4.4 Decide whether the engine shares Redis with the worker/queue (look at `packages/queue`) `S`

## B5. Web: exchange connections UI
- [ ] B5.1 `/exchanges` page (or a tab inside `/brokers`; decide by IA review): catalogue with live/beta/soon, "N connected" `M`
- [ ] B5.2 Connect wizard in a Sheet `M`:
  1. pick exchange
  2. key + secret (+ passphrase for OKX) with paste buttons
  3. verify
  - required-permissions checklist
  - whitelist IPs with copy
  - how-to video
  - partner sign-up link
  - custody notice
- [ ] B5.3 Connection card: health dot, equity, last checked, Test / Rename / Remove (typed confirm) `S`
- [ ] B5.4 Empty state with the A5.3 art, and an explanation of what keys can and can't do `S`
- [ ] B5.5 Account switcher shows MT5 accounts and exchange connections, grouped `S`

---

# PART C — Copy trading (Phase 1)

## C1. Engine: copy pipeline (port MPX + fix its gaps)
- [ ] C1.1 Leader watchers: one WS per VERIFIED leader with ≥1 ACTIVE follow; sync every 5s; reconnect after 1.5s; back off 10s after a hard failure `M`
- [ ] C1.2 On auth error: mark the connection INVALID, pause its follows, notify the leader and the followers `S`
- [ ] C1.3 Backfill after (re)connect via `getRecentFills(50)`. **Log errors; don't swallow them** (MPX gap) `S`
- [ ] C1.4 `LeaderFill` upsert with P2002 race recovery `S`
- [ ] C1.5 Halt check (kill switch / leader not VERIFIED) writes SKIPPED orders with a reason, so a fill is never executed late `S`
- [ ] C1.6 Copy-from-now guard (`follow.startedAt > fill.ts` → skip). Use UTC everywhere `S`
- [ ] C1.7 Dedup on `clientOrderId = tl:{exch}:{followId}:{fillId}` `S`
- [ ] C1.8 Sizing modes: proportional / fixed margin / multiplier, plus max position USD and reverse copy. Port `sizing.ts` with its 10 tests `S`
- [ ] C1.9 **Real daily loss limit**: today's realised + unrealised P&L per follow (timezone = the user's), auto-pause + notify (MPX gap: it summed all-time) `M`
- [ ] C1.10 Max profit cap per follow (take-profit for the subscription). Evidence: MP code `S`
- [ ] C1.11 "Copy current open trades" option at subscribe time (open a matching position at market). Evidence: MP code `M`
- [ ] C1.12 Place the order, then **poll SUBMITTED orders until terminal** (MPX gap) `M`
- [ ] C1.13 Record `leaderPrice`, our fill price and `slippageBps` per copy `S`
- [ ] C1.14 Positions: port `position.ts` `applyFill` with its 8 tests `S`
- [ ] C1.15 **Reconcile our positions against the exchange's `getPositions`** every N minutes; flag drift (MPX gap) `M`
- [ ] C1.16 Mark-to-market from public mark prices every 30s `S`
- [ ] C1.17 Leader equity snapshots + `curveStats` (ROI, max DD) per 7d/30d/all; port `stats.ts` with its 4 tests `S`
- [ ] C1.18 Retry missed copies (24h sweep) `S`
- [ ] C1.19 Pause semantics: no new entries, exits still copied. Stop: optionally close the position first. Evidence: CM code `M`
- [ ] C1.20 Exits when the leader closes: reduce-only orders sized to the follower position, not the leader's qty `S`
- [ ] C1.21 Engine metrics: copies/min, median latency fill→order, rejects by reason (for admin) `S`
- [ ] C1.22 Integration test on Delta testnet: leader BUY → follower FILLED → leader SELL → follower flat, realised P&L matches `M`

## C2. Leader data and grading (better than MP)
- [ ] C2.1 Leader stats per window: P&L, ROI, max DD, win rate, Sharpe, trades, followers, days active (MP "DSL" explained in plain words) `M`
- [ ] C2.2 **Risk grade A–E** from max DD, volatility and leverage used; document the formula on the page `M`
- [ ] C2.3 **Consistency score** (share of profitable weeks) and "% of profit from top 3 trades" `S`
- [ ] C2.4 Recommended margin calculation (minimum capital to copy 1× without rounding to 0 contracts) `S`
- [ ] C2.5 Leader stats cached (Redis) and recomputed by the engine reconcile loop `S`

## C3. API: leaders and follows
- [ ] C3.1 Leader routes `M`:
  - `GET /api/leaders` (sort: profit, ROI, max DD, Sharpe, recommended margin, risk grade; range 1D/1W/1M/1Y/All)
  - `GET /api/leaders/:id`
  - `GET /api/leaders/:id/trades`
  - `GET /api/leaders/:id/equity`
- [ ] C3.2 `POST /api/leaders/apply` (connection + display name + strategy write-up), creates PENDING + notifies admins `S`
- [ ] C3.3 Follow routes `M`:
  - `GET /api/follows`
  - `POST /api/follows` (sizing, invested amount, daily loss cap, max profit cap, copy open trades, risk disclosure accepted)
  - `PATCH /api/follows/:id` (pause/resume/stop, edit multiplier/caps)
- [ ] C3.4 SSE `GET /api/follows/stream` and `/:id/stream`; push events from the engine (Redis pub/sub) instead of MPX's 3s DB polling `M`
- [ ] C3.5 Guards: a follower must have a connection on the leader's exchange (MP "connect the required exchange"); can't follow yourself; re-follow resets `startedAt` `S`
- [ ] C3.6 Risk-disclosure acceptance stored with timestamp + version `S`
- [ ] C3.7 Tests: auth, IDOR, validation, guard cases `M`

## C4. Web: copy trading
- [ ] C4.1 `/leaders` leaderboard `M`:
  - cards: avatar, exchange, followers, P&L, ROI, sparkline, recommended margin, max DD, win-rate bar, days active, risk grade
  - sort and range controls
  - search
- [ ] C4.2 Leaderboard top-3 podium + compare mode (up to 3 leaders side by side). Evidence: MPX `M`
- [ ] C4.3 Leader detail `L → split`:
  - [ ] C4.3a Header (avatar, exchange, followers, range) + KPIs (live P&L, followers, open trades) `S`
  - [ ] C4.3b Shared analytics stack (equity chart, P&L heatmap, allocation donut, stats grid, ROI card, holding time) as **one component reused from the dashboard** `M`
  - [ ] C4.3c Strategy write-up section `S`
  - [ ] C4.3d Leader trade history (open/closed, date-grouped) `S`
  - [ ] C4.3e Mirror box: recommended margin + multiplier stepper + live capital maths + CTA `S`
  - [ ] C4.3f **"What if you'd copied since X with $Y"** simulation (works before connecting) `M`
- [ ] C4.4 Follow sheet `M`:
  - sizing mode, amount, multiplier
  - daily loss cap, max profit cap
  - copy-open-trades toggle
  - mandatory risk disclosure (MP wording points: late/partial fills, outages, liquidation)
  - accept → "You're now copying"
- [ ] C4.5 My follows (on the dashboard + its own page): status pill, invested, P&L, edit multiplier, pause/resume/stop with honest state copy `M`
- [ ] C4.6 Follow detail: live SSE updates, copied orders with **leader price vs your fill + slippage**, overall tracking error `M`
- [ ] C4.7 Become-a-leader page (apply form + status) `S`
- [ ] C4.8 Leader portal tab: followers count, AUM, consolidated follower P&L (MP has this in a separate app; ours is a tab) `M`
- [ ] C4.9 FAQ section on `/leaders` (what is a leader, how copying works, can I stop anytime, choosing a leader, no guaranteed profits) `S`
- [ ] C4.10 Empty/not-connected states that still let users browse everything (beats MP's blank screens) `S`

## C5. Admin: copy trading
- [ ] C5.1 Admin › Leaders: list PENDING/VERIFIED/PAUSED/DELISTED, approve/pause/delist, notifies the leader `M`
- [ ] C5.2 Kill switch control with confirmation and audit log `S`
- [ ] C5.3 Admin › user dossier: their connections (status only), follows, "stop copying" action `S`
- [ ] C5.4 Engine health panel (watchers up, last fill, latency, rejects) `M`

## C6. Notifications for trading events
- [ ] C6.1 Event types `S`:
  - signal received
  - order placed
  - order filled
  - **order skipped (with reason)**
  - rejected
  - square-off all
  - daily loss cap hit
  - leader paused/delisted
  - connection invalid
  - admin broadcast
- [ ] C6.2 **Telegram** channel: bot, link account via `/start <code>`, per-type toggles. Evidence: MP code `M`
- [ ] C6.3 Email channel for trading events (Resend, via the existing `lib/email`) `S`
- [ ] C6.4 Push via the existing push stack `S`
- [ ] C6.5 Inbox with channels and counts (Trade fills / Risk / AI / System / Reports / News); empty channels dimmed; Unread/Archived; mark all read; sound toggle. Evidence: CM seen `M`
- [ ] C6.6 Per-type, per-channel preferences page `S`

---

# PART D — Trading desk (Phase 2)
- [ ] D1 Positions page tabs: Open / Closed / Pending / Rejected, with counts. Evidence: MP seen `M`
- [ ] D2 Filters: symbol, side, source, dates; search by order/trade ID; CSV export `S`
- [ ] D3 Close position (market) with confirm `S`
- [ ] D4 Partial close (qty/lots, rounding explained) `S`
- [ ] D5 Edit SL / TP on an open position (exchange-native orders where supported) `M`
- [ ] D6 Trailing stop (arm at +X, trail distance) `M`
- [ ] D7 Bulk select + close selected `S`
- [ ] D8 Square off all (typed confirm) `S`
- [ ] D9 Trade details sheet: type, entry, mark, time, order ID, trade ID, copy buttons `S`
- [ ] D10 Quick-trade floating button `M`:
  1. symbol
  2. side
  3. size (qty / USD / risk %)
  4. leverage
  5. review
  6. confirm
  - instrument-spec checks (lot/tick)
  - clear outcomes: credential / position locked / rejected / unconfirmed
- [ ] D11 Order ticket (market/limit/stop, tif, reduce-only, TP/SL) used by quick trade and the chart `M`
- [ ] D12 Manual-orders log: what we sent and what the exchange replied; KPIs (placed, filled, rejected, in flight, notional). Evidence: CM seen `M`
- [ ] D13 Set leverage and margin mode per symbol `S`
- [ ] D14 TradingView webhook bot `M`:
  - per-user secret + regenerate (warning)
  - webhook URL
  - message templates per exchange
  - idempotency
  - IP allowlist of TradingView senders
  - docs page
- [ ] D15 Webhook request log (received / validated / order result) `S`
- [ ] D16 Personal API key (create/regenerate/revoke) + docs (later, after D14) `M`
- [ ] D17 Journal integration: every exchange fill becomes a journal-able trade (notes, tags, emotions, screenshots, replay). **Our moat** `M`
- [ ] D18 Exchange trade history import (fills since connect, plus a backfill window) into our analytics like MT5 deals `M`

---

# PART E — Analytics engine (Phase 3)
- [ ] E1 Shared indicator engine in `packages/core` with typed params, min/max, a "comparable" flag, and unit tests per indicator. Covers the full CM catalogue of 52, in batches below `L → split`:
  - [ ] E1a Trend: EMA, SMA, WMA, VWMA, Hull, DEMA, TEMA `M`
  - [ ] E1b Trend: MACD, MACD hist, ADX, Supertrend, PSAR, Donchian U/L `M`
  - [ ] E1c Ichimoku (Tenkan, Kijun, Span A/B, Chikou) `S`
  - [ ] E1d Oscillators: RSI, Stoch RSI, CCI, Williams %R, MFI, ROC, Momentum, Stoch %K/%D, Awesome, Ultimate `M`
  - [ ] E1e Volatility: ATR, BB width/upper/middle/lower, Keltner U/L, StdDev `M`
  - [ ] E1f Volume: Volume, Volume SMA, VWAP, OBV, CMF, A/D `M`
  - [ ] E1g Meta: funding rate, open interest (from Binance/Bybit/Delta public data) `M`
  - [ ] E1h Price refs: O/H/L/C, highest high N, lowest low N `S`
- [ ] E2 Candle types: Heikin-Ashi, Renko (box %/ATR/fixed), Kagi, Point & Figure `M`
- [ ] E3 Indicator alerts `M`:
  - extend `PriceAlert` → `Alert`: kind price/indicator/change24h/funding/OI
  - operators < ≤ > ≥ = crosses above/below
  - cooldown seconds
  - evaluate on bar close
  - delivery in-app/email/push/Telegram
  - Evidence: CM seen
- [ ] E4 Alert rules UI: list, recent firings, create sheet with symbol search over the full universe `M`
- [ ] E5 Screener `M`:
  - quick screens (oversold, overbought, gainers, losers, high volume, ±funding, momentum)
  - AND conditions
  - table/cards
  - **saved screens**
  - export
  - row "Trade" button
- [ ] E6 Scanner folded into the screener (OR groups, `between`) `S`
- [ ] E7 Signals table: composite rating on 1h/4h/1d (Strong Buy → Strong Sell) with components shown; reuse SignalX where possible `M`
- [ ] E8 Chart-pattern detection (S/R, range, double top/bottom, channels, triangles, flags, wedges), drawn on candles `L → split by pattern family`
- [ ] E9 Pattern explanations via Claude ("what it is / why it matters / where it's wrong / measured move") `S`
- [ ] E10 Market overview `M`:
  - breadth, gainers/losers, volume heatmap, sectors, bubble map
  - Fear & Greed (source TBD, research), altcoin season
  - covers forex/indices too
- [ ] E11 Market insights `M`:
  - OI change, funding, long/short ratio, liquidations
  - biggest squeezes
  - "since last scan" deltas
- [ ] E12 Symbol deep-dive stats on `/charts` `M`:
  - returns 7D/30D/90D/YTD
  - realised vol, max DD 90D
  - beta/corr vs BTC
  - liquidity, up-day ratio
  - next funding countdown
- [ ] E13 Compare up to 6 symbols (% overlay, relative-strength table, CSV) `S`
- [ ] E14 Correlation matrix (top 16) + sector rotation `S`
- [ ] E15 Weekly AI market brief next to the personal weekly review `S`
- [ ] E16 News sentiment tags via Claude + filter `S`
- [ ] E17 Derivatives page: funding ranking, OI leaderboard, predicted vs current funding `M`

---

# PART F — Strategy builder, backtest, deploy (Phase 4)
- [ ] F1 Strategy spec v2 (typed JSON schema) that supersedes Trader Master's 5 `StrategyRuleKind`s; migrate the existing `TraderStrategy` rows `M`
- [ ] F2 Market zone `M`:
  - instrument (perps/options)
  - exchange
  - multi-coin with per-coin overrides
  - direction
  - margin mode
  - leverage with an over-leverage check
- [ ] F3 Session: interval 1m–1D, 24/7 or timezone + entry windows (incl. London/NY/Tokyo forex sessions); exits always run `S`
- [ ] F4 Signal zone: entry trigger (indicator/time), conditions `[ind(params)] [op] [value|ind|price]`, "N bars ago", per-condition timeframe, groups ALL/ANY, short mirrored or separate, exit on signal / on reversal `L → split`
- [ ] F5 Risk zone `M`:
  - TP % / pts / price / R:R
  - SL % / ATR / pts / price
  - trailing stop
  - time stop
  - partial exits with break-even move
  - live safety (a stop is required for live)
- [ ] F6 Sizing: risk % from stop, % equity, lots, qty, ATR, Kelly fraction; shows estimated margin and max loss `M`
- [ ] F7 Advanced: limit-entry offset + expiry bars, pullback entry, re-entry rules, max trades/day, OCO `M`
- [ ] F8 Limits: daily loss cap → auto-pause; N consecutive losses → kill switch `S`
- [ ] F9 **Plain-English read-back**, live `S`
- [ ] F10 Validation split: "blocks deploy" vs "worth knowing" `S`
- [ ] F11 Three layouts: Cockpit (all at once), Flow (step by step), Chart (draw on chart, drag thresholds) `L → split per layout`
- [ ] F12 Backtest engine v2 `L → split`:
  - multi-symbol
  - fee models per venue
  - slippage bps
  - deterministic cache
  - metrics: return, CAGR, win rate, PF, max DD, Sharpe, Sortino, trades, avg slippage, fees
- [ ] F13 **Auto-backtest on edit (debounced) + pinned baseline comparison** `M`
- [ ] F14 Backtest page: saved strategy, dates, capital, fee model, slippage; run history with full stats `M`
- [ ] F15 Paper deployments (generalise `TraderPaperPosition` / `/trader/paper/tick`) with live P&L `M`
- [ ] F16 Live deployments through the engine: start/pause/resume/stop/settle/emergency close; honest state copy `L → split`
- [ ] F17 Deployment list: tabs All/Live/Paused/Errored/Stopped/Archived, sparklines, inline trades, size multiplier `M`
- [ ] F18 Strategy activity feed (each evaluation, why it did or didn't enter) + last evaluation `M`
- [ ] F19 Strategy version history; rule edits don't touch open trades `S`
- [ ] F20 My strategies page: stat strip (closed P&L 30D, open P&L, trades, best, worst, AI strategies), filters (All/Live/Paused/Draft/AI/Marketplace/Archived), sort `M`
- [ ] F21 **AI strategy generator** (text + symbol + TF → spec → quick backtest → open in builder) on Claude; live, not "coming soon" `M`
- [ ] F22 Paper/Live toggle on the dashboard and reports `S`
- [ ] F23 Reports & P&L page: KPIs, equity, drawdown, distribution, per-pair attribution; **PDF export** `M`

---

# PART G — Options (Phase 5)
- [ ] G1 Research: Delta options API (chain, Greeks, order book, WS); which other venues list options (Bybit, Binance, OKX, Deribit) `M`
- [ ] G2 Option chain: calls | strike | puts; expiry carousel; account + underlying selectors `M`
- [ ] G3 Column settings: 16 columns incl. Greeks, show/hide, drag reorder, reset (MP parity) `M`
- [ ] G4 Contract panel: 24h change, price, index, mark IV, volume, Greeks strip, order book `M`
- [ ] G5 Options overview: expected move, gamma centre, 25Δ risk reversal, term slope, OI/IV by strike and by expiry `M`
- [ ] G6 Multi-leg builder `M`:
  - add leg / future
  - templates: Popular/Bullish/Bearish/Neutral/Hedging
  - presets: straddle, strangle, spreads, iron condor, butterfly
- [ ] G7 Payoff chart with target-price slider and expiry date; max profit/loss, R:R, breakevens, margin `M`
- [ ] G8 Analysis panel: premium at risk, delta-weighted OI, fillability, decay efficiency, rich/cheap, GEX, distance to breakeven `M`
- [ ] G9 Contract charts: candles, IV, OI, multi-strike OI, rolling ATM straddle, strangle premium `M`
- [ ] G10 **Expiry replay simulator**: scrubber, play, speeds, melt to expiry, paper legs, ±1σ band (pairs with our chart replay) `L → split`
- [ ] G11 Options order placement (multi-leg basket) via the engine; needs execution `M`

---

# PART H — Marketplace, account, AI, platform (Phase 6)
- [ ] H1 Strategy templates marketplace: browse (category, risk, sort), detail (rules private, **verified performance**), subscribe & deploy `M`
- [ ] H2 Creator programme: apply, publish templates with tunable params and an exchange allowlist; pricing fields hidden while everything is free `M`
- [ ] H3 Subscriptions page: pause / adjust sizing / cancel `S`
- [ ] H4 Sessions & devices page: list (UA/IP/started/expires), revoke, sign out everywhere else (better-auth) `S`
- [ ] H5 TOTP 2FA (better-auth plugin), recovery codes `M`
- [ ] H6 Delete account with email OTP, plus data export `M`
- [ ] H7 Activity log (sign-ins, connections, follows, orders) `S`
- [ ] H8 Profile: timezone (IANA), phone (optional) `S`
- [ ] H9 Guided product tour (dashboard, builder, leaders, AI, analytics); dismissible, state saved `M`
- [ ] H10 Help page: email, WhatsApp, docs, report a bug, feedback box ("a person reads every one") `S`
- [ ] H11 AI chat context chips (open positions, fills 7d, live strategies, follows) + tools (generate strategy, explain pattern, tune strategy with confirm) `M`
- [ ] H12 AI watcher merged into alerts (rule catalogue + plain-English explanations) `M`
- [ ] H13 In-app docs (English; Hindi later) `M`
- [ ] H14 PWA install + biometric unlock research (WebAuthn passkeys) `M`
- [ ] H15 Plans/limits infrastructure (entitlements middleware), **all free for now**, so turning plans on later is config only `M`

---

# PART Z — Cross-cutting (every phase)
- [ ] Z1 Access-control matrix test covers every new route (anon / user / other user / admin) `M`
- [ ] Z2 Rate limits on every write route that touches an exchange `S`
- [ ] Z3 Audit log for every trading-affecting action `S`
- [ ] Z4 Secrets: exchange keys only in the engine/API memory; never logged; error messages scrubbed `S`
- [ ] Z5 Postman collection for each new module (repo `apps/api/postman/`), run via `postman` CLI `M`
- [ ] Z6 Docs: `DEPLOY.md` for the engine service + new env vars (names only) `S`
- [ ] Z7 Railway: engine service, static egress IP decision (B0.9), env vars; **user does the push** `S`
- [ ] Z8 Production migrations per phase: migrate status → SQL review → user OK → `migrate deploy` → verify row counts `S` (each)
- [x] Z9 ~~SEBI/legal opinion~~ Not pursued (Ayush, 31 Oct 2026). Live stays behind `EXCHANGE_LIVE_ENABLED`, switched on by Ayush only `S`
- [ ] Z10 Load test: 100 followers × 1 leader fill; fan-out latency < 1s on testnet `M`
- [ ] Z11 Update the Google Sheet tracker after each work session `S`

---

## A0. Cross-cutting cleanup (from `reports/ui-audit.md` §1; do alongside A1–A3)

**Decisions to confirm with the user before building** (screenshots, no assumptions):
- [x] A0.D1 **Decided 29 Oct: MERGE** `/journal` (Chart replay) + `/notebook` (Journal) into one **Journal** page (per-trade review + replay + free-form notes, one place for emotions/tags). Old routes redirect. Nav names. Today `/journal` = "Chart replay" and `/notebook` = "Journal". Proposal: `/journal` → **"Trade review"** (per-trade replay + notes), `/notebook` → **"Notebook"** (free-form daily log). Or merge the two pages (both capture emotions). User picks `S`
- [x] A0.D2 **Decided: "SignalX" everywhere.** SignalX naming. It is also called "TradeAI signals" (macro side-nav) and "Signals tab" (paper blotter). One name everywhere `S`
- [x] A0.D3 **Decided: go with the proposal (user delegated).** Dashboard content. Proposal: keep the hero P&L + 4 key stats, one AI card (merged), month calendar, recent trades; move instruments, hour and day charts to Analytics. User approves the mock `S`
- [x] A0.D4 **Decided: yes (user delegated).** Analytics owns the deep charts; trades and calendar stop repeating KPI strips. User approves `S`
- [x] A0.D5 **Decided 30 Oct: landing = iteration A (Obsidian Bento) with more detailed drawings; build it first. App theme = dark default + light toggle (tokens in `design/dashboard-v6`). Dashboard mock v6 rejected: redo closer to the user's "Hello, Aditya" reference.** Landing serif-italic: keep one word in the hero, or none `S`

**CSS architecture:**
- [ ] A0.1 Stop importing `app-v3.css` + `app-v5-auto.css` + `app-v5.css` stacked in `components/app-shell.tsx:18-20`. Replace with `tokens.css` + `components.css` once pages are migrated (the order is a blocker for A3.11) `M`
- [ ] A0.2 Remove the old "Obsidian" tokens in `app/globals.css` (radius 10, `--color-profit #2EE58A`, `--color-warning`), or map them to v6 tokens so Tailwind users (admin, macro, bell) inherit the new system `M`
- [ ] A0.3 One green: replace `#2EE58A`, `#7DF2B6`, `#19C37D` with `--green` `#08C465` (one tint allowed for fills) `S`
- [ ] A0.4 One red: replace `#FF6A62` with `--red` `#FE3A31` (one tint allowed) `S`
- [ ] A0.5 **Remove amber everywhere** `M`:
  - [ ] `--amber`, `--color-warning`, `.v3-pill.a`
  - [ ] 45% win-rate chip
  - [ ] SignalX "Open" chip
  - [ ] `/access/inactive` card
  - [ ] macro "Key tension" / MEDIUM chips
  - [ ] calendar impact dots, watch stars, "M" filter
  - [ ] landing "Timing" bar
  - [ ] `notification-bell.tsx:32` `border-warning`
  - [ ] news ticker tiles
  - Neutral or red (risk) instead
- [ ] A0.6 **Remove violet** `S`:
  - [ ] `#6E4BFF` fallbacks in `v3/analytics-parts.tsx:131,134` and `v3/trade-candles.tsx:115` (plus `--tc-zone`, `--tc-grid`)
  - [ ] `v3/partner-parts.tsx:25`
  - [ ] `tone:'purple'|'blue'` in `macro/regime-narrative.tsx:45-50` and its CSS mask `app-v5.css:574`
  - [ ] `.v3-pill.v` usage (`settings/settings-aside.tsx:21`)
  - [ ] `StatusCard tone="v"` (`app/maintenance/page.tsx:20`)
- [ ] A0.7 One **dark** tooltip/popover style. Replace white `.a-tip`, `.pt-toast` (`app-v5.css:576`), the white chart value pills and the candle `.tc-pill.x` `S`
- [ ] A0.8 Kill decorative glows, radial dot-grid hero cards (`.mr`, `.br-hero`, `.st-priv`) and card gradients + rings (`--surface` gradient) `M`
- [ ] A0.9 Normalise radii to tokens (24/16/12/999); the audit counted 21 values in `app-v3.css` `M`
- [ ] A0.10 Remove the 58 `!important`s as files are rewritten (track count → 0) `M`
- [ ] A0.11 Replace inline `style={{…}}` in `app-shell.tsx:147-171` and the other ~70 spots with classes `M`
- [ ] A0.12 Delete dead components after a final import check `S`:
  - `browser-frame`, `dashboard-calendar`, `drawdown-chart`, `equity-chart`, `floating-card`, `insights-strip`, `reveal`, `reveal-group`, `rolling-chart`, `scatter-chart`, `screenshot-frame`, `terminal-cta-button`, `watermark-number`, `landing/product-mocks`
  - `empty-state` is **replaced** by A2.19
- [ ] A0.13 Remove the `AppShell` `theme?: 'v5'|'v3'` prop and the v3 code path (`app-shell.tsx:37,97`) `S`

**Typography:**
- [ ] A0.14 Fonts: remove the unused Inter next/font load (`app/layout.tsx:2,14`); fix the `globals.css:22` comment `S`
- [ ] A0.15 Satoshi `S`:
  - only use loaded weights 400/500
  - replace `font-black` (42 uses) and 600/700 with 500
  - if a weight is needed, load it explicitly; no synthesised weights
- [ ] A0.16 JetBrains Mono: 400/500 only; remove 700 usage (journal 81, trades 53, coach 9, macro 8) `S`
- [ ] A0.17 Remove the serif-italic accent word from every app H1 (`.v3-h1 em` `app-v3.css:209`, `.mr h2 em`, `.br-hero h1 em` `app-v5.css:573`, per-page `<em>`) `S`
- [ ] A0.18 Remove the faux-italic green/red accent on auth/status/legal pages ("back.", "account.", "password?", "inbox.", "policy.", "missing a token.", calendar "2026") `S`
- [ ] A0.19 Mono rule: **numbers mono everywhere, labels never mono** `M`
  - money must be mono on trade detail, journal, calendar, brokers totals, macro rows, analytics KPIs
  - dates, headers, eyebrows go sans
- [ ] A0.20 Sentence case instead of uppercase letter-spaced labels `S`:
  - table heads
  - admin tabs + REFRESH
  - macro BULLISH/BEARISH/NEUTRAL chips
  - Fed tiles
  - disclaimers
  - landing eyebrows
  - `//` code-comment eyebrows

**Icons:**
- [ ] A0.21 Replace emoji/unicode icons with the line-icon set (`components/v3/icons.tsx`) `M`:
  - 🔔📰📅 + flags (`notification-bell.tsx:34`)
  - 🔒 CSS content (`app-v3.css:1886`)
  - ⚡ Analyze (`trader/trader-master.tsx:135`)
  - ✦ Brief (`news/news-feed.tsx:353,369`)
  - macro glyphs (`lib/macro-meta.ts:37-46`)
  - Georgia "ƒx" (`app-v3.css:1079`)
  - calendar-rail flag emoji (country code chips instead)
- [ ] A0.22 One `SymbolMark` `S`:
  - real ticker abbreviations (NAS100 → "NAS", US30 → "US30", USDJPY → "UJ" or a flag pair)
  - replaces initials circles, S/L tiles, amber ticker tiles and broker tiles
- [ ] A0.23 One `SideChip` for long/short (sentence case "Long"/"Short", green/red text on a graphite chip). Replaces the 5 current styles incl. BUY/SELL on raw deals `S`

**Charts:**
- [ ] A0.24 Shared chart theme (A2.26) applied to all 7 implementations `L → split`:
  - `dashboard-parts` equity/hour/day
  - `analytics-parts` area/rolling/scatter/heatmap
  - `year-heatmap`
  - `trade-candles` + `replay/trade-chart`
  - klinecharts
  - TradingView embed
  - macro sparklines/yield curve
- [ ] A0.25 Every bar/line chart gets a y-axis (or value labels) + light gridlines; x labels attached to the plot `M`
- [ ] A0.26 Drawdown series always red `S`
- [ ] A0.27 Candle colours: brand green/red everywhere incl. klinecharts + TradingView overrides `S`

**States:**
- [ ] A0.28 One `EmptyState` used everywhere. Replace the six ad-hoc versions (analytics dashed boxes, notebook, paper blotter, dashboard text, brokers dashed card, admin red bar) `M`
- [ ] A0.29 Zero-data rule: when there's no data, show the EmptyState instead of "+$0.00 ▲0.00%" or rows of "—" `S`
- [x] A0.30 Mobile chip rows: edge fade + scroll snap, so chips never cut mid-word unannounced `S`
- [ ] A0.31 Mobile: no orphan full-width KPI tile (use even counts or a 2-col span rule) `S`
- [x] A0.32 Mock mode completeness: add `/data/admin/*` mocks (`lib/admin-api.ts:191-210`) and a maintenance mock, so every page can be reviewed `S`

## A4. Pages (from `reports/ui-audit.md` §3; H = high, M = medium, L = low severity)

### A4.1 `/dashboard`: `app/dashboard/page.tsx`, `components/v3/dashboard-parts.tsx`, `components/ai-report-card.tsx`
- [x] H: cut to the approved layout (A0.D3); 11 cards today `M` — v6 dashboard: greeting + weekly review, this week, your edge, performance, coach review
- [x] H: merge the three AI surfaces (Your review + What your trades say + Coach review) into one card. Make sure they can't contradict each other (one source of truth for "weakest day") `M` — one Coach review card; the week note uses the rule-based insight
- [x] H: Drawdown tab line + fill red `S` — tab removed; the equity screen turns red when the range is down
- [x] H: P&L by day: labels attached to the bars, y-axis; or move it to Analytics per A0.D3 `S` — moved off the dashboard (A0.D3)
- [x] M: remove serif "really"; "One thing to fix" box → a plain sentence inside the AI card `S`
- [x] M: topbar: range control + sync line + one action (A3.4); fix the disabled "Add broker" look `S`
- [x] M: KPI tiles → `Stat` × 4 (no split bar on avg win/loss; show R:R as text) `S` — performance strip: profit factor, expectancy, max drawdown
- [ ] M: hero card: one tab style (Segmented, white active), dark tooltip, no "Start $25,000" overlap `S`
- [ ] M: month calendar: Monday start (match /calendar after A4.5), readable amounts ≥ 12px, tint only (no coloured borders) `S`
- [x] M: recent trades: `SymbolMark`, `SideChip`, sentence-case head, P&L padding on mobile `S` — latest 3 trades with side, hold time, P&L; links to the trade
- [x] M: behaviour card simplified (one ring or one bar, no W/L soup), or moved to Analytics `S` — moved off the dashboard
- [ ] M: empty dashboard:
  - greeting for new users
  - no "+$0.00 ▲"
  - EmptyState with Connect/Sync CTA
  - `S`
- [ ] M: notifications popover:
  - line icons
  - mark all read
  - footer link to inbox
  - badge stays while open
  - `S`
- [x] M: account menu pushes nav down (or becomes the top-bar AccountPill per A3.3); one "Add broker" state `S` — account pill in the top bar
- [ ] L: ⌘K list fade at the bottom, group header once `S`
- [ ] L: mobile KPI orphan (A0.31) `S`

### A4.2 `/trades`: `app/trades/page.tsx`, `components/deals-table.tsx`
- [ ] H: TAG column clipped at 1440. Table fits or scrolls inside with a visible affordance `S`
- [ ] H: one filter row: Segmented (All/Long/Short/Win/Loss) + symbol select + search; Positions/Raw deals as page tabs `M`
- [ ] M: H1 "Trade log" + subline "78 positions · all time" (no serif) `S`
- [ ] M: mono only on numbers; dates sans `S`
- [ ] M: one scroll container (page scroll, sticky header); "Show more" at the page bottom `S`
- [ ] M: one chip per row max (tag chips collapse to "+2") `S`
- [ ] M: remove the summary strip or reduce it to one line (A0.D4) `S`
- [ ] L: sticky filter on mobile `S`

### A4.3 `/trades/[positionId]`: `app/trades/[positionId]/page.tsx`, `components/v3/trade-candles.tsx`
- [ ] H: synthetic candles. Make "Illustrative path, not tick data" prominent, or show real candles from the `Candle` table when available (check coverage) `M`
- [ ] M: net P&L once (header only) `S`
- [ ] M: stat grid → `StatStrip`, mono numbers; commission/swap neutral (they're fees, not losses) `S`
- [ ] M: chart: price axis; entry/exit markers in the shared chart theme (no green zone box) `S`
- [ ] M: executions table: no clipped header ("COMM."); journal empty → EmptyState `S`
- [ ] L: prev/next arrows with labels; drop the duplicate back link `S`

### A4.4 `/analytics`: `app/analytics/page.tsx`, `components/v3/analytics-parts.tsx`, `components/sortable-card.tsx`, `components/year-heatmap.tsx`
- [ ] H: "Psychology edge" / "Setup edge" 450px dashed boxes → compact EmptyState explaining how to fill them (tag trades / journal emotions) `S`
- [ ] H: P&L by day + Hour of day: attached labels, y-axis, bar below baseline fixed `S`
- [ ] M: header: "Analytics" + subline (no eyebrow, no serif) `S`
- [ ] M: drag handles hidden until "Customise layout" mode `S`
- [ ] M: de-duplicate best/worst/avg (KPI strip vs strike-rate vs distribution) `S`
- [ ] M: session × weekday heatmap: readable best cell (text contrast), neutral total column, no outline chips `S`
- [ ] M: instruments table: no amber chip; plain % text coloured by sign `S`
- [ ] M: rolling edge + equity: y-axis; "Peak" as a plain label `S`
- [ ] M: consistency heatmap: only months with data + legend next to it `S`
- [ ] M: scatter: axis labels + more ticks + hover tooltip `S`
- [ ] L: Best/Worst/Most active tiles: no orphan `S`

### A4.5 `/calendar`: `app/calendar/page.tsx`, `components/day-trades-modal.tsx`
- [ ] M: week starts Monday (match the dashboard); make it a user setting later `S`
- [ ] M: day cells: tint only, no coloured border, text neutral with a coloured amount; today = thin white ring `S`
- [ ] M: H1 "October 2026" plain; drop the "Daily P&L" eyebrow `S`
- [ ] M: KPI cells: keep month total + trading days; drop the repeats `S`
- [ ] L: mobile weekly totals row instead of dropping the column `S`
- [ ] L: day modal: SymbolMark, mono numbers only, title one line on mobile ("Fri 23 Oct") `S`

### A4.6 `/charts`: `app/charts/page.tsx`, `components/charts/*`
- [ ] M: panes: no borders; active pane = subtle surface change, not a green border `S`
- [ ] M: klinecharts theme: fonts, axis colours and crosshair from the chart kit `M`
- [ ] M: toolbar split: symbol + timeframe (left), indicators + drawing tools (overflow menu on narrow screens); line icon for indicators `S`
- [ ] M: watchlist/alerts rail: mono only on numbers; "2 active" as plain text `S`
- [ ] L: alert dialog: `NumberStepper` instead of the native spinner `S`
- [ ] L: mobile: time axis not clipped; one chart at a time with a pane switcher `S`

### A4.7 + A4.8 MERGED → one `/journal` page (A0.D1)
- [ ] Merge design: list of trades (left) → selected trade review with replay chart + notes/tags/emotions (right); a "Day notes" mode for free-form entries without a trade `M`
- [ ] Data: confirm both pages write `JournalEntry` (check `tradeId` nullable) so no migration is needed; if not, plan an additive one `S`
- [ ] `/notebook` → permanent redirect to `/journal?view=notes`; update nav, ⌘K, links, emails `S`
- [ ] Nav: one "Journal" item; remove "Chart replay" `S`
- [ ] SignalX: rename "TradeAI signals" (macro side-nav) and "Signals tab" (paper blotter) to SignalX `S`

### A4.7 `/journal` (old Chart replay part): `app/journal/page.tsx`, `components/replay/trade-chart.tsx`
- [ ] H: rename in nav, crumb and title per A0.D1 `S`
- [ ] M: filter chips scroll with fade, never cut "Reviewed 0" `S`
- [ ] M: "Save entry" = standard primary (same as notebook) `S`
- [ ] M: review hero: no green border/fill; P&L shown once `S`
- [ ] M: column heights aligned; positions list taller on mobile (or a list → detail flow on mobile) `M`
- [ ] M: SymbolMark + mono money (match /trades) `S`
- [ ] M: chart: price axis; "Illustrative" made clear; pager labelled `S`
- [ ] L: keyboard-hint contrast ≥ 3:1 `S`

### A4.8 `/notebook` (rename per A0.D1): `app/notebook/page.tsx`
- [ ] M: H1 "Notebook" + subline; crumb fixed `S`
- [ ] M: hide the KPI strip when empty `S`
- [ ] M: Export CSV disabled (with a tooltip) when there are 0 entries `S`
- [ ] M: custom date picker (A2.25); title placeholder not clipped `S`
- [ ] M: emotions captured in one place (decide with A0.D1) `S`
- [ ] L: disabled Save legible `S`

### A4.9 `/markets`: `app/markets/page.tsx`, `components/news/*`, `components/calendar/calendar-rail.tsx`
- [ ] H: one control row: category Segmented/select + symbol filter select + Sources + Brief; "High impact" as a filter option, not a red chip `M`
- [ ] H: news card ≤ 2 chips (sentiment + source/time); relevance bar labelled or removed; no amber ticker tiles (SymbolMark) `M`
- [ ] M: lead thumbnail: real image when available; otherwise no art (not the generic green chart) `S`
- [ ] M: headlines not truncated mid-word; body clamped with "Read more" `S`
- [ ] M: calendar rail:
  - sans times
  - impact as text chip (High/Med/Low, red only for High)
  - no flag emoji (country code)
  - watch star neutral/white
  - A/F/P values labelled
  - `M`
- [ ] M: "Sources · 8" vs "0 selected" state bug `S`
- [ ] L: brief: skeleton while writing `S`
- [ ] L: mobile chip rows (A0.30) `S`

### A4.10 `/macro`: `app/macro/page.tsx`, `components/macro/*`, `lib/macro-meta.ts`
- [ ] H: remove the 15-item second sidebar → tabs row (Overview / Regime / Rates & Fed / Indicators / Calendar / Assistant), decided with the user `M`
- [ ] H: show the 8-asset bias **once** (keep one view; drop the other two) `M`
- [ ] H: Confluence engine view: fix the 500px blank `S`
- [ ] M: chrome: ticker (fix the first item clipped under "Live"), drop the second ⌘K (use the global palette with macro results), meta line as one muted sentence `M`
- [ ] M: no amber chips; regime tones → neutral/green/red `S`
- [ ] M: regime card: no glow, no serif; bias gauge → a single neutral bar with a marker `S`
- [ ] M: indicator groups: line icons; ⓘ per group (not 33 per row); values mono; sparklines in chart theme `M`
- [ ] M: sentence-case chips (Bullish, Upward, Stance: dovish…) `S`
- [ ] M: Fed sub-view: fill the layout or shorten the page; paper blotter EmptyState with an action and the right tab name `S`
- [ ] L: disclaimers: one sentence-case footer line `S`

### A4.11 `/macro/assets/[symbol]`: `app/macro/assets/[symbol]/page.tsx`
- [ ] H: **price mismatch**. Header price (2,387) vs TradingView (≈4,025). Use the same source for both, or label the mock clearly. Check the real (non-mock) path too `M`
- [ ] H: mobile TradingView embed blank (≈800px). Fix sizing or fall back to our own chart `M`
- [ ] M: TradingView theme colours invalid (console errors). Pass hex values, our candle colours, dark theme `S`
- [ ] M: one hero number (price); "Bias score 71/100" not 71% `S`
- [ ] L: duplicate breadcrumb `S`

### A4.12 `/trader` (SignalX): `app/trader/page.tsx`, `components/trader/*`
- [ ] M: "Analyze" = standard primary (no gradient/glow/emoji); "Compile" secondary; no serif "X" `S`
- [ ] M: status chips: Open neutral, Hit = green, Stopped = red (no amber) `S`
- [ ] M: "72%" confidence on every row: check whether this is real or mock; label it if mock `S`
- [ ] M: balance the columns (track record + strategies below on desktop, or tabs) `M`
- [ ] M: strategy card: ≤ 3 chips, one-line rule summary, one action + menu `S`
- [ ] L: mobile rows not truncated `S`

### A4.13 `/coach`: `app/coach/page.tsx`, `components/coach/*`
- [ ] M: page header pattern (title + new chat action); history pane on surface-1, no border `S`
- [ ] M: user bubble graphite (not green); assistant headings weight 500 `S`
- [ ] L: "Preview mode" line only in mock mode (it is already mock-only; confirm) `S`
- [ ] L: "New chat" normal-width button; disabled send state `S`

### A4.14 `/brokers`: `app/brokers/page.tsx`, `components/connect-broker-modal.tsx`, `update-broker-password-modal.tsx`
- [ ] M: hero: no glow/dot grid; H1 "Brokers" + subline `S`
- [ ] M: "Add broker" at the limit → enabled-looking secondary with "Limit reached (2/2)" tooltip, or hidden with an explanation line `S`
- [ ] M: status shown once per row; no green left bar `S`
- [ ] M: "Broker limit reached" card → a plain info line `S`
- [ ] M: connect modal: selects and inputs share one spec (radius, height) `S`
- [ ] L: totals mono; "connected 13 months ago" on one line `S`

### A4.15 `/settings`: `app/settings/page.tsx`, `components/settings/*`, `components/location-form.tsx`
- [ ] M: profile banner: remove the fake equity line; simple avatar + name header `S`
- [ ] M: no nested bordered tiles (use `StatStrip`) `S`
- [ ] M: location form on the shared Form set (A2.14); standard primary `S`
- [ ] M: weekly review in one place; no violet pills `S`
- [ ] M: "Private & read-only": line icon, no glow card `S`
- [ ] L: stepper value/label consistent; one "Sign out" `S`

### A4.16 `/admin`: `app/admin/page.tsx`, `components/admin/*`
- [ ] H: mocks for `/data/admin/*` so it renders in mock mode (A0.32), then re-audit the real UI `S`
- [ ] H: move from Tailwind/globals tokens to the v6 primitives (211 Tailwind usages) `L → split per tab: Overview, Users, Access, System`
- [ ] M: tabs = `Tabs`; Refresh = `IconButton`/secondary, sentence case `S`
- [ ] M: error state = `ErrorState` with retry `S`
- [ ] L: page padding = the standard container `S`

### A4.17 Auth: `/login`, `/signup`, `/forgot`, `/verify` (`components/v3/auth-shell.tsx`)
- [ ] M: primary = white pill (not green glow); no faux italics `S`
- [ ] L: login: one reset link `S`
- [ ] M: signup: left panel art (missing today); move country/city/postal to onboarding (the location gate already exists, `components/location-gate.tsx`) and confirm the API still accepts signup without them `M`
- [ ] L: signup: no mono step markers; smooth disabled → enabled primary `S`
- [ ] L: forgot: one progress style `S`
- [ ] L: verify: "expires in 10 min" once; email shown or "your inbox" phrasing; OTP boxes on surface-2 `S`

### A4.18 Status and legal pages
- [ ] H: `/access/inactive`: no amber; neutral card with a red risk note; one primary + a text link `S`
- [ ] L: `/access/elefin`: standard primary, no faux italic `S`
- [ ] L: `/maintenance`: no violet tone; one paragraph `S`
- [ ] L: `/privacy`, `/terms`: no faux italic; muted section numbers; bullets on mobile; header matches the landing nav `S`
- [ ] L: `/unsubscribe`: no faux italic `S`
- [ ] L: `/news`, `/economic-calendar` redirects: confirm nothing links to them `S`

### A4.19 Landing `/` (in addition to A5)
- [x] M: one serif word max (A0.D5) instead of 17 `S`
- [x] M: Security section white → dark; light mail mock → dark `S`
- [x] M: no amber "Timing" bar `S`
- [x] M: one bar above the hero (not announcement + nav + ticker) `S`
- [ ] M: re-shoot the product images after Part A (the current shot shows the cluttered dashboard) `S`
- [ ] L: fewer glows (`landing.css` has 54 gradients) `S`
- [ ] L: mobile: the "Syncs read-only…" overlap `S`
- [x] L: sentence-case eyebrows; drop the A/B/C/D indices `S`
