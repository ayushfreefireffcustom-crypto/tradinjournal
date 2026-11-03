# Live site audit, 3 Nov 2026

Every page of www.tradelogs.com, section by section, desktop (1440) and phone (390).

## Analytics (from the user's Safari screenshots)
- [ ] A1 Card grid leaves holes with a saved custom order (Rolling edge, Session × weekday, Long vs short alone at half width; Allocation short of the right edge)
- [ ] A2 Consistency: heatmap fills a third of the card; month boxes cramped under it; Loss/Profit legend floats bottom right
- [ ] A3 P&L vs hold time: dot clipped at the right edge, dot sitting on the "$0" label, ±$4k axis flattens every trade
- [ ] A4 Session × weekday puts a trade on Fri (UTC entry) while P&L by weekday puts it on Sat (local close day); Asia total "0" where others show "—"
- [ ] A5 Hour of day bars in a dull green, unlike every other chart; tooltip shows an empty hour
- [ ] A6 Setup edge / Psychology edge empty states are bare text over a grid
- [ ] A7 "Worst day" shows a profit when every day was green

## Overview
- [ ] O1 Brief says "Meme (−0.0%)"
- [ ] O2 Movers rows uneven height (rows with a logo sit differently from initials)
- [ ] O3 Sector rotation chart: labels overlap, points crowd the middle, most of the chart empty
- [ ] O4 Correlation matrix fills ~60% of its card

## Screener / Signals / tables everywhere
- [ ] T1 Pair cells with a logo sit higher than ones with initials (baseline shift) in every table
- [ ] T2 Screener operator select cuts "a number" to "a numbe"

## Derivatives
- [ ] D1 Funding extremes card mostly empty beside the long Squeezes list
- [ ] D2 Funding extremes names truncated ("100…", "HAED…")
- [ ] D3 All perpetuals: last column clipped off the card

## Options
- [ ] P1 Term structure: short expiries crowd the left edge (linear days axis), reads as a glitch
- [ ] P2 OI by strike: Index / Max pain / Gamma centre labels collide
- [ ] P3 Charts: 1D/3D/7D switch stretched to the expiry buttons' height
- [ ] P4 Builder: payoff chart labels (−1σ, BE, Index, Target, +1σ) overlap
- [ ] P5 Builder: stat tiles leave a 2-tile hole in the second row
- [ ] P6 Builder: Analysis table's last column clipped
- [ ] P7 Builder legs: text "×" remove buttons
- [ ] P8 Builder payoff and Replay empty states are bare text

## Charts
- [ ] C1 Toolbar second row: Patterns and Indicators spread apart

## Macro
- [ ] M1 Stale prices: BTC 64.8K and gold 4,343 (rest of the site: ~76.6K and 3,935)
- [ ] M2 Ticker starts with a broken "–%" item; DXY and XAUUSD repeated with "—"
- [ ] M3 Headlines include decades-old SEC press releases dated in the future ("in 43d"); same junk tops News
- [ ] M4 Asset macro bias: 2 empty slots in the last row
- [ ] M5 Indicator columns leave a big hole above Economic calendar
- [ ] M6 Regime: left card says "Disinflationary slowdown", matrix beside it says "Deflation"
- [ ] M7 Economic calendar panel lists past events first ("1d ago")
- [ ] M8 Forex strength tiles 7 + 3 (hole); glossary leaves one card alone
- [ ] M9 Access panel only two-thirds wide
- [ ] M10 SignalX lock card: ghost preview too strong behind the text

## Dashboard / journal pages (real data)
- [ ] J1 Equity curve x-axis repeats dates ("Aug 20" twice on Dashboard, "Aug 8" three times on Analytics)
- [ ] J2 Daily P&L y-axis ticks uneven (−$1.3k, −$2.5k)
- [ ] J3 Recent trades: day header says "5 trades" but only one is listed
- [ ] J4 Calendar opens on an empty month; should open on the latest month with trades
- [ ] J5 Calendar "By weekday" and Analytics edge empty states are bare text
- [ ] J6 Strategy builder Markets field: stray empty box and two × next to BTCUSDT

## Other pages
- [ ] X1 Marketplace filter row wraps ("Most followed" alone); old empty state
- [ ] X2 SignalX "Pick a symbol" and Strategies empty states old style
- [ ] X3 Coach fallback says "across 1 trades"
- [ ] X4 Settings: full "MT5 accounts 2/2" bar is red; Notifications copy mentions copy trading (off)
- [ ] X5 Notifications bake in "in 29 minutes" (wrong an hour later), times in UTC not the user's zone, default minimum impact Low floods the inbox
- [ ] X6 /trading shows the full Positions screen with "Route not found" and New order / Quick trade buttons; should be "Coming soon" like /copy
- [ ] X7 Admin: "0.5h / —h"
- [ ] X8 Help, Docs, Settings sub-tabs only two-thirds wide

## Phone (390)
- No horizontal overflow on any page. Long vs short tiles leave an orphan; Hour of day labels crowded.

## Not code (needs you)
- Anthropic credit is empty: AI coach, SignalX LLM, news enrichment and Macro AI fall back.
- One SignalX access request has waited since 10 Aug (admin › Macro › Access).
