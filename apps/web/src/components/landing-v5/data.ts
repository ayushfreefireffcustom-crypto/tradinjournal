// Deterministic demo data for the landing visuals. Generated once at module load
// from a seeded LCG, so server and client render byte-identical markup (no
// hydration mismatch) and the charts look the same on every visit.

let seed = 11;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// ── Chart replay: 46 candles with one highlighted long trade ────────────────
export type Candle = { o: number; c: number; h: number; l: number };

export const REPLAY_W = 640;
export const REPLAY_H = 320;
export const ENTRY_INDEX = 12;
export const EXIT_INDEX = 36;

export const candles: Candle[] = (() => {
  let p = 100;
  const out: Candle[] = [];
  for (let i = 0; i < 46; i++) {
    const o = p;
    p = p + (rand() - 0.42) * 6;
    const h = Math.max(o, p) + rand() * 3;
    const l = Math.min(o, p) - rand() * 3;
    out.push({ o, c: p, h, l });
  }
  return out;
})();

// ── Session heatmap: P&L intensity per weekday × hour (−1 … 1) ─────────────
export const HEAT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;

export const heat: number[][] = HEAT_DAYS.map((_, di) => {
  const row: number[] = [];
  for (let h = 0; h < 24; h++) {
    let v = 0;
    if (h >= 7 && h <= 10) v = 0.55 + rand() * 0.45;          // London open pays
    else if (h >= 13 && h <= 16) v = (rand() - 0.45) * 1.1;
    else if (h >= 1 && h <= 5) v = (rand() - 0.5) * 0.5;
    else v = rand() < 0.35 ? (rand() - 0.5) * 0.3 : 0;
    if (di === 4 && h >= 14) v = -(0.5 + rand() * 0.5);         // Friday afternoons bleed
    row.push(v);
  }
  return row;
});

export function heatColor(v: number): string {
  if (v > 0) return `rgba(8,196,101,${(0.15 + v * 0.85).toFixed(2)})`;
  if (v < 0) return `rgba(254,58,49,${(0.15 - v * 0.8).toFixed(2)})`;
  return '#141414';
}

/** Rough $ figure shown in the heatmap tooltip — illustrative, scaled from intensity. */
export const heatDollars = (v: number) => Math.round(v * 420);

// ── Tilt sequence: bar heights (%) and win/loss ─────────────────────────────
export const tilt: { h: number; win: boolean }[] = [40, 62, 30, 55, 70, 38, 48, 26, 66, 58, 90, 84, 100, 76].map((h, i) => ({
  h,
  win: i <= 8 && [1, 1, 0, 1, 1, 0, 1, 0, 1][i] === 1,
}));

// ── Behaviour traits ────────────────────────────────────────────────────────
export const traits = [
  { label: 'Discipline', value: 90 },
  { label: 'Patience', value: 78 },
  { label: 'Risk control', value: 84 },
  { label: 'Timing', value: 60, warn: true },
] as const;
