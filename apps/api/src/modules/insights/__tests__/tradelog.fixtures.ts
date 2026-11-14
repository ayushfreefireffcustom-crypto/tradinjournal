// Generated positions for trade log tests (and the Playwright route mocks).
// Deterministic for a seed. Test data only: never imported by app code.
import type { TlTrade } from '../tradelog.js';

const SYMBOLS: Array<[string, number, number]> = [
  // symbol, price, typical move per hour
  ['XAUUSD', 2650, 6], ['NAS100', 24900, 60], ['GBPJPY', 192.4, 0.25], ['US30', 43800, 70], ['BTCUSD', 88000, 400], ['EURUSD', 1.084, 0.0012],
];

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export interface GenOptions {
  n: number;
  seed?: number;
  /** Close time of the newest trade (ms). */
  end?: number;
  withR?: boolean;
  open?: number;
  longSymbol?: boolean;
}

export function genTrades({ n, seed = 7, end = Date.UTC(2026, 10, 13, 20), withR = true, open = 0, longSymbol = false }: GenOptions): TlTrade[] {
  const rnd = rng(seed);
  const out: TlTrade[] = [];
  // Spread ~2.7 trades per weekday backwards from `end`.
  let t = end - 6 * 3_600_000;
  for (let i = 0; i < n; i++) {
    const [symbol0, px, vol] = SYMBOLS[Math.floor(rnd() * SYMBOLS.length)]!;
    const symbol = longSymbol && i % 7 === 0 ? 'XAUUSD.micro-ecn-raw-spread-pro' : symbol0;
    const holdMin = Math.round(8 + rnd() * rnd() * 300);
    const close = t;
    const openMs = close - holdMin * 60_000;
    const side = rnd() < 0.55 ? 'LONG' : 'SHORT';
    const win = rnd() < 0.52;
    const r = win ? 0.3 + rnd() * 2.4 : -(0.2 + rnd() * (rnd() < 0.15 ? 1.6 : 0.85));
    const risk = 80 + Math.round(rnd() * 220);
    const volume = Math.round((0.2 + rnd() * 2.2 * (rnd() < 0.1 ? 2.5 : 1)) * 100) / 100;
    const commission = -Math.round(volume * 7 * 100) / 100;
    const swap = holdMin > 200 ? -Math.round(rnd() * 12 * 100) / 100 : 0;
    const gross = Math.round(r * risk * 100) / 100;
    const move = (vol * Math.sqrt(holdMin / 60) * (0.6 + rnd())) * (r >= 0 ? 1 : -1) * (side === 'LONG' ? 1 : -1);
    const entry = Math.round(px * (1 + (rnd() - 0.5) * 0.02) * 1e5) / 1e5;
    const exit = Math.round((entry + move) * 1e5) / 1e5;
    const hitSl = !win && rnd() < 0.4, hitTp = win && rnd() < 0.3;
    out.push({
      id: String(48_000_000 + n - i), symbol, side, status: 'CLOSED', open: openMs, close, volume, entry, exit,
      net: Math.round((gross + commission + swap) * 100) / 100, gross, commission, swap,
      r: withR ? Math.round(r * 100) / 100 : null, holdSecs: holdMin * 60,
      closeComment: hitSl ? `[sl ${exit}]` : hitTp ? `[tp ${exit}]` : '',
    });
    // Next (older) trade: 1–9 hours earlier, skipping weekends.
    t = openMs - (40 + Math.round(rnd() * 480)) * 60_000;
    const d = new Date(t).getUTCDay();
    if (d === 0) t -= 2 * 86_400_000; else if (d === 6) t -= 86_400_000;
  }
  // Some tilted days: two losses, then a bigger trade straight after that also loses.
  const asc = [...out].sort((a, b) => a.close! - b.close!);
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const lose = (t: TlTrade) => {
    if (t.net > 0) { t.gross = -Math.abs(t.gross) * 0.6; t.net = Math.round((t.gross + t.commission + t.swap) * 100) / 100; if (t.r != null) t.r = -Math.round(Math.abs(t.r) * 60) / 100 || -0.4; }
  };
  for (let i = 2; i < asc.length; i++) {
    const [a, b, c] = [asc[i - 2]!, asc[i - 1]!, asc[i]!];
    if (rnd() > 0.15 || day(a.close!) !== day(c.close!) || day(b.close!) !== day(c.close!)) continue;
    lose(a); lose(b);
    const hold = c.close! - c.open;
    c.open = b.close! + (3 + Math.round(rnd() * 9)) * 60_000;
    c.close = c.open + hold;
    c.volume = Math.round(c.volume * 2.6 * 100) / 100;
    c.gross = -Math.round((150 + rnd() * 300) * 100) / 100;
    c.net = Math.round((c.gross + c.commission + c.swap) * 100) / 100;
    if (c.r != null) c.r = -Math.round((1.3 + rnd() * 0.8) * 100) / 100;
    i += 2;
  }
  for (let k = 0; k < open; k++) {
    const [symbol, px] = SYMBOLS[k % SYMBOLS.length]!;
    out.push({
      id: String(49_000_000 + k), symbol, side: 'LONG', status: 'OPEN', open: end + (k + 1) * 600_000, close: null, volume: 0.5, entry: px,
      exit: null, net: -3.5, gross: 0, commission: -3.5, swap: 0, r: null, holdSecs: null, closeComment: null,
    });
  }
  return out;
}
