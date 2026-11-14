// Formatting and chart-scale helpers for Dashboard v2. Pure; unit-tested.
import type { AiLine } from './dashboard-v2-api';

const MINUS = '−';
const sign = (v: number, plus: boolean) => (v < 0 ? MINUS : plus && v > 0 ? '+' : '');

/** +$9,308 · −$2,601 · $34,308 (plus = false). */
export function money(v: number, { plus = true, dec = 0 }: { plus?: boolean; dec?: number } = {}): string {
  const a = Math.abs(v);
  const r = Number(a.toFixed(dec));
  return `${r === 0 ? '' : sign(v, plus)}$${r.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
}
/** +$4.7k · −$570 · +$13.2k · +$1.2M */
export function kmoney(v: number, { plus = true }: { plus?: boolean } = {}): string {
  const a = Math.abs(v);
  const s = a >= 999_500 ? `${(a / 1e6).toFixed(1)}M` : a >= 1000 ? `${(a / 1000).toFixed(1)}k` : `${Math.round(a)}`;
  return `${Math.round(a) === 0 ? '' : sign(v, plus)}$${s}`;
}
/** 0.372 → 37.2% */
export const pct = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`;
/** Signed percent from a fraction: −8.1% */
export const spct = (v: number, d = 1) => `${sign(v, true)}${Math.abs(v * 100).toFixed(d)}%`;
/** +0.29R */
export const rfmt = (v: number, d = 2) => `${sign(v, true)}${Math.abs(v).toFixed(d)}R`;
export const tone = (v: number | null | undefined) => (v == null || v === 0 ? '' : v > 0 ? 'up' : 'dn');

export function fmtAi(l: AiLine): string {
  if (l.value == null) return '';
  switch (l.fmt) {
    case 'money': return money(l.value);
    case 'pct': return pct(l.value);
    case 'r': return rfmt(l.value);
    case 'int': return String(Math.round(l.value));
    default: return String(l.value);
  }
}

/** Round tick values between min and max (about n of them). */
export function ticks(min: number, max: number, n = 4): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/** Linear scale. */
export const scale = (d0: number, d1: number, r0: number, r1: number) => (v: number) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);

/** SVG path through points. */
export const path = (pts: Array<[number, number]>) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');

/** Short axis money: 35k, 1.2k, 500, −2k */
export function axisMoney(v: number): string {
  const a = Math.abs(v);
  const s = a >= 1e6 ? `${+(a / 1e6).toFixed(1)}M` : a >= 1000 ? `${+(a / 1000).toFixed(1)}k` : `${Math.round(a)}`;
  return `${v < 0 ? MINUS : ''}${s}`;
}

/** The next weekday after `now` (UTC): "Mon 16 Nov". */
export function nextSession(now: number): string {
  const d = new Date(now);
  do d.setUTCDate(d.getUTCDate() + 1); while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const SESSION_SHORT = { ASIA: 'Asia', LONDON: 'London', NY: 'NY' } as const;
export const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const hhmm = (iso: string) => new Date(iso).toISOString().slice(11, 16);

/** Keep the first paragraph of a coach reply, at most `max` characters, cut at a word. */
export function firstParagraph(text: string, max = 420): string {
  const p = text.trim().split(/\n\s*\n/)[0]!.replace(/[#*_`>]/g, '').replace(/\s+/g, ' ').trim();
  if (p.length <= max) return p;
  const cut = p.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 40))}…`;
}
