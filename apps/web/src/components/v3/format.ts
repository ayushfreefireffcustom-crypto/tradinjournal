// Shared number / time formatting for v3 pages. Money uses a real minus (−).
export const money = (v: number, d = 2) =>
  `${v >= 0 ? '+' : '−'}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
export const moneyShort = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1e6 ? `${(a / 1e6).toFixed(2)}M` : a >= 1e4 ? `${(a / 1e3).toFixed(1)}k` : a.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return `${v >= 0 ? '+' : '−'}$${s}`;
};
export const plain = (v: number, d = 2) => `$${v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
export function dur(s: number | null | undefined) {
  if (s == null) return '—';
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
  return `${(s / 86400).toFixed(1)}d`;
}
/** Very short signed amount for tight cells: +538, −1.2k. */
export const compact = (v: number) => { const a = Math.abs(v); return `${v >= 0 ? '+' : '−'}${a >= 1000 ? `${(a / 1000).toFixed(1)}k` : Math.round(a)}`; };
export const tone = (v: number) => (v > 0 ? 'lg' : v < 0 ? 'sh' : '');


/** Price with precision suited to its magnitude (FX 5dp … BTC 0dp), grouped. */
export function price(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v) || v === 0) return '—';
  const a = Math.abs(v);
  const d = a < 10 ? 5 : a < 1000 ? 3 : a < 20000 ? 1 : a < 50000 ? 2 : 0;
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** "Oct 15 14:02" in the viewer's locale clock. */
export function stamp(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
