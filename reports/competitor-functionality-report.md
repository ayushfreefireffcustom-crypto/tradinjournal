# MirrorPip + Cryptomaty: functionality report for TRADElogs

29 Oct 2026. Researched read-only in your logged-in sessions. Nothing was connected, subscribed, traded, deployed or saved.

How the evidence was gathered:
- Every page was walked live.
- Every API call was logged.
- Both web apps' code was downloaded and reverse-engineered: REA plus static extraction.
  - MirrorPip: a 7.25 MB Flutter bundle, from which 9,267 UI strings and about 48 endpoints were pulled.
  - Cryptomaty: about 130 Next.js chunks, from which about 170 API procedures were pulled.

Evidence tags used below:
- **seen** means observed live.
- **code** means it exists in their shipped code but could not be seen. Usually that's because the screen needs a connected exchange, or because it's marked "coming soon".

Full evidence lives in two files:
- `scratchpad/re/mirrorpip-findings.md`
- `scratchpad/re/cryptomaty-findings.md`

---

## 1. What each product actually is

**MirrorPip: copy trading for crypto.**
- You connect a crypto exchange with API keys: Delta, Shark, Pi42 or Mudrex.
- You pick a "leader" from a marketplace and mirror their trades at a multiplier.
- It also has an options terminal, positions management, watchlists and a TradingView webhook bot.
- It is built in Flutter and drawn on a canvas, so it is slow, has no selectable text and is inaccessible.
- Most screens are blank until you connect an exchange.

**Cryptomaty: no-code algo trading for crypto.**
- You build a rule-based strategy from 52 indicators, backtest it, then run it on paper or live through exchange API keys.
- Around that sit:
  - a big market-analytics suite (13 pages)
  - an options analytics and replay simulator
  - a strategy marketplace with copy trading (copy trading is in code only)
  - alerts
  - an AI layer (chat, strategy generator, watcher), all "coming soon"
  - 4 paid plans billed from a USDT wallet

**TRADElogs today:**
- MT5 trade journal and analytics: dashboard, trade log, trade detail, analytics, calendar, chart replay, journal and notebook.
- Charts, markets/watchlist, macro, news, economic calendar.
- SignalX and the AI coach, both live on Claude.
- Price alerts (above/below only), push notifications, admin.

## 2. The one thing that decides the plan

**Both competitors place real orders. TRADElogs can't today.**

- We connect MT5 with the **investor password**, which is read-only by design.
- Our bridge only has two operations, `/verify` and `/deals`, and both are history reads.

So everything that executes trades needs a new execution path first. That covers copy trading, strategy deployment, quick trade, closing positions, square-off and the TradingView bot.

There are three possible routes. **Which one is your call:**

| Route | What it means | Notes |
|---|---|---|
| **A. Crypto exchanges via API keys** (what both competitors do) | Users paste exchange API keys with trade permission and withdraw permission refused. | **We already have this built in MirrorPip-X:** the Delta India adapter, the AES-GCM key vault, and a copy engine verified end to end on Delta testnet for both entry and close. We'd port it in, not start from zero. |
| **B. MT5 with the master (trading) password** | The bridge gains order-send, modify and close. | Means storing passwords that can trade. Higher security bar, and broker terms vary. The bridge needs new endpoints; I haven't seen the bridge code, so effort is unknown. |
| **C. MT5 copier via an Expert Advisor** | Users run a small EA in their terminal that receives signals. | No trading password held by us. Needs the user's terminal running or a VPS. |

**Legal flag (not legal advice).** In India, copy trading and algo execution for retail may fall under SEBI's algo-trading framework and need broker or exchange empanelment. Paid signal services may need research-analyst registration. MirrorPip and Cryptomaty both show heavy risk disclosures for this reason. Worth a lawyer's 30 minutes before we go live with execution.

Everything that **doesn't** execute trades can be built now on what we have. That covers analytics, journal, alerts, the screener, market and options analytics, the backtester, paper trading, AI, the leader leaderboard with verified stats, plans and security.

---

## 3. Full feature inventory: theirs vs ours

Columns:
- **MP** = MirrorPip; **CM** = Cryptomaty. ✓ = seen live, c = code only.
- **Us** = ✓ have, ◐ partial, ✗ missing.
- **Plan** = what we'd build, including how we'd do it better.
- **Size** = S (≤2 days), M (~1 week), L (several weeks).

### 3.1 Dashboard and performance analytics
| Feature | MP | CM | Us | Plan | Size |
|---|---|---|---|---|---|
| Range chips | 1D–All ✓ | 7D–ALL, YTD ✓ | 1W–All ✓ | Add **custom date range** with presets (yesterday, this/last week, last month/year) | S |
| Hide-balance eye toggle | ✓ | – | ✗ | Add; remember the choice per device | S |
| KPI cards: balance, open positions, P&L, win rate | ✓ | ✓ | ✓ | Have | – |
| Equity chart with P&L / Daily / Per-day views | ✓ | ✓ | ✓ | Have | – |
| Multi-month P&L heatmap, monthly totals under each block | ✓ | – | ◐ (one month) | Year view with totals per month | S |
| Asset-allocation donut by symbol, top 6 + others | ✓ | – | ◐ (Instruments list) | Add donut with P&L on hover | S |
| Avg gain/loss, biggest win/loss, R:R, max drawdown | ✓ | ✓ | ✓ | Have | – |
| **Sharpe, Sortino**, CAGR | Sharpe ✓ | backtests ✓ | ✗ | Add; computed from the daily equity series | S |
| Avg holding time, winners vs losers | ✓ | ✓ | ✓ | Have | – |
| ⓘ explanation on every metric | ✓ | ✓ | ◐ | One "what it is / why it matters" popover on every number | S |
| "Unknown" instead of 0 when there's no data | – | ✓ | ✗ | Adopt everywhere | S |
| Paper / live toggle on all stats | – | ✓ | ✗ | Comes with paper trading (§3.4) | – |
| **Reports PDF export**: equity, drawdown, distribution, per-pair | – | ✓ | ✗ | Branded PDF report, monthly or custom range | M |
| CSV export of trades | ✓ | ✓ | ✓ | Have | – |
| Same analytics stack for "me" and for any leader or strategy | ✓ | – | ✗ | Build the stack once as a component, reuse it for leaders, strategies and paper accounts | M |

### 3.2 Trades, positions and orders
| Feature | MP | CM | Us | Plan | Size |
|---|---|---|---|---|---|
| Trade history with filters (symbol, side, source, dates), search, date-grouped rows | ✓ | ✓ | ✓ | Have. Add a **Source** filter (manual / copied / strategy) once execution exists | S |
| Exit-reason filter: TP, SL, trailing, signal, time stop… | – | ✓ | ✗ | Infer from MT5 deal comments ([tp]/[sl]) now; exact once we execute | S |
| Positions tabs: Open / Closed / Pending / Rejected | ✓ | ✓ | ◐ (closed only) | Open positions need a live position feed; pending/rejected need execution | M |
| Close, partial close, edit SL/TP/trailing, bulk close, square off all | c | c | ✗ | **Needs execution (§2)** | L |
| Manual-orders log: what was sent, what the exchange replied | – | ✓ | ✗ | Needs execution | M |
| Floating **Quick trade** from any page | – | ✓ (shell) | ✗ | Needs execution | M |
| Per-trade journal: notes, tags, emotions, screenshots, replay | ✗ | ✗ | ✓ | **Our moat.** Extend it to copied and strategy trades too | – |

### 3.3 Copy trading (MirrorPip's core)
| Feature | MP | CM | Us | Plan | Size |
|---|---|---|---|---|---|
| Leader marketplace: cards with P&L, ROI, sparkline, max DD, win-rate bar, followers, recommended margin | ✓ | c | ✗ | Build it, with **verified, broker-synced stats** (ours come from MT5 history and can't be typed in) | M |
| Sort by profit, ROI, max DD, Sharpe, recommended margin | ✓ | – | ✗ | Add **risk grade** and **consistency score**, plus "% of profit from top 3 trades" | S |
| Leader detail: full analytics stack, strategy write-up, live open trades | ✓ | – | ✗ | Reuse the §3.1 stack | M |
| Recommended margin + multiplier %, live capital maths | ✓ | – | ✗ | Add a **"what if you'd copied since X with $Y"** simulation that works before connecting | S |
| Subscribe: multiplier, invested amount, max profit / max loss caps, copy open trades or from now | c | c | ✗ | Port the MirrorPip-X engine (copy-from-now guard and reconnect backfill already built) | L |
| Mandatory, specific risk disclosure | c | – | ✗ | Required | S |
| Edit multiplier, pause (exits still run), stop, unsubscribe | c | c | ✗ | Engine work | M |
| **Copy-vs-leader comparison**: your fill vs theirs | – | c | ✗ | **Better than both:** per-trade slippage and an overall tracking-error figure | M |
| Free vs paid ("Inner Circle") leaders, revenue share | c | c | ✗ | Needs billing (§3.9) | M |
| Leader-side portal: followers, AUM, consolidated P&L | c (separate app) | c | ✗ | A tab inside our app, not a second app | M |
| Become-a-leader application | c | ✓ | ✗ | Apply form + admin approval | S |

### 3.4 Strategy builder, backtest, paper and live (Cryptomaty's core)
| Feature | MP | CM | Us | Plan | Size |
|---|---|---|---|---|---|
| No-code builder: market, signal, risk; three layouts (all-at-once / step-by-step / on-chart) | – | ✓ | ✗ | Build it: a step-by-step layout plus a chart layout | L |
| 52 indicators; condition groups ALL/ANY; crosses above/below; "N bars ago"; per-condition timeframe | – | ✓/c | ✗ | Same catalogue. Use one shared indicator engine for builder, alerts and screener | L |
| Multi-symbol with per-symbol overrides; trading sessions by timezone | – | ✓ | ✗ | Include forex sessions (London/NY/Tokyo), which matter more for MT5 users | M |
| Candle types: Heikin-Ashi, Renko, Kagi, Point & Figure | – | c | ✗ | Phase 2; Heikin-Ashi and Renko first | M |
| Exits: TP %/pts/price/R:R; SL %/ATR/pts/price; trailing; time stop; partial exits with stop to break-even | – | ✓/c | ✗ | Full set | M |
| Sizing: risk % from stop, % equity, lots, qty (plus ATR/Kelly in their schema) | – | c | ✗ | Full set, with estimated margin and max loss shown | S |
| Limit/pullback entry, re-entry rules, max trades per day | – | c | ✗ | Include | M |
| **Daily loss cap → auto-pause; N consecutive losses → kill switch** | – | ✓ | ✗ | Include. Also offer these as **account-level guards** for manual traders | S |
| Plain-English read-back of the strategy; validation split into "blocks deploy" vs "worth knowing" | – | ✓ | ✗ | Copy it. Excellent UX | S |
| **Auto-backtest while editing**, pinned baseline to compare against | – | c | ✗ | Include. Show fees and slippage assumptions openly | L |
| Backtest page: dates, capital, fee model, slippage, run history | – | ✓ | ✗ | Include. Use MT5 symbol specs for forex | M |
| Paper deployment with live P&L | – | ✓ | ◐ | **We already run paper ticks for SignalX** (`/trader/paper/tick`); generalise that | M |
| Live deployment: start/pause/stop/settle/emergency close, activity feed, version history | – | ✓/c | ✗ | **Needs execution (§2)** | L |
| AI: describe a strategy in words → spec → backtest → open in builder | – | c (coming soon) | ◐ (SignalX) | **Ship it live**. They can't yet | M |

### 3.5 Market analytics
| Feature | MP | CM | Us | Plan | Size |
|---|---|---|---|---|---|
| Market overview: breadth, gainers/losers, heatmap, sectors, Fear & Greed | – | ✓ | ◐ (Markets, Macro) | Extend Markets with breadth, heatmap and movers. Cover forex and indices too, not just crypto | M |
| Symbol deep-dive: returns, volatility, drawdown, beta, liquidity, funding/OI | – | ✓ | ◐ (Charts) | Add a stats panel to Charts | M |
| **Auto-detected chart patterns** with plain-English "what / why / where it's wrong" | – | ✓ | ◐ (SignalX analysis) | Add pattern detection; reuse Claude for explanations | M |
| Screener: quick screens + AND conditions, saved screens, export | – | ✓ | ✗ | Build on the shared indicator engine | M |
| Signals: composite rating on 1h/4h/1d, Strong Buy → Strong Sell | – | ✓ | ◐ (SignalX) | Add a table view of signals across the watchlist | S |
| Scanner with WHERE builder (AND/OR) | – | ✓ | ✗ | Fold into the screener. One tool, not two | – |
| Correlation matrix, sector rotation | – | ✓ | ✗ | Include. Useful for forex pairs exposure | S |
| Compare up to 6 symbols | – | ✓ | ✗ | Include | S |
| Weekly AI market briefs | – | ✓ | ◐ (weekly review = personal) | Add a market brief next to the personal one | S |
| News with sentiment tags | – | ✓ | ✓ (News) | Add sentiment tags via Claude | S |
| Watchlists: up to 8 lists, CSV import/export, star from anywhere | ✓ | ✓ | ◐ (one list) | Multiple lists, CSV, star everywhere | S |

### 3.6 Options
| Feature | MP | CM | Us | Plan | Size |
|---|---|---|---|---|---|
| Option chain with Greeks, column settings, drag-reorder | ✓ | ✓ | ✗ | Crypto options only (Delta). MT5 forex brokers rarely offer options | M |
| Analytics: expected move, gamma, skew, OI/IV by strike, payoff, breakeven | – | ✓ | ✗ | Build after the chain | M |
| Multi-leg builder with payoff chart, templates (bullish/bearish/neutral/hedging) | c | c | ✗ | Analysis now; order placement needs execution | M |
| Historical **expiry replay simulator** | – | ✓ | ✗ | Pairs naturally with our chart replay | L |

**Recommendation:** only do options if we choose crypto route A.

### 3.7 Alerts and notifications
| Feature | MP | CM | Us | Plan | Size |
|---|---|---|---|---|---|
| Alert conditions: price, RSI, 24h %, funding, OI; crosses above/below; cooldown | – | ✓ | ◐ (price above/below) | Add indicator and cross conditions via the shared engine | M |
| Delivery: in-app, email, push, **Telegram** | c (Telegram, push) | ✓ (in-app, email, push) | ◐ (push, in-app) | Add email and **Telegram** (beats both) | S |
| Inbox with channels and counts (fills, risk, AI, system, reports, news); unread / archived; sound | c | ✓ | ◐ | Build the channelled inbox | S |
| "Test notification" button with an honest result | – | ✓ | ✗ | Add | S |
| Trade-event notifications: order placed, skipped, filled, square-off | c | ✓ | ✗ | Comes with execution | – |

### 3.8 Broker and exchange connections
| Feature | MP | CM | Us | Plan | Size |
|---|---|---|---|---|---|
| Up to 8 accounts | ✓ | ✓ | ✓ (multi MT5) | Have | – |
| Connect form: partner sign-up link, paste buttons, how-to video, custody notice | ✓ | ✓ | ◐ | Add the video and custody notice. Broker partner links are a revenue line | S |
| Required-permissions checklist ("withdraw refused at save"), IP allowlist with copy | ✓ | ✓ | n/a | For crypto route A | S |
| Test connection, health status, refresh balances | c | ✓ | ◐ (sync status) | Add "Test connection" and a health tile | S |
| Crypto exchanges: Delta, Binance, Bybit, OKX… | ✓ | ✓ | ✗ | Route A (§2) | L |
| **TradingView webhook bot**: URL, secret, JSON templates | ✓ | – | ✗ | Needs execution; webhook + secret are easy | M |
| Personal API key with docs | ✓ | plan-gated | ✗ | Later | M |

### 3.9 Account, security and billing
| Feature | MP | CM | Us | Plan | Size |
|---|---|---|---|---|---|
| Profile: name, phone, timezone | ✓ | ✓ | ◐ | Add timezone; we have location | S |
| **Sessions and devices** with revoke / sign out everywhere | – | ✓ | ✗ | better-auth supports it | S |
| SMS / mobile OTP, 2FA | ✓ | ✓ | ✗ (email OTP) | Add TOTP 2FA (better than SMS) | S |
| Delete account (OTP-confirmed) | c | – | ✗ | Required anyway (privacy) | S |
| Activity log | c | ✓ | ✗ | Add | S |
| **Plans and limits**, enforced server-side | – | ✓ (4 plans) | ◐ (platform access gate) | Plan table + entitlements middleware | M |
| Billing | – | USDT wallet | ✗ | **Razorpay / UPI** for India (beats USDT-only) | M |
| Guided product tour; contextual upsell per feature | – | ✓ | ✗ | Add a light tour | S |

### 3.10 AI
| Feature | MP | CM | Us | Plan |
|---|---|---|---|---|
| Portfolio-aware AI chat | ✗ (help bot only) | "coming soon" (Haiku 4.5) | ✓ (AI coach) | **We're ahead.** Add context chips (open positions, last 7 days of fills, live strategies) |
| Strategy generator | – | "coming soon" | ◐ | Ship (§3.4) |
| AI watcher: rules + plain-English explanations | – | "coming soon" | ◐ (SignalX) | Merge into alerts |
| Chart explainer | – | "coming soon" | ✓ (SignalX analyze) | Have |

### 3.11 Global UX
| Feature | MP | CM | Us | Plan |
|---|---|---|---|---|
| ⌘K command palette | – | ✓ (coins, strategies, pages) | ✓ (pages) | Extend to symbols, trades and actions |
| Help: email, WhatsApp, docs, report a bug | ✓ | ✓ | ◐ | Add a Help page and a feedback box |
| Light/dark theme | ✓ | ✓ | dark | Optional |
| Data freshness shown everywhere | – | ✓ | ◐ | Adopt |
| Mobile apps, biometric login | ✓ | – | ✗ (web only) | PWA first |

---

## 4. Where we beat both (keep and lean into)

1. **Verified track records.** Cryptomaty's marketplace literally says "performance not measured". MirrorPip shows stats with no risk context (we saw 172% max drawdown next to green ROI). Ours come from broker-synced history and carry risk grades.
2. **A real journal.** Neither has notes, tags, emotions, screenshots, replay or a coach on trades. We can journal copied and strategy trades too.
3. **AI that's live.** Theirs is "coming soon"; our coach and SignalX already run.
4. **MT5, forex and gold.** Both are crypto-only.
5. **Speed and accessibility.** MirrorPip is a canvas app; Cryptomaty is dense.
6. **Copy-trade honesty.** Show slippage and tracking error per trade. Both admit fills differ, but neither measures it.
7. **Useful before connecting.** Their screens are blank without a broker. We can offer "simulate copying this leader since X" and paper trading from day one.

## 5. Suggested build order

| Phase | What | Execution needed? |
|---|---|---|
| **1. Quick wins** (≈1–2 wks) | Custom dates, hide balance, Sharpe/Sortino, year heatmap, allocation donut, ⓘ on every metric, "unknown ≠ 0", multi-watchlists + CSV, sessions/revoke, TOTP 2FA, delete account, Telegram + email alerts, channelled inbox, test-notification, PDF report | No |
| **2. Analytics engine** (≈3–4 wks) | Shared indicator engine → indicator alerts, screener (saved screens), signals table, compare, correlation, chart patterns with Claude explanations, market breadth and heatmap | No |
| **3. Strategy builder + backtester + paper** (≈4–6 wks) | Builder (step-by-step + chart layouts), plain-English read-back, validation, auto-backtest with baseline, risk guards, paper deployments on the analytics stack, AI strategy generator | No |
| **4. Leaders (read side)** (≈2 wks) | Leader marketplace + detail on verified stats, risk grades, "simulate copying", become-a-leader, plans and Razorpay billing | No |
| **5. Execution** (depends on §2 route) | Copy engine (port MirrorPip-X), live deployments, positions management, quick trade, TradingView bot, copy-vs-leader tracking error | **Yes** |
| **6. Options** (only with crypto) | Chain, analytics, multi-leg payoff, replay simulator | Analysis no / trading yes |

## 6. Decisions I need from you (nothing assumed)

1. **Execution route:** A (crypto exchanges via API keys, reusing MirrorPip-X), B (MT5 master password), C (MT5 EA copier), or a combination? Or no execution yet, and phases 1–4 first?
2. **Crypto at all?** Should TRADElogs add crypto exchanges, or stay MT5/forex? This decides options (phase 6) and most of the market-analytics scope.
3. **Billing:** plans and prices, and Razorpay or something else?
4. **Legal:** OK to get a quick SEBI/algo opinion before phase 5 goes live?
5. **Start point:** OK to begin phase 1 right away while you decide the rest?

---

## 7. Decisions (29 Oct) and the integration plan

**Decided by you:**
- Build **everything** both apps have.
- **Crypto exchanges via API keys**, reusing MirrorPip-X.
- **Everything free** for now; billing comes later.

### What MirrorPip-X gives us (`~/Desktop/mirrorpip-x`, live as "BelieveMeGuys")
- **Exchange layer** (`packages/exchange`):
  - A clean `Exchange` interface: verify, account, positions, recent fills, instrument, market order, mark price, fill stream.
  - A **Delta India** adapter: HMAC REST plus an authenticated WebSocket with heartbeat and reconnect.
- **Copy engine** (`apps/engine`):
  - Leader WebSocket watchers, fan-out with dedup and a copy-from-now guard.
  - 3 sizing modes: proportional, fixed margin, multiplier. Max position cap and reverse copy.
  - Weighted-average position maths, mark-to-market, leader ROI/drawdown/win-rate per window.
  - A 24h sweep that retries missed copies, and a kill switch.
  - 25 unit tests.
- **Web flows to port:**
  - Leaderboard (podium, compare mode), leader detail, follow form.
  - Follow detail with SSE live updates, the 3-step connect wizard, apply-as-leader.
  - Admin: leaders verification, users, kill switch, audit, access grants.
- **Data model:** ExchangeCredential, Leader, LeaderEquityPoint, LeaderStat, Follow, LeaderFill, CopyOrder (with slippage), CopyPosition.

### Gaps to close before real money (found in its code)
1. **Delta only, market orders only.** No limit orders, cancel, leverage, explicit close or order-status polling. Binance, Bybit, OKX and others need adapters.
2. **"Daily" loss limit sums all-time realised P&L**, not today's.
3. **SUBMITTED orders are never re-polled,** and copied positions are never reconciled against the exchange's real positions.
4. `getRecentFills` errors are swallowed.
5. A **demo OTP backdoor** (`DEMO_OTP_BYPASS`) exists and must not come over.
6. **The code defaults to Delta prod while `.env` uses testnet.** We'd make the environment explicit and required.
7. **Keys are IP-whitelisted.** Railway egress IPs change, so we need a static egress IP before live keys work reliably.
8. Billing fields (`feeBps`, `maxFollowers`) aren't enforced. That's fine while everything is free.

### How it fits into TRADElogs
- **`packages/exchange`** (new): copy the interface and the Delta adapter. Use **our** `lib/secrets.ts` vault (`enc:v1:` format, same `CREDENTIAL_ENCRYPTION_KEY`, never rotated) instead of its own. Add adapters one by one: **Binance → Bybit → OKX → CoinDCX → others**.
- **`apps/engine`** (new Railway service, like the worker): watchers, fan-out, reconcile and kill switch, with the gaps above fixed. Later it also runs live strategy deployments from the builder.
- **API** (`apps/api` modules):
  - `exchanges` (connect, test, disconnect)
  - `leaders`, `follows` (+ SSE), `orders`, `positions`
  - later `strategies`, `backtest`, `screener`
- **DB:** new Prisma models tied to our `user` table with proper foreign keys.
  - Developed on the **local test DB** first.
  - Migrations reach Neon only through `migrate deploy`, after a status check, SQL review and your OK.
- **Web:** pages rebuilt in the new UI system, not copied from BelieveMeGuys' blue theme.
- Everything stays **on Delta testnet** until you say go live. The SEBI check comes before that.

### Build order
| # | Phase | Includes |
|---|---|---|
| 0 | **Foundation** | UI token/component layer (v6), exchange package + Delta adapter, exchange connect wizard, engine service skeleton, DB models on the test DB |
| 1 | **Copy trading** | Leaderboard with risk grades, leader detail on the shared analytics stack, follow/sizing/caps/risk disclosure, engine with the gaps fixed, live follow view, slippage and tracking error, admin leader verification + kill switch, Telegram/email/push trade notifications |
| 2 | **Trading desk** | Positions (open/closed/pending/rejected), close, partial close, SL/TP/trailing, square-off, quick trade, manual-orders log, TradingView webhook bot, multi-watchlists |
| 3 | **Analytics engine** | Shared indicator engine, indicator alerts, screener and scanner, signals, patterns, compare, correlation, market overview, derivatives (funding/OI) |
| 4 | **Strategy builder** | Builder, plain-English read-back, auto-backtest, backtester, paper and live deployments, risk guards, AI strategy generator |
| 5 | **Options** | Chain, analytics, multi-leg payoff, expiry replay simulator |
| 6 | **Marketplace + account** | Strategy templates, creator programme, sessions/2FA/delete, activity log, PDF reports, product tour |
| ∥ | **Quick wins**, alongside | Custom dates, hide balance, Sharpe/Sortino, year heatmap, ⓘ on metrics, "unknown ≠ 0" |
