// How a trade ended (QW.10), read from the comment MT5 writes on the closing
// deal: "[tp 1.08450]" for a take-profit, "[sl 1.08120]" for a stop-loss,
// "so: 48.2%/…" for a margin stop-out. Anything else was closed by hand or by
// an EA. (The deal's reason code isn't synced, so the comment is what we have.)
import type { Deal, Trade } from './api';

export type ExitReason = 'tp' | 'sl' | 'stopout' | 'other';

export const EXIT_LABEL: Record<ExitReason, string> = { tp: 'Take-profit', sl: 'Stop-loss', stopout: 'Stop-out', other: 'Manual / other' };
/** Short form for a table cell; "other" shows nothing. */
export const EXIT_SHORT: Record<ExitReason, string> = { tp: 'TP', sl: 'SL', stopout: 'Stop-out', other: '' };

export function exitReasonOfComment(comment: string | null | undefined): ExitReason {
  const c = (comment ?? '').trim();
  if (/^\[?\s*tp\b/i.test(c)) return 'tp';
  if (/^\[?\s*sl\b/i.test(c)) return 'sl';
  if (/^so\s*:|stop[\s-]?out/i.test(c)) return 'stopout';
  return 'other';
}

const CLOSING: Array<Deal['entry']> = ['OUT', 'OUT_BY', 'INOUT'];

/** The reason of the deal that closed the position; null while it's open or has no closing deal. */
export function exitReasonOf(t: Pick<Trade, 'status' | 'deals'>): ExitReason | null {
  if (t.status !== 'CLOSED') return null;
  const last = (t.deals ?? []).filter((d) => CLOSING.includes(d.entry)).sort((a, b) => (a.dealTime < b.dealTime ? -1 : a.dealTime > b.dealTime ? 1 : 0)).at(-1);
  return last ? exitReasonOfComment(last.comment) : null;
}
