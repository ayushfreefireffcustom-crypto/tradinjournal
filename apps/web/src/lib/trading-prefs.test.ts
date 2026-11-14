import { describe, expect, it } from 'vitest';
import { activeOnly, parseRiskCap, parseRuleValue, previewLine, sameRules, validHours } from './trading-prefs';

describe('trading prefs helpers', () => {
  it('parses rule values within the API bounds', () => {
    expect(parseRuleValue('maxTradesPerDay', '3')).toBe(3);
    expect(parseRuleValue('maxTradesPerDay', '2.5')).toBeNull();
    expect(parseRuleValue('maxTradesPerDay', '0')).toBeNull();
    expect(parseRuleValue('maxRiskPct', '0,75')).toBe(0.75);
    expect(parseRuleValue('maxSizeX', '1')).toBeNull();
    expect(parseRuleValue('maxSizeX', '')).toBeNull();
    expect(parseRiskCap('2')).toBe(2);
    expect(parseRiskCap('11')).toBeNull();
  });
  it('hours must be HH:MM and differ', () => {
    expect(validHours({ from: '07:00', to: '16:00' })).toBe(true);
    expect(validHours({ from: '22:00', to: '02:00' })).toBe(true);
    expect(validHours({ from: '07:00', to: '07:00' })).toBe(false);
    expect(validHours({ from: '7:00', to: '16:00' })).toBe(false);
    expect(validHours(null)).toBe(false);
  });
  it('active rules only, and comparing rule sets (hours included)', () => {
    expect(activeOnly({ maxTradesPerDay: 3, maxRiskPct: null, tradingHours: null })).toEqual({ maxTradesPerDay: 3 });
    expect(sameRules({ maxTradesPerDay: 3 }, { maxTradesPerDay: 3, maxSizeX: null })).toBe(true);
    expect(sameRules({ tradingHours: { from: '07:00', to: '16:00' } }, { tradingHours: { from: '07:00', to: '17:00' } })).toBe(false);
  });
  it('preview line', () => {
    expect(previewLine({ n: 14, net: -1230.4, checked: 50 }, 90, 'maxTradesPerDay')).toBe('Last 90 days: you broke this 14 times · −$1,230');
    expect(previewLine({ n: 1, net: 20, checked: 50 }, 90, 'maxSizeX')).toBe('Last 90 days: you broke this 1 time · +$20');
    expect(previewLine({ n: 0, net: 0, checked: 50 }, 90, 'tradingHours')).toBe('Last 90 days: kept every time');
    expect(previewLine({ n: 0, net: 0, checked: 0 }, 90, 'maxRiskPct')).toBe('Needs a stop at entry on your trades to check');
    expect(previewLine(undefined, 90, 'maxRiskPct')).toBe('');
  });
});
