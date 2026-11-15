import { describe, it, expect } from 'vitest';
import {
  cellText,
  driverReading,
  heat,
  inputDelta,
  inputLabel,
  inputValue,
  magnetLine,
  monthLong,
  monthShort,
  ordinal,
  signed,
  surpriseFill,
  tradedLabel,
  usdMn,
  usdShort,
  wordCount,
} from './format';
import type { MacroOverviewInput } from '@/lib/macro-api';

const input = (p: Partial<MacroOverviewInput>): MacroOverviewInput => ({
  key: 'core_cpi', label: '', sub: '', value: 0, format: 'pct', spark: [], delta: null, deltaLabel: '', tone: 'flat', asOf: '', ...p,
});

describe('macro overview format', () => {
  it('signs with a real minus', () => {
    expect(signed(0.1, 1)).toBe('+0.1');
    expect(signed(-23)).toBe('−23');
    expect(signed(0.04, 1)).toBe('0.0');
  });

  it('formats money', () => {
    expect(usdMn(5_710_000)).toBe('$5.71T');
    expect(usdMn(-62_000)).toBe('−$62B');
    expect(usdShort(282_000_000)).toBe('$282M');
    expect(usdShort(1_400_000_000)).toBe('$1.4B');
  });

  it('formats months and ordinals', () => {
    expect(monthShort('2026-09')).toBe('Sep');
    expect(monthShort('2025-12', true)).toBe('Dec 2025');
    expect(monthLong('2026-08')).toBe('August');
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']);
  });

  it('formats input values', () => {
    expect(inputValue(input({ value: 3.14 }))).toEqual({ value: '3.1%', unit: '' });
    expect(inputValue(input({ format: 'cuts', value: -3.9 }))).toEqual({ value: '3.9', unit: 'hikes' });
    expect(inputValue(input({ format: 'cuts', value: 1 }))).toEqual({ value: '1.0', unit: 'cut' });
    expect(inputValue(input({ format: 'usd_mn', value: 5_710_000 }))).toEqual({ value: '$5.71T', unit: '' });
    expect(inputDelta(input({ format: 'usd_mn', delta: -62_000 }))).toBe('−$62B');
    expect(inputDelta(input({ delta: 0.1 }))).toBe('+0.1');
    expect(inputDelta(input({ delta: null }))).toBe('');
    // Hikes read as a positive count, so a move toward more hikes is +.
    expect(inputDelta(input({ format: 'cuts', value: -3.9, delta: -0.1 }))).toBe('+0.1');
    expect(inputDelta(input({ format: 'cuts', value: 1.9, delta: 0.4 }))).toBe('+0.4');
  });

  it('labels a cuts row by what it shows', () => {
    expect(inputLabel(input({ format: 'cuts', value: -3.9, label: 'Cuts priced, 2Y' }))).toBe('Hikes priced, 2Y');
    expect(inputLabel(input({ format: 'cuts', value: 1.2, label: 'Hikes priced, 2Y' }))).toBe('Cuts priced, 2Y');
    expect(inputLabel(input({ value: -1, label: 'Core CPI y/y' }))).toBe('Core CPI y/y');
  });

  it('colours cells and surprises', () => {
    expect(heat(0)).toBe('transparent');
    expect(heat(2)).toBe('rgba(8,196,101,0.46)');
    expect(heat(-1)).toBe('rgba(254,58,49,0.2)');
    expect(surpriseFill(null)).toBeNull();
    expect(surpriseFill(2)).toBe('rgba(254,58,49,0.8)');
    expect(surpriseFill(-1)).toBe('rgba(8,196,101,0.38)');
    expect(cellText(-2)).toBe('−2');
    expect(cellText(0)).toBe('·');
  });

  it('labels journal status from canonical symbols', () => {
    expect(tradedLabel('XAU', new Set(['XAUUSD']))).toBe('In your journal');
    expect(tradedLabel('NDX', new Set(['XAUUSD']))).toBe('Not traded');
  });

  it('reads driver headers', () => {
    expect(driverReading({ key: 'rates', label: '', value: 4.123, direction: 1, weight: 1 }, null)).toBe('10Y 4.12% ↑');
    expect(driverReading({ key: 'inflation', label: '', value: 330, direction: 1, weight: 1 }, 3.1)).toBe('Core 3.1% ↑');
    expect(driverReading({ key: 'risk', label: '', value: null, direction: 0, weight: 1 }, null)).toBe('no data');
  });

  it('writes the magnet line in ≤ 8 words', () => {
    const l = magnetLine(-0.98, 3.75, 282e6, 338e6)!;
    expect(l).toBe('Long cluster 1.0% below is the nearer magnet');
    expect(wordCount(l)).toBeLessThanOrEqual(8);
    expect(magnetLine(-3, 0.5, 1, 1)).toBe('Short cluster 0.5% above is the nearer magnet');
    expect(magnetLine(0, 0, 0, 0)).toBeNull();
  });
});

describe('liqSourceLabel', () => {
  it('names the exchanges that answered, from the DTO sources', async () => {
    const { liqSourceLabel } = await import('./format');
    expect(liqSourceLabel(['Binance USDⓈ-M klines', 'Binance open interest history', 'Binance global long/short account ratio', 'TRADElogs estimate (leverage-tier model)'])).toBe('Binance · est.');
    expect(liqSourceLabel(['Bybit linear klines', 'Volume stand-in (no open-interest history)', 'TRADElogs estimate (leverage-tier model)'])).toBe('Bybit · volume stand-in · est.');
    expect(liqSourceLabel([])).toBe('est.');
    expect(liqSourceLabel(['Binance USDⓈ-M klines', 'Bybit linear klines', 'Weighted by open interest: Binance 61%, Bybit 39%', 'TRADElogs estimate (leverage-tier model)'])).toBe('Binance · Bybit · est.');
  });
});
