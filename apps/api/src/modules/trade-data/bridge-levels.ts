// Stop / target levels from the MT5 bridge, written during trade sync:
//
//   'order'  — the opening order's sl/tp on entry IN deals (/deals, newer
//              bridges). Observed at the deal time: the stop at entry. One per
//              position; never re-written.
//   'bridge' — a snapshot of each open position (/positions, newer bridges),
//              observed at the position's last modification (else now). Only
//              written when the stop or target differs from the position's
//              latest row, so an unchanged stop never adds rows.
//
// Older bridges don't send the fields: nothing is written and the sync is
// unchanged. Failures here never fail the sync.
import type { DealWithLevels } from '../../lib/broker-connector.js';
import { changed, sortLevels, type LevelRow } from './levels.js';
import { insertLevels, levelsByPosition, type NewLevel } from './store.js';

export interface PositionSnapshot { positionId: string; sl: number | null; tp: number | null; updatedAt: Date | null }

/** New rows to insert, given the deals just pulled, the open positions' snapshot and the stored rows. Pure. */
export function levelRowsFromSync(
  deals: DealWithLevels[], snapshot: PositionSnapshot[] | null, existing: Map<string, LevelRow[]>, now: Date,
): NewLevel[] {
  const out: NewLevel[] = [];
  const hasOrder = (pid: string) => (existing.get(pid) ?? []).some(r => r.source === 'order') || out.some(r => r.positionId === pid && r.source === 'order');
  for (const d of deals) {
    if (d.entry !== 'IN' || d.type === 'BALANCE' || !d.positionId || d.positionId === '0') continue;
    if (d.sl == null && d.tp == null) continue;
    if (hasOrder(d.positionId)) continue;
    out.push({ positionId: d.positionId, sl: d.sl ?? null, tp: d.tp ?? null, source: 'order', observedAt: new Date(d.dealTime) });
  }
  for (const p of snapshot ?? []) {
    if (!/^\d{1,19}$/.test(p.positionId)) continue;
    const rows = sortLevels([
      ...(existing.get(p.positionId) ?? []),
      ...out.filter(r => r.positionId === p.positionId).map((r, i) => ({ id: `new${i}`, sl: r.sl, tp: r.tp, source: r.source, observedAt: r.observedAt.getTime() })),
    ]);
    const last = rows.at(-1) ?? null;
    if (!changed(last, { sl: p.sl, tp: p.tp })) continue;
    // A modification time older than what we already have can't order after it: use now.
    const at = p.updatedAt && (!last || p.updatedAt.getTime() > last.observedAt) && p.updatedAt.getTime() <= now.getTime() ? p.updatedAt : now;
    out.push({ positionId: p.positionId, sl: p.sl, tp: p.tp, source: 'bridge', observedAt: at });
  }
  return out;
}

/** Store whatever the bridge told us. Returns the rows written (0 before the migration). */
export async function recordBridgeLevels(accountId: string, deals: DealWithLevels[], snapshot: PositionSnapshot[] | null, now = new Date()): Promise<number> {
  const carries = deals.some(d => d.sl != null || d.tp != null) || !!snapshot?.length;
  if (!carries) return 0;
  const ids = [...new Set([...deals.filter(d => d.sl != null || d.tp != null).map(d => d.positionId), ...(snapshot ?? []).map(p => p.positionId)])].filter(id => /^\d{1,19}$/.test(id));
  if (!ids.length) return 0;
  const existing = await levelsByPosition(accountId, ids);
  return insertLevels(accountId, levelRowsFromSync(deals, snapshot, existing, now));
}
