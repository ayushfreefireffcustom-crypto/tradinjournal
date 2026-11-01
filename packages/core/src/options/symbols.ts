// Delta option symbols: C-BTC-99000-271126 / P-ETH-3500-031126 (strike, DDMMYY).
import type { OptionKind } from './bs.js';

export interface OptionSymbol { kind: OptionKind; underlying: string; strike: number; expiryCode: string; /** Settlement, ms. Delta settles BTC/ETH at 12:00 UTC (others at the given hour). */ expiry: number }

export function parseOptionSymbol(symbol: string, settleHourUtc = 12): OptionSymbol | null {
  const m = /^([CP])-([A-Z0-9]+)-(\d+(?:\.\d+)?)-(\d{2})(\d{2})(\d{2})$/.exec(symbol);
  if (!m) return null;
  const [, cp, und, strike, dd, mm, yy] = m;
  return { kind: cp === 'C' ? 'call' : 'put', underlying: und!, strike: Number(strike), expiryCode: `${dd}${mm}${yy}`, expiry: Date.UTC(2000 + Number(yy), Number(mm) - 1, Number(dd), settleHourUtc) };
}

export const optionSymbol = (kind: OptionKind, underlying: string, strike: number, expiryCode: string) => `${kind === 'call' ? 'C' : 'P'}-${underlying}-${strike}-${expiryCode}`;
