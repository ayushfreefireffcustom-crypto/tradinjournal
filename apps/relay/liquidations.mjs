// Realised liquidations, live. Two long-lived public WebSockets from this
// Singapore relay (the API in US East can't open them):
//   Binance USDⓈ-M  wss://fstream.binance.com/market/ws/!forceOrder@arr
//     (the routed "/market" base; the legacy /ws path connects but stays silent
//     for market streams since Binance split its futures sockets.) One snapshot per symbol per second at most (Binance drops the rest), so
//     its totals are a floor, not every fill.
//   Bybit v5        wss://stream.bybit.com/v5/public/linear  allLiquidation.<SYMBOL>
// Only the six big USDT perps are kept. Every liquidation is added to a
// one-minute bucket per coin; 24 hours of buckets are kept in memory (at most
// 1440 × 6), older ones are dropped. Nothing is stored on disk: a restart starts
// the window again, and `complete` says whether the window is fully covered.
//
// Side: a long position being liquidated is a SELL on Binance (`o.S`) and
// `S: "Buy"` on Bybit's allLiquidation ("Buy" = the long side was liquidated).
// Notional: Binance filled qty × average price (`z × ap`, falling back to
// `q × p`); Bybit `v × p`.

export const LIQ_COINS = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE'];
const SYMBOLS = new Map(LIQ_COINS.map((c) => [`${c}USDT`, c]));
export const BUCKET_MS = 60_000;
export const KEEP_MS = 24 * 3600_000;
/** A venue gap shorter than this still counts as covered (reconnects take seconds). */
const GAP_MS = 2 * 60_000;

export const BINANCE_URL = 'wss://fstream.binance.com/market/ws/!forceOrder@arr';
export const BYBIT_URL = 'wss://stream.bybit.com/v5/public/linear';

const num = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN);

/** Binance `forceOrder` event → { coin, side, usd, t } or null. */
export function parseBinance(msg) {
  const o = msg?.o;
  if (!o || msg.e !== 'forceOrder') return null;
  const coin = SYMBOLS.get(o.s);
  if (!coin) return null;
  const filled = num(o.z) * num(o.ap);
  const usd = filled > 0 ? filled : num(o.q) * num(o.p);
  const t = num(o.T) || num(msg.E);
  if (!(usd > 0) || !Number.isFinite(t)) return null;
  if (o.S !== 'SELL' && o.S !== 'BUY') return null;
  return { coin, side: o.S === 'SELL' ? 'long' : 'short', usd, t };
}

/** Bybit `allLiquidation.*` message → list of { coin, side, usd, t }. */
export function parseBybit(msg) {
  if (typeof msg?.topic !== 'string' || !msg.topic.startsWith('allLiquidation.') || !Array.isArray(msg.data)) return [];
  const out = [];
  for (const d of msg.data) {
    const coin = SYMBOLS.get(d?.s);
    const usd = num(d?.v) * num(d?.p);
    const t = num(d?.T) || num(msg.ts);
    if (!coin || !(usd > 0) || !Number.isFinite(t) || (d.S !== 'Buy' && d.S !== 'Sell')) continue;
    out.push({ coin, side: d.S === 'Buy' ? 'long' : 'short', usd, t });
  }
  return out;
}

/** Rolling one-minute buckets per coin, 24 hours, in memory. */
export function createLiquidationStore({ now = () => Date.now() } = {}) {
  /** coin → Map<minuteStart, bucket> (insertion order = time order for live data). */
  const byCoin = new Map(LIQ_COINS.map((c) => [c, new Map()]));
  /** coin → newest bucket start, so in-order adds never scan the map. */
  const newest = new Map();
  /** venue → { connected, coveredSince, lastSeen, events } */
  const venues = new Map();

  function prune(m, cutoff) {
    for (const t of m.keys()) {
      if (t >= cutoff) break;
      m.delete(t);
    }
  }

  function add(venue, ev) {
    const m = byCoin.get(ev.coin);
    if (!m) return false;
    const n = now();
    // Ignore stale or far-future timestamps (bad clocks, replays).
    if (ev.t < n - KEEP_MS || ev.t > n + 5 * 60_000) return false;
    const t = Math.floor(ev.t / BUCKET_MS) * BUCKET_MS;
    let b = m.get(t);
    if (!b) {
      b = { t, longUsd: 0, shortUsd: 0, count: 0 };
      // Keep the map ordered: a late event for an older minute re-sorts once.
      const last = newest.get(ev.coin);
      m.set(t, b);
      if (last == null || t > last) newest.set(ev.coin, t);
      else {
        const sorted = [...m.entries()].sort((a, c) => a[0] - c[0]);
        m.clear();
        for (const [k, v] of sorted) m.set(k, v);
      }
    }
    if (ev.side === 'long') b.longUsd += ev.usd;
    else b.shortUsd += ev.usd;
    b.count += 1;
    prune(m, Math.floor((n - KEEP_MS) / BUCKET_MS) * BUCKET_MS);
    const v = venues.get(venue);
    if (v) v.events += 1;
    return true;
  }

  function venueState(venue) {
    let v = venues.get(venue);
    if (!v) { v = { connected: false, coveredSince: null, lastSeen: null, events: 0, downAt: null }; venues.set(venue, v); }
    return v;
  }

  /** A venue's socket opened (subscribed). Coverage continues across short gaps. */
  function up(venue) {
    const v = venueState(venue);
    const n = now();
    if (v.coveredSince == null || v.downAt == null || n - v.downAt > GAP_MS) v.coveredSince = n;
    v.connected = true;
    v.downAt = null;
    v.lastSeen = n;
  }
  function down(venue) {
    const v = venueState(venue);
    if (v.connected) v.downAt = now();
    v.connected = false;
  }
  function seen(venue) {
    venueState(venue).lastSeen = now();
  }

  /** Start of continuous coverage for a venue right now, or null. */
  function covered(v, n) {
    if (v.coveredSince == null) return null;
    if (!v.connected && (v.downAt == null || n - v.downAt > GAP_MS)) return null;
    return v.coveredSince;
  }

  /**
   * Totals for one coin over the last `windowMin` minutes (1..1440). `complete`
   * is true when at least one venue has covered the whole window.
   */
  function recent(coin, windowMin, withBuckets = false) {
    const n = now();
    const from = n - windowMin * 60_000;
    const m = byCoin.get(coin);
    if (!m) return null;
    prune(m, Math.floor((n - KEEP_MS) / BUCKET_MS) * BUCKET_MS);
    let longUsd = 0, shortUsd = 0, count = 0;
    const buckets = [];
    for (const b of m.values()) {
      if (b.t + BUCKET_MS <= from) continue;
      longUsd += b.longUsd;
      shortUsd += b.shortUsd;
      count += b.count;
      if (withBuckets) buckets.push({ t: new Date(b.t).toISOString(), longUsd: Math.round(b.longUsd), shortUsd: Math.round(b.shortUsd) });
    }
    const total = longUsd + shortUsd;
    const venueOut = {};
    let earliest = null;
    for (const [name, v] of venues) {
      const since = covered(v, n);
      venueOut[name] = { connected: v.connected, coveredSince: since != null ? new Date(since).toISOString() : null, lastSeen: v.lastSeen != null ? new Date(v.lastSeen).toISOString() : null };
      if (since != null && (earliest == null || since < earliest)) earliest = since;
    }
    return {
      coin,
      windowMin,
      from: new Date(from).toISOString(),
      to: new Date(n).toISOString(),
      totalUsd: Math.round(total),
      longUsd: Math.round(longUsd),
      shortUsd: Math.round(shortUsd),
      longShare: total > 0 ? Math.round((longUsd / total) * 1000) / 1000 : null,
      count,
      complete: earliest != null && earliest <= from,
      coveredMin: earliest != null ? Math.floor((n - earliest) / 60_000) : 0,
      venues: venueOut,
      ...(withBuckets ? { buckets } : {}),
    };
  }

  /** Buckets held across coins (after dropping expired ones). */
  function size() {
    const cutoff = Math.floor((now() - KEEP_MS) / BUCKET_MS) * BUCKET_MS;
    let total = 0;
    for (const m of byCoin.values()) { prune(m, cutoff); total += m.size; }
    return total;
  }

  return { add, up, down, seen, recent, size };
}

/**
 * One self-healing WebSocket: reconnects with exponential backoff (1 s → 60 s,
 * jittered, reset after a minute of healthy connection), sends an app-level
 * ping on an interval when the venue wants one, and treats silence longer than
 * `idleMs` as a dead socket.
 */
export function createFeed({
  name,
  url,
  WebSocketImpl = globalThis.WebSocket,
  onOpen = () => {},
  onMessage = () => {},
  onUp = () => {},
  onDown = () => {},
  pingMs = 0,
  ping = null,
  idleMs = 90_000,
  log = console,
  timers = { setTimeout, clearTimeout, setInterval, clearInterval },
  now = () => Date.now(),
  random = Math.random,
}) {
  let ws = null;
  let stopped = false;
  let attempt = 0;
  let openedAt = 0;
  let lastMsg = 0;
  let pingTimer = null;
  let watchTimer = null;
  let retryTimer = null;

  function clear() {
    if (pingTimer) timers.clearInterval(pingTimer);
    if (watchTimer) timers.clearInterval(watchTimer);
    pingTimer = watchTimer = null;
  }

  function schedule() {
    if (stopped || retryTimer) return;
    // Healthy for a minute before dropping: start the backoff again.
    if (openedAt && now() - openedAt > 60_000) attempt = 0;
    const base = Math.min(60_000, 1_000 * 2 ** attempt);
    attempt += 1;
    const wait = Math.round(base * (0.5 + random() * 0.5));
    retryTimer = timers.setTimeout(() => { retryTimer = null; connect(); }, wait);
  }

  function drop(reason) {
    if (!ws) return;
    const s = ws;
    ws = null;
    clear();
    onDown();
    log.warn(`[relay] ${name} socket down: ${reason}`);
    try { s.close(); } catch { /* already closed */ }
    schedule();
  }

  function connect() {
    if (stopped) return;
    let s;
    try {
      s = new WebSocketImpl(url);
    } catch (e) {
      log.warn(`[relay] ${name} connect failed: ${e?.message ?? e}`);
      schedule();
      return;
    }
    ws = s;
    s.onopen = () => {
      if (ws !== s) return;
      openedAt = now();
      lastMsg = now();
      log.log(`[relay] ${name} connected`);
      try { onOpen(s); } catch (e) { log.warn(`[relay] ${name} onOpen: ${e?.message ?? e}`); }
      onUp();
      if (pingMs > 0 && ping) pingTimer = timers.setInterval(() => { try { s.send(ping()); } catch { /* drop below */ } }, pingMs);
      watchTimer = timers.setInterval(() => { if (now() - lastMsg > idleMs) drop(`silent ${Math.round((now() - lastMsg) / 1000)}s`); }, Math.min(idleMs, 15_000));
    };
    s.onmessage = (ev) => {
      if (ws !== s) return;
      lastMsg = now();
      let msg;
      try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString()); } catch { return; }
      try { onMessage(msg); } catch (e) { log.warn(`[relay] ${name} message: ${e?.message ?? e}`); }
    };
    s.onerror = () => { if (ws === s) drop('error'); };
    s.onclose = (ev) => { if (ws === s) drop(`closed ${ev?.code ?? ''}`.trim()); };
  }

  return {
    start() { stopped = false; connect(); },
    stop() {
      stopped = true;
      if (retryTimer) timers.clearTimeout(retryTimer);
      retryTimer = null;
      const s = ws;
      ws = null;
      clear();
      if (s) { onDown(); try { s.close(); } catch { /* ignore */ } }
    },
    get connected() { return ws != null && openedAt > 0; },
  };
}

/** Both venues feeding one store. */
export function startLiquidationFeeds(store, opts = {}) {
  const binance = createFeed({
    name: 'binance liquidations',
    url: BINANCE_URL,
    // Binance pings at the protocol level (the client answers by itself); the
    // all-market stream is busy, so 10 silent minutes means a dead socket.
    idleMs: 10 * 60_000,
    onUp: () => store.up('binance'),
    onDown: () => store.down('binance'),
    onMessage: (msg) => {
      store.seen('binance');
      const ev = parseBinance(msg);
      if (ev) store.add('binance', ev);
    },
    ...opts,
  });
  const bybit = createFeed({
    name: 'bybit liquidations',
    url: BYBIT_URL,
    // Bybit wants a ping every 20 s; its pong keeps the watchdog fed.
    pingMs: 20_000,
    ping: () => JSON.stringify({ op: 'ping' }),
    idleMs: 60_000,
    onOpen: (s) => s.send(JSON.stringify({ op: 'subscribe', args: LIQ_COINS.map((c) => `allLiquidation.${c}USDT`) })),
    onUp: () => store.up('bybit'),
    onDown: () => store.down('bybit'),
    onMessage: (msg) => {
      store.seen('bybit');
      if (msg?.op === 'subscribe' && msg.success === false) (opts.log ?? console).warn(`[relay] bybit subscribe refused: ${msg.ret_msg}`);
      for (const ev of parseBybit(msg)) store.add('bybit', ev);
    },
    ...opts,
  });
  binance.start();
  bybit.start();
  return { binance, bybit, stop: () => { binance.stop(); bybit.stop(); } };
}

/** `?coin=BTC&window=60` (minutes, or 1h / 24h) → { coin, windowMin } or an error string. */
export function parseRecentQuery(search) {
  const q = new URLSearchParams(search);
  const coin = (q.get('coin') ?? 'BTC').toUpperCase();
  if (!LIQ_COINS.includes(coin)) return { error: 'unknown coin' };
  const raw = (q.get('window') ?? '60').toLowerCase();
  const m = /^(\d+)(m|h)?$/.exec(raw);
  if (!m) return { error: 'bad window' };
  const windowMin = Number(m[1]) * (m[2] === 'h' ? 60 : 1);
  if (!(windowMin >= 1 && windowMin <= 1440)) return { error: 'window must be 1..1440 minutes' };
  return { coin, windowMin, buckets: q.get('buckets') === '1' || windowMin > 60 };
}
