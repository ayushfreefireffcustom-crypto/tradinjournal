// Stop / target levels of a position (POST / DELETE /api/trade-data/levels) and
// the pure helpers the editor uses. Types mirror
// packages/contracts/src/schema/trade-data.ts — keep them in step.
// Mock mode has no /data route for this: Playwright supplies route mocks.

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const PREFIX = USE_MOCKS ? '/data' : '/api';
const API = USE_MOCKS ? '' : (process.env.NEXT_PUBLIC_API_URL || '');

export type LevelSource = 'bridge' | 'order' | 'exchange' | 'user' | 'plan';
export type StopMove = 'widened' | 'tightened';
export interface LevelRowDTO { id: string; sl: number | null; tp: number | null; source: LevelSource; at: string; mine: boolean }
export interface PositionLevelsDTO {
  available: boolean;
  stop: number | null;
  stopSource: LevelSource | null;
  target: number | null;
  targetSource: LevelSource | null;
  current: { sl: number | null; tp: number | null };
  move: StopMove | null;
  history: LevelRowDTO[];
}

async function call<T>(method: 'POST' | 'DELETE', body: unknown): Promise<T> {
  const res = await fetch(`${API}${PREFIX}/trade-data/levels`, {
    method,
    ...(USE_MOCKS ? {} : { credentials: 'include' as const }),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message ?? `Request failed: ${res.status}`);
  return json.data as T;
}

export const tradeDataApi = {
  add: (accountId: string, positionId: string, v: { sl?: number | null; tp?: number | null }, source: 'user' | 'plan' = 'user') =>
    call<{ levels: PositionLevelsDTO }>('POST', { accountId, positionId, sl: v.sl ?? null, tp: v.tp ?? null, source }),
  remove: (accountId: string, id: string) => call<{ levels: PositionLevelsDTO }>('DELETE', { accountId, id }),
};

/** Where a level came from, in a few words. */
export const SOURCE_LABEL: Record<LevelSource, string> = {
  bridge: 'from MT5', order: 'MT5 order', exchange: 'from the exchange', user: 'added by you', plan: 'from your plan',
};

/** Same rules as the API (trade-data/levels.ts levelError). */
export function levelError(side: 'LONG' | 'SHORT', entry: number, sl: number | null, tp: number | null, hasStop: boolean): string | null {
  if (sl == null && tp == null) return 'Add a stop or a target';
  const long = side === 'LONG';
  if (sl != null && !hasStop && (long ? sl >= entry : sl <= entry)) return `Stop goes ${long ? 'below' : 'above'} the entry`;
  if (tp != null && (long ? tp <= entry : tp >= entry)) return `Target goes ${long ? 'above' : 'below'} the entry`;
  if (sl != null && tp != null && (long ? sl >= tp : sl <= tp)) return 'Stop and target are on the same side';
  return null;
}

/** "1,995.50" → 1995.5; blank → null; anything else → NaN. */
export function parsePrice(text: string): number | null {
  const t = text.replace(/[,\s]/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}
