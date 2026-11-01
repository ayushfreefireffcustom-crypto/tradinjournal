// In-app docs (H13). Articles are Markdown keyed by language; English is
// written, Hindi slots in later as `hi` without changing the pages.
export type Lang = 'en';
export interface DocArticle { slug: string; section: string; title: string; summary: string; body: Record<Lang, string>; related?: string[] }

export const SECTIONS = ['Getting started', 'Journal', 'AI coach', 'Markets and alerts', 'Strategies', 'Copy trading and the desk', 'Options', 'Marketplace', 'Account and security'] as const;

export const DOCS: DocArticle[] = [
  {
    slug: 'connect-mt5', section: 'Getting started', title: 'Connect your MT5 account', summary: 'Link MetaTrader 5 with a read-only login so your trades sync on their own.',
    related: ['trade-log', 'ai-coach'],
    body: { en: `TRADElogs reads your MetaTrader 5 history with an **investor (read-only) password**. It can see your deals and balance; it can never place, change or close a trade on that account.

**To connect**
1. Open **Brokers** and press **Connect MT5**.
2. Enter your MT5 login number, the broker's server name (as shown in MT5) and the investor password.
3. TRADElogs checks the login, then imports your history. Large histories take a minute or two.

**After that** your account syncs in the background. The sync time shows next to the account; press **Sync** to pull new deals straight away.

**Good to know**
- You can connect up to two MT5 accounts on the Free plan.
- If the broker rejects the password (for example after you change it), the account shows a warning and stops syncing until you update the password.
- Removing an account deletes its imported trades from TRADElogs. Your broker account is untouched.` },
  },
  {
    slug: 'connect-exchange', section: 'Getting started', title: 'Connect a crypto exchange', summary: 'Add Delta Exchange India keys to trade, copy and run strategies.',
    related: ['copy-trading', 'trading-desk', 'deployments'],
    body: { en: `Exchange connections let TRADElogs read your positions and, if you allow it, place orders: copy trading, the trading desk, live strategies and option orders all use them.

**To connect**
1. Create an API key on Delta Exchange India. Give it **read** and **trade** permission if you want TRADElogs to place orders; read-only is enough for viewing.
2. If the exchange asks for an IP whitelist, add the addresses shown on the **Exchanges** page.
3. On **Exchanges**, press **Connect**, choose testnet or live, and paste the key and secret.

**How keys are kept** Keys are encrypted before they're stored and are only decrypted inside the server when an order or a read needs them. They are never shown again, never sent to your browser and never written to logs.

**Testnet first** Delta's testnet uses play money. Everything works the same there, so it's the safe place to try copy trading and live strategies.

**Removing a connection** wipes its keys. Copies or live strategies on that account have to be stopped first.` },
  },
  {
    slug: 'trade-log', section: 'Journal', title: 'Trade log and analytics', summary: 'Every closed trade, rebuilt from your fills, with the stats that matter.',
    related: ['journal-notes', 'calendar'],
    body: { en: `**Trade log** lists every closed trade TRADElogs rebuilt from your MT5 deals: entry and exit, size, profit, duration and the tags you add. Filter by symbol, side, date or result, and open any trade to replay it on the chart.

**Analytics** turns the log into numbers: win rate, profit factor, average win and loss, expectancy, drawdown, and breakdowns by symbol, weekday and hour. Use it to find what actually makes you money and what doesn't.

**Numbers you can trust** Everything is computed from your broker's own records. When something can't be known (for example a figure that needs data your broker doesn't send), it shows "—" rather than a guess.` },
  },
  {
    slug: 'journal-notes', section: 'Journal', title: 'Journal: trade review and notes', summary: 'Notes, emotions and tags per trade and per day, with the chart beside them.',
    related: ['trade-log', 'ai-coach'],
    body: { en: `The **Journal** is where you write down what you were thinking. It has two views:

- **Trade review** shows a trade on the chart bar by bar, so you can see what you saw at the time, where you entered and what happened after you exited, with a note, an emotion and tags for that trade.
- **Notes** is a free-form log for the whole day, whether or not you traded.

Add an emotion and tags so patterns show up later (for example "FOMO" trades losing more than planned ones).

Your notes feed the **AI coach** and the weekly review, which look for habits across many trades rather than judging one.` },
  },
  {
    slug: 'calendar', section: 'Journal', title: 'Calendar', summary: 'Your P&L day by day, next to the economic events that moved markets.',
    body: { en: `The **Calendar** shows each trading day's result. Click a day to see its trades. The **News & calendar** page lists upcoming economic events; turn on reminders in **Settings › Notifications** to be told before high-impact releases.` },
  },
  {
    slug: 'ai-coach', section: 'AI coach', title: 'The AI coach', summary: 'Ask about your trading; it reads your trades and journal, and can search the web.',
    related: ['coach-tools'],
    body: { en: `The **AI coach** answers questions using your own closed trades, stats and journal. Ask things like "What's my worst habit?" or "Do I trade better in the morning?". For market questions it can search the web and shows its sources.

**It isn't a signal service** The coach reviews behaviour and explains; it won't tell you what to buy.

**Weekly review** Turn it on in Settings to get an email every week with the one thing worth fixing.` },
  },
  {
    slug: 'coach-tools', section: 'AI coach', title: 'Context chips and tools', summary: 'Hand the coach your positions or strategies, and use its tools.',
    related: ['ai-coach', 'strategy-builder'],
    body: { en: `**Context chips** sit above the message box. Tap one to include that data in your next questions:
- **Open positions** on your connected exchange accounts (read live).
- **Fills, last 7 days** from your exchange history.
- **Live strategies** you're running, with their results.
- **Copies** you're following.

Chips only appear when you have that data.

**Tools** (the Tools button):
- **Make a strategy**: describe an idea; it becomes rules in the builder, saved as a draft.
- **Explain a pattern**: finds chart patterns on a market now and explains the one you pick.
- **Tune a strategy**: say what to improve. You see the proposed changes and a backtest of before and after on the same history. Nothing changes until you press **Save as a new version**.

Tool results are kept in the conversation.` },
  },
  {
    slug: 'charts-alerts', section: 'Markets and alerts', title: 'Charts, screener and signals', summary: 'Charts with indicators and patterns, a market screener, and rated signals.',
    related: ['indicator-alerts'],
    body: { en: `**Charts** show crypto and other markets with 35+ indicators, chart types (candles, Heikin-Ashi, Renko and more) and automatic pattern detection. **Overview** and **Derivatives** summarise the market, funding and open interest.

The **Screener** filters up to 200 of the most-traded crypto markets by price, volume, indicators, funding and open interest; save screens you use often. **Signals** rate markets from strongly bearish to strongly bullish from a set of indicators, and explain the rating.` },
  },
  {
    slug: 'indicator-alerts', section: 'Markets and alerts', title: 'Indicator alerts and watch rules', summary: 'Be told when a condition is met at a bar close, with what it means.',
    related: ['charts-alerts'],
    body: { en: `An **indicator alert** watches one condition on one market, such as "RSI(14) crosses above 30 on BTCUSDT 4h". It's checked when each bar closes, never on a bar that's still forming.

**Watch rules** are ready-made, well-known conditions (golden cross, MACD crosses, Bollinger breaks, volume surges and more). Each says what it is, why traders watch it and where it misleads. Press **Watch**, pick a market and bar size, and it becomes an alert.

**When an alert fires** you get a notification in the app (and by push or Telegram if you turned those on) that includes the values and, for watch rules, why it matters. A cooldown stops one rule from repeating too often.

Open **What it means** on any alert for the explanation.` },
  },
  {
    slug: 'strategy-builder', section: 'Strategies', title: 'Build a strategy', summary: 'Entry and exit rules, risk and sizing, read back in plain English.',
    related: ['backtests', 'deployments'],
    body: { en: `The **strategy builder** turns an idea into rules a computer can run: which markets, the bar size, when to enter and exit, the stop, the target and the position size.

**Three layouts** over the same rules: **Cockpit** (everything at once), **Step by step**, and **Chart**, where thresholds and the stop and target are lines you drag on real recent bars.

As you edit, the right-hand side reads the rules back **in plain English** and lists anything that **blocks running** or is **worth knowing**. Save to keep a version; older versions stay in **Versions** and can be restored.` },
  },
  {
    slug: 'backtests', section: 'Strategies', title: 'Backtests', summary: 'How a strategy would have done, with fees, slippage and no look-ahead.',
    related: ['strategy-builder'],
    body: { en: `A **backtest** runs your rules over past bars. Orders fill at the next bar's open, fees and slippage are charged, and when the stop and target are both hit in one bar the stop is assumed first. No future data is ever used.

The builder backtests automatically as you edit, and you can pin a run to compare changes against it. Results show return, drawdown, win rate, profit factor, Sharpe and each trade.

A good backtest is a reason to try a strategy on paper, not proof it will make money.` },
  },
  {
    slug: 'deployments', section: 'Strategies', title: 'Run a strategy on paper or live', summary: 'Paper runs on live prices; live runs place real orders.',
    related: ['backtests', 'connect-exchange'],
    body: { en: `Press **Run** in the builder to start a **deployment**.

- **Paper** uses live prices with simulated fills, fees and slippage. Start here.
- **Live** places real orders on a connected Delta account (testnet or real money). The stop and target are placed on the exchange as soon as an entry fills.

A deployment acts once per closed bar. Its page shows its status, P&L, open positions and an **activity feed** of every check: why it entered, or why it didn't.

**Controls**: Pause (no new trades), Stop (no new trades; open ones finish), Settle (close everything now and stop) and Emergency close. Size changes apply to new trades only.

Editing the strategy later doesn't change a running deployment; start a new one to use the new rules.` },
  },
  {
    slug: 'copy-trading', section: 'Copy trading and the desk', title: 'Copy trading', summary: 'Follow a verified leader; their trades are copied to your exchange account.',
    related: ['connect-exchange', 'trading-desk'],
    body: { en: `**Leaders** are traders whose exchange accounts TRADElogs watches. Their stats come from their real fills.

**To copy**: pick a leader, choose your exchange account and sizing (proportional to equity, or a fixed amount per trade), set optional limits (max position, daily loss, profit cap) and confirm. New trades the leader opens are copied within seconds.

**Managing**: pause or stop from **My copies**. Stopping asks whether to close the copied positions or leave them open.

**Leading**: apply from the Leaders page; an admin reviews applications.

Copying uses real money on a live account. Try it on testnet first.` },
  },
  {
    slug: 'trading-desk', section: 'Copy trading and the desk', title: 'The trading desk, webhooks and API keys', summary: 'Positions, orders, TP/SL and automation across your exchange accounts.',
    related: ['copy-trading', 'connect-exchange'],
    body: { en: `**Positions** shows every open position and pending order across your exchange accounts, with closed trades rebuilt from fills. Place orders with the ticket, set or move take-profit and stop-loss, add a trailing stop, or close one or many positions.

**TradingView webhooks** turn your TradingView alerts into orders. Each account gets its own secret URL.

**API keys** give your own scripts access to your TRADElogs data and, with the trade scope, to placing orders. Keys can be revoked any time.` },
  },
  {
    slug: 'options', section: 'Options', title: 'Options: chain, builder and replay', summary: 'Delta options with Greeks, multi-leg payoffs and an expiry replay.',
    related: ['connect-exchange'],
    body: { en: `**Chain** lists calls and puts by strike for each expiry, with IV, Greeks, open interest and the book. Choose which columns to show. Click a price to open the contract with its charts.

**Overview** shows what the options market is pricing: the expected move, skew, term structure, max pain and where gamma is concentrated.

**Builder** combines up to eight legs (templates included) and shows the payoff at expiry and at a date you choose, max profit and loss, breakevens, chance of profit, Greeks, and an analysis of fills and pricing.

**Replay** walks your legs to expiry as paper trades, on a flat price or on recent real moves.

**Placing orders** (when trading is on) sends the legs one at a time from the builder after a review. If one is refused the rest aren't sent; filled legs stay open.` },
  },
  {
    slug: 'marketplace', section: 'Marketplace', title: 'Run a strategy from the marketplace', summary: 'Strategies from other traders, with results we computed ourselves.',
    related: ['creator-programme', 'deployments'],
    body: { en: `The **Marketplace** lists strategies other traders publish. Each shows a **backtest TRADElogs ran itself** on the strategy's rules (with fees and slippage) and, when linked, the **creator's own run** with its real trades. Nothing on a strategy page is self-reported.

**The rules stay private.** You see the results, how it trades (markets, bar size, direction, protection) and the settings the creator lets you change, never the conditions themselves.

**To run one**: press **Run this strategy**, choose paper or live (only on exchanges the creator allows), adjust any settings, and start. It runs as one of your deployments.

**Subscriptions** lets you pause, change the size, resume or cancel (let open trades finish, or close them now). Everything is free for now.` },
  },
  {
    slug: 'creator-programme', section: 'Marketplace', title: 'Publish your strategies', summary: 'Apply to the creator programme and publish a strategy as a template.',
    related: ['marketplace', 'strategy-builder'],
    body: { en: `**Apply** on the Creator programme page with a short note on how you trade. An admin reviews it.

**Once approved**, publish any strategy that passes its checks:
- a name, a one-line summary and a description of the idea and when it struggles;
- the style and risk level;
- whether it may run live (only if it has a stop and passes the live checks);
- your own run of it as a **track record** (optional);
- up to eight **settings subscribers may change**, each with a range you choose.

Publishing freezes the current version and runs a 180-day backtest. An admin reviews it before it's listed. You can unlist it any time; people already running it keep running. **Update rules** republishes from your latest version and goes back to review.

Subscribers never see your rules.` },
  },
  {
    slug: 'two-factor', section: 'Account and security', title: 'Two-factor sign-in and devices', summary: 'Protect your account with an authenticator app, and see where you’re signed in.',
    related: ['your-data'],
    body: { en: `**Two-factor sign-in** asks for a 6-digit code from an authenticator app (Google Authenticator, 1Password, Authy…) whenever you sign in with your password.

**To turn it on**: Settings › Security › Turn on, confirm your password, scan the QR code, enter the code. Save the ten **backup codes** somewhere safe; each signs you in once if you lose your phone. You can make new ones any time (the old ones stop working).

If you sign in with Google, use two-step verification in your Google account instead.

**Signed-in devices** lists every browser signed in to your account. Sign out any one, or everywhere else. A signed-out device can keep working for up to 5 minutes.

**Activity** shows sign-ins, security changes, exchange connections, copies and orders, so anything unexpected stands out.` },
  },
  {
    slug: 'your-data', section: 'Account and security', title: 'Your data: export and delete', summary: 'Download everything, or delete your account for good.',
    related: ['two-factor'],
    body: { en: `**Download your data** (Settings › Your data) gives you one JSON file with everything stored for your account: trades, journal, strategies and runs, alerts, exchange orders, copies, settings and activity. Exchange keys, broker passwords and other secrets are left out.

**Delete your account** removes your account and all its data for good, and wipes your exchange keys. We email a 6-digit code to confirm. You have to stop anything still running first: people copying you, your own copies, and live strategies. Open positions on your exchange are not touched; close them there if you want to.` },
  },
  {
    slug: 'plans', section: 'Account and security', title: 'Plans and limits', summary: 'Everything is free for now; these are the limits everyone has.',
    body: { en: `TRADElogs is free while it's new. Every feature is included, with a few limits so the service stays fast for everyone: for example two MT5 accounts, 100 strategies, ten strategies running at once and 50 indicator alerts.

**Settings › Profile › Plan** shows each limit and how much of it you use. If you need more, write to us from the Help page.` },
  },
];

export const docBySlug = (slug: string) => DOCS.find((d) => d.slug === slug);

/** Simple search over titles, summaries and text: every word must appear. */
export function searchDocs(q: string, lang: Lang = 'en'): DocArticle[] {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return DOCS;
  return DOCS
    .map((d) => {
      const hay = `${d.title} ${d.summary} ${d.body[lang]}`.toLowerCase();
      const title = `${d.title} ${d.summary}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return null;
      return { d, score: words.reduce((s, w) => s + (title.includes(w) ? 3 : 1), 0) };
    })
    .filter((x): x is { d: DocArticle; score: number } => !!x)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.d);
}
