import type { Deal, Trade } from '@tradinjournal/types';
import type { LevelRow } from '../levels.js';

export const M = 60_000, H = 3_600_000, D = 86_400_000;
export const MON = Date.UTC(2026, 10, 2); // Mon 2 Nov 2026 00:00 UTC
let seq = 5000;
const iso = (ms: number) => new Date(ms).toISOString();

export function lv(p: Partial<LevelRow> & { at: number }): LevelRow {
  return { id: `l${++seq}`, sl: null, tp: null, source: 'bridge', observedAt: p.at, ...p };
}

/** A position whose P&L matches `pv` money per point per lot (default gold: 100). */
export function pos(p: { open: number; hold?: number; net?: number; side?: 'LONG' | 'SHORT'; symbol?: string; volume?: number; entry?: number; open_?: boolean; pv?: number; id?: string }): Trade {
  const id = p.id ?? String(++seq);
  const side = p.side ?? 'LONG', vol = p.volume ?? 1, entry = p.entry ?? 2000, net = p.net ?? 10, pv = p.pv ?? 100;
  const exit = entry + (side === 'LONG' ? 1 : -1) * (net / (vol * pv));
  const close = p.open + (p.hold ?? 30 * M);
  const sym = p.symbol ?? 'XAUUSD';
  const d = (q: Partial<Deal> & { entry: Deal['entry']; dealTime: string }): Deal => ({
    dealTicket: String(++seq), orderTicket: '', positionId: id, symbol: sym, type: 'BUY', volume: String(vol), price: '0', profit: '0', commission: '0', swap: '0', fee: '0', comment: '', ...q,
  });
  const inD = d({ type: side === 'LONG' ? 'BUY' : 'SELL', entry: 'IN', dealTime: iso(p.open), price: String(entry) });
  const outD = d({ type: side === 'LONG' ? 'SELL' : 'BUY', entry: 'OUT', dealTime: iso(close), price: String(exit), profit: String(net) });
  return {
    positionId: id, symbol: sym, direction: side, status: p.open_ ? 'OPEN' : 'CLOSED', openTime: iso(p.open), closeTime: p.open_ ? null : iso(close),
    entryPrice: entry, exitPrice: p.open_ ? null : exit, volume: vol, grossPnl: p.open_ ? 0 : net, commission: 0, swap: 0, netPnl: p.open_ ? 0 : net,
    durationSecs: p.open_ ? null : Math.round((close - p.open) / 1000), deals: p.open_ ? [inD] : [inD, outD],
  };
}
