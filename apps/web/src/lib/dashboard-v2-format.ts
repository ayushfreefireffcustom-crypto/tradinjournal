// Formatting and chart-scale helpers for Dashboard v2. Pure; unit-tested.
import type { AiLine } from './dashboard-v2-api';

const MINUS = '−';
/** Below this a value shows as zero everywhere (0.00 at two decimals). */
export const ZERO_EPS = 0.005;
/** True when the value shows as 0 at two decimals: no sign and no colour. */
export const isFlat = (v: number | null | undefined) => v == null || !Number.isFinite(v) || Math.abs(v) < ZERO_EPS;
const sign = (v: number, plus: boolean) => (isFlat(v) ? '' : v < 0 ? MINUS : plus && v > 0 ? '+' : '');
/** Under 50¢ but not zero: whole dollars would read "$0", so show cents. */
const cents = (a: number) => a >= ZERO_EPS && a < 0.5;
/** No sign when the text shows zero. */
const zeroText = (s: string) => Number(s.replace(/[^0-9.]/g, '')) === 0;

/** +$9,308 · −$2,601 · $34,308 (plus = false) · −$0.08 (never "$0" for a non-zero value). */
export function money(v: number, { plus = true, dec = 0 }: { plus?: boolean; dec?: number } = {}): string {
  const a = Math.abs(v);
  const d = dec < 2 && cents(a) ? 2 : dec;
  const r = Number(a.toFixed(d));
  return `${r === 0 ? '' : sign(v, plus)}$${r.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}
/** +$4.7k · −$570 · +$13.2k · +$1.2M · −$0.08 */
export function kmoney(v: number, { plus = true }: { plus?: boolean } = {}): string {
  const a = Math.abs(v);
  const s = a >= 999_500 ? `${(a / 1e6).toFixed(1)}M` : a >= 1000 ? `${(a / 1000).toFixed(1)}k` : cents(a) ? a.toFixed(2) : `${Math.round(a)}`;
  return `${zeroText(s) ? '' : sign(v, plus)}$${s}`;
}
/** "1 trade", "3 trades", "1 loss", "2 losses" (many defaults to one + "s"). */
export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
/** 0.372 → 37.2% */
export const pct = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`;
/** Signed percent from a fraction: −8.1% (no sign when it shows as 0.0%). */
export const spct = (v: number, d = 1) => { const s = Math.abs(v * 100).toFixed(d); return `${zeroText(s) ? '' : sign(v, true)}${s}%`; };
/** +0.29R (no sign when it shows as 0.00R). */
export const rfmt = (v: number, d = 2) => { const s = Math.abs(v).toFixed(d); return `${zeroText(s) ? '' : sign(v, true)}${s}R`; };
/** Green / red class for a money or R value; a value that shows as 0 stays neutral. */
export const tone = (v: number | null | undefined) => (isFlat(v) ? '' : v! > 0 ? 'up' : 'dn');
/** The same rule for SVG colours: up, down, or `flat` when the value shows as 0. */
export const toneColor = (v: number, up: string, dn: string, flat = 'var(--mut)') => (isFlat(v) ? flat : v > 0 ? up : dn);

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
