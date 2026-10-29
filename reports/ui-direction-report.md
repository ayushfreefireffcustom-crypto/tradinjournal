# UI direction: what makes the references look clean, and how TRADElogs adopts it

29 Oct 2026. Sources:
- The 4 images in the X post (the "Apptics" landing page by @jaydwivedi_).
- The dark learning-app dashboard screenshot you shared.
- The live MirrorPip and Cryptomaty dashboards.

Our colours stay as they are: black, white, signal green `#08C465`, loss red `#FE3A31`.

---

## 1. Why the Apptics landing page looks so good (what's actually going on)

1. **One repeating section pattern.** Each section is built the same way:
   - **Left:** a tiny label pill (`Apptics CRM`) and a 2-line, sentence-case heading.
   - **Right:** a short muted paragraph and **one** dark pill button.
   - **Below:** a bento of **4 small stat tiles (2×2) and 1 big art panel**.

   It repeats about 7 times. Nothing else competes, so the page reads instantly.
2. **Each section owns one hue.** Blue/cyan for CRM, green for payments, orange/red for chargebacks, violet for fulfilment and learning, gold for ads. Inside a section, the icons, the art panel and the glow all use that one hue. The page is colourful overall, but never inside a single section.
3. **The art panels are product objects, not illustrations.** Every one is a 3D or glass rendering of the *thing itself*:
   - a glossy "CRM" slab with floating notification chips
   - a credit card
   - a shield with "Chargeback Detected!" toasts
   - isometric bars

   Real UI fragments (toasts, chips, numbers) float on top, slightly blurred at the edges for depth.
4. **Icons are glossy app-icon tiles.** Each is a rounded square with:
   - a vertical gradient
   - a 1px inner highlight on top
   - a soft coloured glow underneath
   - a white glyph

   Every icon in a section uses the same treatment and hue. The final section scatters 8 of them on a faint grid, which makes a strong closing image.
5. **Stat tiles are almost empty.** Each has an icon, a ghosted watermark glyph, then **bold number + regular words** ("**+426%** Average Revenue Increase"). That's the whole tile.
6. **Restraint everywhere else:**
   - Light grey canvas; white cards with no visible borders, just a 1px tint and a soft shadow.
   - One sans family; headings in medium weight with tight letter-spacing; body text small and muted.
7. **Small finishing details:**
   - a dashed-line logo grid
   - a hairline-separated FAQ with +/× toggles
   - a **giant ghosted wordmark** in the footer
   - a Telegram contact card
   - a gradient word in the final CTA ("ecom business.")

## 2. Why the dark dashboard reference looks clean

1. **Two surfaces only.**
   - Canvas ≈ `#121212`.
   - Big containers ≈ `#1C1C1C` with a large ~24px radius.
   - Inner wells (chart thumbnails, stat strips) are one step darker or lighter.
   - No borders, no glows.
2. **One accent, used sparingly.** Peach/orange appears only on progress fills, "Continue · Module 01" eyebrows and the current day. Everything else is greyscale.
3. **Type system:**
   - Sans for headings and labels.
   - **Monospace for meta and progress** ("1 of 8 topics · 18 min", "1/8").
   - Big numerals ("0", "92") sit next to small sentence-case explanations ("questions due today").
4. **Every card has a header + one action:**
   - title + small muted subline on the left
   - a single pill button on the right ("Browse the curriculum", "View module")
   - primary = white pill, secondary = dark pill
5. **Content as small dark "screens".** Charts are shown as framed dark thumbnails with mono labels, like little monitors. That gives texture without colour.
6. **Navigation:** an icon-only rail inside a rounded pill; a search pill with a ⌘K hint; the avatar top-left; theme and profile top-right.
7. **Calm density.** Generous padding (≈24–28px), big gaps between cards, about 3 ideas per screen.

## 3. What the competitors get wrong (to avoid)

- **MirrorPip:**
  - Lime on black with heavy borders on every card.
  - Rotated, noisy axis labels.
  - Grey placeholder charts everywhere.
  - Canvas-drawn, so text looks soft and can't be selected.
- **Cryptomaty:**
  - Light UI that's dense and busy.
  - 13 analytics pages full of jargon.
  - Many tiny tiles of the same weight, with no focal point.
  - A blue accent fighting red/green P&L.

## 4. The TRADElogs system (black, white, green, red)

### Tokens
| Token | Value | Use |
|---|---|---|
| `--canvas` | `#0B0B0C` | page |
| `--surface-1` | `#151517` | big containers, radius 24 |
| `--surface-2` | `#1C1C1F` | inner wells, tiles, inputs; radius 16 |
| `--line` | `rgba(255,255,255,.06)` | only where separation is needed (table rows) |
| `--text` | `#EDEDEF` | primary text |
| `--muted` | `#8A8A90` | secondary text |
| `--dim` | `#55555B` | tertiary text, axes |
| `--green` | `#08C465` | **profit, the brand accent, progress, current/active** |
| `--red` | `#FE3A31` | **loss, risk, destructive** |
| White pill | `#FFFFFF` on black | the one primary action per card |

**Hue rule (adapted from Apptics):**
- Green owns profit, growth and "good" sections.
- Red owns risk: drawdown, loss limits, kill switch, alerts.
- White and grey own everything neutral.
- No third accent colour.

### Typography
- **Sans for everything.** Weights 400 and 500 only; headings at −0.02 to −0.03em letter-spacing.
- **Mono (JetBrains Mono, already in v5) for numbers and meta only:** prices, P&L, counts, "1 of 8 · 18 min", timestamps.
- **Scale:**
  - 12 meta
  - 13–14 body
  - 15 card title
  - 22 stat
  - 32–44 hero numbers
  - 48–64 landing H1
- **Pattern:** bold number + regular label ("**66.7%** win rate"), as in the Apptics tiles.
- Drop the serif-italic accent inside the app. Keep it for one word on the landing hero, at most.

### Components
- **Card header:** title + muted subline on the left; one pill action on the right.
- **Eyebrow:** small green text ("Live · XM Global") or a small label pill.
- **Stat tile:** icon tile + big mono number + one-line label + optional thin bar. Nothing else.
- **Thumbnail well:** dark framed mini-chart with mono labels, for strategies, leaders and backtests.
- **Icon tile:** rounded-square gradient chip, glossy, with a soft glow. Green family for good, red family for risk, graphite for neutral.
- **Buttons:** white pill (primary), graphite pill (secondary), text link with → (tertiary).
- **Nav:** an icon rail in a rounded pill (as in the reference) or the current labelled sidebar, simplified. ⌘K search pill.
- **Empty states:** one glass object + one sentence + one button. Never a grey placeholder chart.

## 5. Imagery and SVGs: how we make "beautiful, not gimmicky" visuals

These are made **in code**: hand-built SVG + CSS. No stock art, no AI images, no hotlinked brand assets. They stay sharp, theme-aware and tiny.

1. **Glass object art** for each landing section and empty state. Each is the product object itself, in black glass with a green or red rim light:
   - **Journal:** a glass notebook slab with floating trade chips ("XAUUSD +$612").
   - **Copy trading:** two linked glass cards (leader → you) with a live "Copied · 0.4s · slippage 0.2 pip" toast.
   - **Strategy builder:** stacked condition blocks ("RSI < 30", "EMA 50 > 200") with a green "Deploy" chip.
   - **Risk guard:** a black glass shield with red "Daily loss cap hit" toasts, the same idea as Apptics' chargeback shield, in red.
   - **Analytics:** isometric glass bars rising in green.

   Technique: SVG shapes with linear and radial gradients, a 1px top highlight, inner shadow, `backdrop-filter` frosted chips, and a soft coloured `filter: blur()` glow beneath. Toasts are real HTML, so they stay crisp.
2. **Icon tiles:** one SVG master (rounded rect + gradient + highlight + glow) × our line glyphs. Three palettes: green, red, graphite.
3. **Closing scene:** a scattered grid of our 8 feature icon tiles with glows, on a faint grid. This is the Apptics finale, done in black.
4. **Giant ghosted "TRADElogs" wordmark** in the footer.
5. **Dashed integration grid:** MT5, brokers, exchanges, TradingView, Telegram, using their official logos only where we're allowed to.

## 6. How this applies to the app (dashboard example)

The structure follows the reference.
- **Top row:**
  - **Hello card (left):** "Good evening, Alex", subline "XM Global · synced 2m ago", a white pill "Add trade note".
  - **Inner hero well:** Net P&L in mono, green; a thin equity line; the range chips.
- **Right column:** the **Today / This week** card:
  - mono big number "3 trades today"
  - a week strip with today ringed in green (exactly like the reference's day picker)
  - one coach note
  - "Open review" pill
- **Second row:**
  - "Your edge" card: 3 thumbnail wells (By symbol / By weekday / By hour), each with a mono caption and a thin green progress bar.
  - Right column: "Risk" card with drawdown, daily loss cap and streak in a 3-cell stat strip (like 27 / 32 / 33 in the reference), then a list of rules with chevrons.
- **Recent trades** below, as a plain table.

## 7. Next steps
1. Build the **token + component layer** (`app-v6.css` + React primitives: Card, CardHeader, Stat, Well, IconTile, Pill), then move every page onto it.
2. Mock the dashboard in this system for your sign-off before migrating pages.
3. Redo the landing page with the Apptics section rhythm and the code-built glass art.
