// Small symbol / journal / price helpers shared across pages (journal, calendar,
// trade log, trade review, markets, macro). Pure functions, no invented numbers.
// (The old "desk" dashboard derivations were removed with that dashboard.)

/** Rough market type for a broker symbol; '' when unsure. */
export function marketKind(symbol: string): string {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^(XAU|XAG|XPT|XPD|GOLD|SILVER)/.test(s)) return 'Metal';
  if (/^(BTC|ETH|SOL|XRP|LTC|DOGE|ADA|BNB)/.test(s)) return 'Crypto';
  if (/^(US30|US100|US500|NAS|SPX|SP500|DJ|DOW|GER|DE30|DE40|UK100|FTSE|JP225|NIKKEI|HK50|AUS200|FRA40|EU50|STOXX|USTEC|US2000)/.test(s)) return 'Index';
  if (/^(USOIL|UKOIL|WTI|BRENT|XTI|XBR|NGAS|NATGAS|OIL)/.test(s)) return 'Energy';
  if (/^[A-Z]{6}/.test(s) && /(USD|EUR|GBP|JPY|CHF|CAD|AUD|NZD|SGD|HKD|SEK|NOK|ZAR|MXN|TRY|CNH)/.test(s.slice(0, 6))) return 'FX';
  return '';
}

/** Short ticker for a 34px symbol tile. */
export function tickerMark(symbol: string): string {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^US30/.test(s)) return 'US30';
  if (/^(NAS|US100|USTEC)/.test(s)) return 'NAS';
  if (/^(SPX|US500|SP500)/.test(s)) return 'SPX';
  return s.slice(0, 3);
}

export type TagTone = 'g' | 'r' | 'n';
const GOOD = ['disciplined', 'confident', 'patient', 'followed plan', 'a+ setup', 'calm'];
const BAD = ['fomo', 'revenge', 'hesitant', 'moved stop', 'overtraded', 'greedy', 'fearful', 'tilt'];
export function tagTone(tag: string): TagTone {
  const t = tag.trim().toLowerCase();
  return GOOD.includes(t) ? 'g' : BAD.includes(t) ? 'r' : 'n';
}

/** Price with the precision the instrument needs (digits taken from the larger of two prices). */
export function fmtPrice(v: number | null | undefined, ref?: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const base = Math.max(Math.abs(v), Math.abs(ref ?? 0));
  const digits = base >= 1000 ? 2 : base >= 100 ? 3 : base >= 10 ? 4 : 5;
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
