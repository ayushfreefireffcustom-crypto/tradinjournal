// Pure position maths, ported unchanged from MirrorPip-X (it was correct and
// tested). Given a net position and a fill, returns the new position and the
// P&L realized on the reduced quantity. Money path: keep it pure and covered.

export type Dir = 'LONG' | 'SHORT';

export interface PosState {
  side: Dir;
  qty: number; // always positive
  avgEntry: number;
}

export interface FillResult {
  side: Dir;
  qty: number; // always positive; 0 = flat
  avgEntry: number;
  realizedDelta: number;
  closed: boolean;
}

export function applyFill(current: PosState | null, side: 'BUY' | 'SELL', qty: number, price: number, contractMultiplier = 1): FillResult {
  const signed = side === 'BUY' ? qty : -qty;

  if (!current || current.qty === 0) {
    return { side: signed >= 0 ? 'LONG' : 'SHORT', qty: Math.abs(signed), avgEntry: price, realizedDelta: 0, closed: false };
  }

  const curSigned = current.side === 'LONG' ? current.qty : -current.qty;
  const newSigned = curSigned + signed;

  if (Math.sign(curSigned) === Math.sign(signed)) {
    const totalAbs = Math.abs(curSigned) + Math.abs(signed);
    const newEntry = (current.avgEntry * Math.abs(curSigned) + price * Math.abs(signed)) / totalAbs;
    return { side: newSigned >= 0 ? 'LONG' : 'SHORT', qty: Math.abs(newSigned), avgEntry: newEntry, realizedDelta: 0, closed: false };
  }

  const closedQty = Math.min(Math.abs(curSigned), Math.abs(signed));
  const realizedDelta = (curSigned > 0 ? price - current.avgEntry : current.avgEntry - price) * closedQty * contractMultiplier;
  const flipped = Math.sign(newSigned) !== 0 && Math.sign(newSigned) !== Math.sign(curSigned);
  return {
    side: newSigned >= 0 ? (newSigned === 0 ? current.side : 'LONG') : 'SHORT',
    qty: Math.abs(newSigned),
    avgEntry: flipped ? price : current.avgEntry,
    realizedDelta,
    closed: newSigned === 0,
  };
}
