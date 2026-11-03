// Compare (E13): line several symbols up on the same time buckets and rebase to
// 0 % at the first shared bucket. Only buckets every series has are used, so a
// market that's closed at weekends doesn't skew the others. Bars are bucketed
// rather than matched exactly because stocks open their bars at :30 (14:30 UTC)
// while crypto opens on the hour. Pure.
import type { Candle } from '@/lib/market-api';

export interface Compared {
  times: number[];
  /** Per symbol: % change from the first shared bar. */
  pct: number[][];
  stats: Array<{ ret: number | null; maxDd: number | null; vol: number | null; corrToFirst: number | null; vsFirst: number | null }>;
}

const std = (x: number[]) => { if (x.length < 2) return null; const m = x.reduce((s, v) => s + v, 0) / x.length; return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1)); };
function corr(a: number[], b: number[]) {
  if (a.length < 5) return null;
  const ma = a.reduce((s, v) => s + v, 0) / a.length;
  const mb = b.reduce((s, v) => s + v, 0) / b.length;
  let xy = 0, xx = 0, yy = 0;
  for (let i = 0; i < a.length; i++) { xy += (a[i]! - ma) * (b[i]! - mb); xx += (a[i]! - ma) ** 2; yy += (b[i]! - mb) ** 2; }
  return xx && yy ? xy / Math.sqrt(xx * yy) : null;
}

/** `bucketMs` is the bar length: each bar lands in the bucket its open falls in, the last close winning. */
export function compareSeries(series: Candle[][], bucketMs = 1): Compared {
  if (!series.length || series.some((s) => !s.length)) return { times: [], pct: series.map(() => []), stats: series.map(() => ({ ret: null, maxDd: null, vol: null, corrToFirst: null, vsFirst: null })) };
  const bucket = (t: number) => Math.floor(t / bucketMs) * bucketMs;
  const maps = series.map((s) => new Map([...s].sort((a, b) => a.openTime - b.openTime).map((c) => [bucket(c.openTime), c.close])));
  const times = [...maps[0]!.keys()].filter((t) => maps.every((m) => m.has(t))).sort((a, b) => a - b);
  const closes = maps.map((m) => times.map((t) => m.get(t)!));
  const pct = closes.map((c) => c.map((v) => (c[0]! > 0 ? (v / c[0]! - 1) * 100 : 0)));
  const rets = closes.map((c) => c.slice(1).map((v, i) => (c[i]! > 0 ? v / c[i]! - 1 : 0)));
  const stats = closes.map((c, k) => {
    if (c.length < 2) return { ret: null, maxDd: null, vol: null, corrToFirst: null, vsFirst: null };
    let peak = c[0]!;
    let dd = 0;
    for (const v of c) { peak = Math.max(peak, v); dd = Math.min(dd, (v / peak - 1) * 100); }
    const s = std(rets[k]!);
    const ret = pct[k]!.at(-1)!;
    return { ret, maxDd: dd, vol: s == null ? null : s * 100, corrToFirst: k === 0 ? 1 : corr(rets[0]!, rets[k]!), vsFirst: k === 0 ? 0 : ret - pct[0]!.at(-1)! };
  });
  return { times, pct, stats };
}

/** CSV of the rebased series, one row per shared bar. */
export function compareCsv(symbols: string[], c: Compared): string {
  const head = ['time', ...symbols.map((s) => `${s} %`)].join(',');
  const rows = c.times.map((t, i) => [new Date(t).toISOString(), ...c.pct.map((p) => p[i]!.toFixed(4))].join(','));
  return [head, ...rows].join('\n');
}
