import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  BYBIT_URL,
  createFeed,
  createLiquidationStore,
  parseBinance,
  parseBybit,
  parseRecentQuery,
  startLiquidationFeeds,
} from './liquidations.mjs';
import { handler } from './server.mjs';

const T0 = Date.UTC(2026, 10, 14, 12, 0, 0);

/** Manual clock + timers so backoff and watchdogs run without waiting. */
function fakeTime(start = T0) {
  let t = start;
  let id = 0;
  const jobs = new Map();
  const timers = {
    setTimeout: (fn, ms) => { jobs.set(++id, { fn, at: t + ms, every: 0 }); return id; },
    clearTimeout: (i) => jobs.delete(i),
    setInterval: (fn, ms) => { jobs.set(++id, { fn, at: t + ms, every: ms }); return id; },
    clearInterval: (i) => jobs.delete(i),
  };
  function advance(ms) {
    const end = t + ms;
    for (;;) {
      let next = null;
      for (const [k, j] of jobs) if (j.at <= end && (!next || j.at < next[1].at)) next = [k, j];
      if (!next) break;
      const [k, j] = next;
      t = j.at;
      if (j.every) j.at += j.every; else jobs.delete(k);
      j.fn();
    }
    t = end;
  }
  return { now: () => t, timers, advance, pending: () => jobs.size };
}

/** Fake WebSocket class that records instances; tests drive open/message/close. */
function fakeSockets() {
  const made = [];
  class FakeWS {
    constructor(url) { this.url = url; this.sent = []; this.closed = false; made.push(this); }
    send(d) { this.sent.push(d); }
    close() { this.closed = true; }
    open() { this.onopen?.(); }
    msg(obj) { this.onmessage?.({ data: JSON.stringify(obj) }); }
    fail() { this.onclose?.({ code: 1006 }); }
  }
  return { FakeWS, made };
}
const quiet = { log() {}, warn() {} };

const bnForce = (s, side, q, ap, T) => ({ e: 'forceOrder', E: T + 5, o: { s, S: side, o: 'LIMIT', f: 'IOC', q: String(q), p: String(ap * 0.99), ap: String(ap), X: 'FILLED', l: String(q), z: String(q), T } });
const byLiq = (s, side, v, p, T) => ({ topic: `allLiquidation.${s}`, type: 'snapshot', ts: T + 3, data: [{ T, s, S: side, v: String(v), p: String(p) }] });

test('parses Binance forceOrder: SELL = long liquidated, notional from fills', () => {
  assert.deepEqual(parseBinance(bnForce('BTCUSDT', 'SELL', 0.5, 60_000, T0)), { coin: 'BTC', side: 'long', usd: 30_000, t: T0 });
  assert.equal(parseBinance(bnForce('BTCUSDT', 'BUY', 1, 100, T0)).side, 'short');
  // Not filled yet: falls back to order qty × price.
  const m = bnForce('ETHUSDT', 'SELL', 2, 3000, T0);
  m.o.z = '0';
  assert.equal(parseBinance(m).usd, 2 * 2970);
  assert.equal(parseBinance(bnForce('PEPEUSDT', 'SELL', 1, 1, T0)), null);
  assert.equal(parseBinance({ e: 'aggTrade' }), null);
  assert.equal(parseBinance(null), null);
});

test('parses Bybit allLiquidation: Buy = long liquidated', () => {
  assert.deepEqual(parseBybit(byLiq('SOLUSDT', 'Buy', 10, 150, T0)), [{ coin: 'SOL', side: 'long', usd: 1500, t: T0 }]);
  assert.equal(parseBybit(byLiq('SOLUSDT', 'Sell', 10, 150, T0))[0].side, 'short');
  assert.deepEqual(parseBybit(byLiq('WIFUSDT', 'Buy', 1, 1, T0)), []);
  assert.deepEqual(parseBybit({ op: 'pong' }), []);
});

test('store buckets by minute, sums sides, keeps 24h and reports coverage', () => {
  const clock = fakeTime();
  const store = createLiquidationStore({ now: clock.now });
  store.up('binance');
  clock.advance(61 * 60_000);
  const n = clock.now();
  store.add('binance', { coin: 'BTC', side: 'long', usd: 3_000_000, t: n - 10 * 60_000 });
  store.add('binance', { coin: 'BTC', side: 'short', usd: 1_000_000, t: n - 10 * 60_000 + 5_000 });
  store.add('binance', { coin: 'BTC', side: 'long', usd: 500_000, t: n - 90 * 60_000 }); // outside the hour
  store.add('binance', { coin: 'ETH', side: 'long', usd: 7, t: n });
  const r = store.recent('BTC', 60, true);
  assert.equal(r.totalUsd, 4_000_000);
  assert.equal(r.longUsd, 3_000_000);
  assert.equal(r.longShare, 0.75);
  assert.equal(r.count, 2);
  assert.equal(r.buckets.length, 1);
  assert.equal(r.complete, true);
  assert.equal(r.venues.binance.connected, true);
  const day = store.recent('BTC', 1440, true);
  assert.equal(day.totalUsd, 4_500_000);
  assert.equal(day.complete, false); // only 61 minutes of coverage
  assert.deepEqual(day.buckets.map((b) => b.t), [...day.buckets.map((b) => b.t)].sort());
  // Old buckets fall out after 24 hours; the map stays bounded.
  clock.advance(24 * 3600_000 + 60_000);
  assert.equal(store.recent('BTC', 1440).totalUsd, 0);
  assert.equal(store.size(), 0);
  // Events older than the window or from the future are ignored.
  assert.equal(store.add('bybit', { coin: 'BTC', side: 'long', usd: 1, t: clock.now() - 25 * 3600_000 }), false);
  assert.equal(store.add('bybit', { coin: 'BTC', side: 'long', usd: 1, t: clock.now() + 3600_000 }), false);
});

test('a late event for an earlier minute keeps buckets in order', () => {
  const clock = fakeTime();
  const store = createLiquidationStore({ now: clock.now });
  clock.advance(10 * 60_000);
  store.add('bybit', { coin: 'XRP', side: 'long', usd: 10, t: clock.now() - 60_000 });
  store.add('bybit', { coin: 'XRP', side: 'long', usd: 20, t: clock.now() - 5 * 60_000 });
  store.add('bybit', { coin: 'XRP', side: 'short', usd: 5, t: clock.now() });
  const b = store.recent('XRP', 60, true).buckets;
  assert.deepEqual(b.map((x) => x.longUsd + x.shortUsd), [20, 10, 5]);
});

test('no coverage until a venue connects; long gaps restart coverage, short ones do not', () => {
  const clock = fakeTime();
  const store = createLiquidationStore({ now: clock.now });
  assert.equal(store.recent('BTC', 60).complete, false);
  assert.equal(store.recent('BTC', 60).longShare, null);
  store.up('bybit');
  clock.advance(30 * 60_000);
  store.down('bybit');
  clock.advance(30_000);
  store.up('bybit'); // 30 s gap: still the same coverage
  clock.advance(31 * 60_000);
  assert.equal(store.recent('BTC', 60).complete, true);
  store.down('bybit');
  clock.advance(5 * 60_000);
  assert.equal(store.recent('BTC', 60).complete, false); // down for 5 min: no coverage
  store.up('bybit');
  assert.equal(store.recent('BTC', 60).coveredMin, 0);
});

test('feed reconnects with growing, capped backoff and resets after a healthy minute', () => {
  const clock = fakeTime();
  const { FakeWS, made } = fakeSockets();
  let ups = 0, downs = 0;
  const feed = createFeed({ name: 't', url: 'wss://x', WebSocketImpl: FakeWS, timers: clock.timers, now: clock.now, random: () => 1, log: quiet, onUp: () => ups++, onDown: () => downs++ });
  feed.start();
  assert.equal(made.length, 1);
  made[0].fail(); // never opened
  assert.equal(downs, 1);
  clock.advance(999);
  assert.equal(made.length, 1);
  clock.advance(1);
  assert.equal(made.length, 2); // 1 s
  made[1].fail();
  clock.advance(2000);
  assert.equal(made.length, 3); // 2 s
  for (let i = 0; i < 8; i++) { made.at(-1).fail(); clock.advance(60_000); }
  assert.equal(made.length, 11); // capped at 60 s
  made.at(-1).open();
  assert.equal(ups, 1);
  assert.equal(feed.connected, true);
  clock.advance(61_000);
  made.at(-1).msg({ hello: 1 });
  made.at(-1).fail();
  clock.advance(1000);
  assert.equal(made.length, 12); // healthy for a minute → back to 1 s
  feed.stop();
  clock.advance(120_000);
  assert.equal(made.length, 12);
  assert.equal(clock.pending(), 0);
});

test('watchdog drops a silent socket; pings keep it alive', () => {
  const clock = fakeTime();
  const { FakeWS, made } = fakeSockets();
  const feed = createFeed({ name: 't', url: 'wss://x', WebSocketImpl: FakeWS, timers: clock.timers, now: clock.now, random: () => 0, log: quiet, idleMs: 60_000, pingMs: 20_000, ping: () => '{"op":"ping"}' });
  feed.start();
  made[0].open();
  clock.advance(20_000);
  assert.deepEqual(made[0].sent, ['{"op":"ping"}']);
  made[0].msg({ op: 'pong' });
  clock.advance(50_000);
  assert.equal(made[0].closed, false);
  clock.advance(30_000); // 80 s since the pong
  assert.equal(made[0].closed, true);
  clock.advance(1000);
  assert.equal(made.length, 2);
  feed.stop();
});

test('both venues feed one store: Bybit subscribes to the six perps', () => {
  const clock = fakeTime();
  const { FakeWS, made } = fakeSockets();
  const store = createLiquidationStore({ now: clock.now });
  const feeds = startLiquidationFeeds(store, { WebSocketImpl: FakeWS, timers: clock.timers, now: clock.now, log: quiet });
  const bn = made.find((s) => s.url.includes('binance'));
  const bb = made.find((s) => s.url === BYBIT_URL);
  bn.open();
  bb.open();
  assert.deepEqual(JSON.parse(bb.sent[0]), { op: 'subscribe', args: ['allLiquidation.BTCUSDT', 'allLiquidation.ETHUSDT', 'allLiquidation.SOLUSDT', 'allLiquidation.XRPUSDT', 'allLiquidation.BNBUSDT', 'allLiquidation.DOGEUSDT'] });
  bn.msg(bnForce('BTCUSDT', 'SELL', 1, 60_000, clock.now()));
  bb.msg(byLiq('BTCUSDT', 'Sell', 0.5, 60_000, clock.now()));
  bb.msg({ success: true, ret_msg: 'pong', op: 'ping' });
  const r = store.recent('BTC', 60);
  assert.equal(r.totalUsd, 90_000);
  assert.equal(r.longShare, 0.667);
  assert.deepEqual(Object.keys(r.venues).sort(), ['binance', 'bybit']);
  feeds.stop();
  assert.equal(store.recent('BTC', 60).venues.bybit.connected, false);
});

test('query: coin and window validation', () => {
  assert.deepEqual(parseRecentQuery('?coin=eth&window=1h'), { coin: 'ETH', windowMin: 60, buckets: false });
  assert.deepEqual(parseRecentQuery('?coin=BTC&window=24h'), { coin: 'BTC', windowMin: 1440, buckets: true });
  assert.deepEqual(parseRecentQuery(''), { coin: 'BTC', windowMin: 60, buckets: false });
  assert.ok(parseRecentQuery('?coin=PEPE').error);
  assert.ok(parseRecentQuery('?window=2000').error);
  assert.ok(parseRecentQuery('?window=abc').error);
});

test('route: token required, answers from the store, 503 when feeds are off', async () => {
  const token = 'x'.repeat(30);
  const store = createLiquidationStore();
  store.up('binance');
  store.add('binance', { coin: 'BTC', side: 'long', usd: 1000, t: Date.now() });
  const on = createServer(handler(token, { liquidations: store }));
  const off = createServer(handler(token));
  await Promise.all([on, off].map((s) => new Promise((r) => s.listen(0, r))));
  const url = (s, p) => `http://127.0.0.1:${s.address().port}${p}`;
  try {
    assert.equal((await fetch(url(on, '/liquidations/recent?coin=BTC'))).status, 401);
    const ok = await fetch(url(on, '/liquidations/recent?coin=BTC&window=60'), { headers: { 'x-relay-token': token } });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.totalUsd, 1000);
    assert.equal(body.complete, false);
    assert.equal((await fetch(url(on, '/liquidations/recent?coin=NOPE'), { headers: { 'x-relay-token': token } })).status, 400);
    assert.equal((await fetch(url(off, '/liquidations/recent'), { headers: { 'x-relay-token': token } })).status, 503);
  } finally {
    on.close();
    off.close();
  }
});
