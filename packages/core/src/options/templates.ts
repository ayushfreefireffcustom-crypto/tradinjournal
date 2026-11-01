// Multi-leg templates (G6). Strikes are given as steps away from the at-the-
// money strike of the chosen expiry, so one template fits any underlying.
import type { OptionKind } from './bs.js';

export type TemplateCategory = 'popular' | 'bullish' | 'bearish' | 'neutral' | 'hedging';
export interface TemplateLeg { kind: OptionKind | 'future'; side: 1 | -1; steps?: number; ratio?: number; far?: boolean }
export interface OptionTemplate { id: string; name: string; categories: TemplateCategory[]; about: string; legs: TemplateLeg[] }

export const TEMPLATES: OptionTemplate[] = [
  { id: 'long_call', name: 'Long call', categories: ['popular', 'bullish'], about: 'Pays if the price rises past the strike plus the premium. Risk is the premium.', legs: [{ kind: 'call', side: 1, steps: 0 }] },
  { id: 'long_put', name: 'Long put', categories: ['popular', 'bearish'], about: 'Pays if the price falls below the strike minus the premium. Risk is the premium.', legs: [{ kind: 'put', side: 1, steps: 0 }] },
  { id: 'short_call', name: 'Short call', categories: ['bearish'], about: 'Collects the premium if the price stays below the strike. Loss is unlimited above it.', legs: [{ kind: 'call', side: -1, steps: 1 }] },
  { id: 'short_put', name: 'Short put', categories: ['bullish'], about: 'Collects the premium if the price stays above the strike. Loses below it.', legs: [{ kind: 'put', side: -1, steps: -1 }] },
  { id: 'bull_call_spread', name: 'Bull call spread', categories: ['popular', 'bullish'], about: 'Buy a call, sell a higher one: cheaper than a call, gain capped at the upper strike.', legs: [{ kind: 'call', side: 1, steps: 0 }, { kind: 'call', side: -1, steps: 2 }] },
  { id: 'bull_put_spread', name: 'Bull put spread', categories: ['bullish'], about: 'Sell a put, buy a lower one: a credit kept if the price stays above the short strike.', legs: [{ kind: 'put', side: -1, steps: -1 }, { kind: 'put', side: 1, steps: -3 }] },
  { id: 'bear_put_spread', name: 'Bear put spread', categories: ['popular', 'bearish'], about: 'Buy a put, sell a lower one: cheaper than a put, gain capped at the lower strike.', legs: [{ kind: 'put', side: 1, steps: 0 }, { kind: 'put', side: -1, steps: -2 }] },
  { id: 'bear_call_spread', name: 'Bear call spread', categories: ['bearish'], about: 'Sell a call, buy a higher one: a credit kept if the price stays below the short strike.', legs: [{ kind: 'call', side: -1, steps: 1 }, { kind: 'call', side: 1, steps: 3 }] },
  { id: 'long_straddle', name: 'Long straddle', categories: ['popular', 'neutral'], about: 'Buy the at-the-money call and put: pays on a big move either way.', legs: [{ kind: 'call', side: 1, steps: 0 }, { kind: 'put', side: 1, steps: 0 }] },
  { id: 'short_straddle', name: 'Short straddle', categories: ['neutral'], about: 'Sell the at-the-money call and put: earns if the price stays put. Loss is unlimited.', legs: [{ kind: 'call', side: -1, steps: 0 }, { kind: 'put', side: -1, steps: 0 }] },
  { id: 'long_strangle', name: 'Long strangle', categories: ['neutral'], about: 'Buy an out-of-the-money call and put: cheaper than a straddle, needs a bigger move.', legs: [{ kind: 'call', side: 1, steps: 2 }, { kind: 'put', side: 1, steps: -2 }] },
  { id: 'short_strangle', name: 'Short strangle', categories: ['popular', 'neutral'], about: 'Sell an out-of-the-money call and put: earns inside the range. Loss is unlimited.', legs: [{ kind: 'call', side: -1, steps: 2 }, { kind: 'put', side: -1, steps: -2 }] },
  { id: 'iron_condor', name: 'Iron condor', categories: ['popular', 'neutral'], about: 'A short strangle with wings bought further out: a range trade with capped loss.', legs: [{ kind: 'put', side: 1, steps: -4 }, { kind: 'put', side: -1, steps: -2 }, { kind: 'call', side: -1, steps: 2 }, { kind: 'call', side: 1, steps: 4 }] },
  { id: 'iron_butterfly', name: 'Iron butterfly', categories: ['neutral'], about: 'A short straddle with wings: most profit at the middle strike, capped loss.', legs: [{ kind: 'put', side: 1, steps: -3 }, { kind: 'put', side: -1, steps: 0 }, { kind: 'call', side: -1, steps: 0 }, { kind: 'call', side: 1, steps: 3 }] },
  { id: 'call_butterfly', name: 'Call butterfly', categories: ['neutral'], about: 'Buy one low and one high call, sell two in the middle: a cheap bet on landing at the middle.', legs: [{ kind: 'call', side: 1, steps: -2 }, { kind: 'call', side: -1, steps: 0, ratio: 2 }, { kind: 'call', side: 1, steps: 2 }] },
  { id: 'calendar_call', name: 'Call calendar', categories: ['neutral'], about: 'Sell a near call, buy the same strike further out: earns from faster near-term decay.', legs: [{ kind: 'call', side: -1, steps: 0 }, { kind: 'call', side: 1, steps: 0, far: true }] },
  { id: 'risk_reversal', name: 'Risk reversal', categories: ['bullish'], about: 'Sell a put to pay for a call: long-like exposure for little or no premium.', legs: [{ kind: 'put', side: -1, steps: -2 }, { kind: 'call', side: 1, steps: 2 }] },
  { id: 'protective_put', name: 'Protective put', categories: ['hedging'], about: 'Hold the future and buy a put: losses stop below the put strike.', legs: [{ kind: 'future', side: 1 }, { kind: 'put', side: 1, steps: -1 }] },
  { id: 'covered_call', name: 'Covered call', categories: ['hedging', 'popular'], about: 'Hold the future and sell a call: earns the premium, gains capped at the strike.', legs: [{ kind: 'future', side: 1 }, { kind: 'call', side: -1, steps: 2 }] },
  { id: 'collar', name: 'Collar', categories: ['hedging'], about: 'Hold the future, buy a put and sell a call: a cheap floor paid for with the upside.', legs: [{ kind: 'future', side: 1 }, { kind: 'put', side: 1, steps: -2 }, { kind: 'call', side: -1, steps: 2 }] },
];

export interface ResolvedTemplateLeg { kind: OptionKind | 'future'; side: 1 | -1; qty: number; strike?: number; expiry?: number }

/** Concrete strikes for a template: steps counted from the ATM strike, clamped to what's listed. */
export function resolveTemplate(t: OptionTemplate, x: { strikes: number[]; farStrikes?: number[]; spot: number; expiry: number; farExpiry?: number; qty: number }): ResolvedTemplateLeg[] | null {
  const pick = (ks: number[], steps: number) => {
    if (!ks.length) return null;
    const sorted = [...ks].sort((a, b) => a - b);
    let atm = 0;
    sorted.forEach((k, i) => { if (Math.abs(k - x.spot) < Math.abs(sorted[atm]! - x.spot)) atm = i; });
    return sorted[Math.max(0, Math.min(sorted.length - 1, atm + steps))]!;
  };
  const out: ResolvedTemplateLeg[] = [];
  for (const l of t.legs) {
    const qty = x.qty * (l.ratio ?? 1);
    if (l.kind === 'future') { out.push({ kind: 'future', side: l.side, qty }); continue; }
    if (l.far && (x.farExpiry == null || !x.farStrikes?.length)) return null;
    const strike = pick(l.far ? x.farStrikes! : x.strikes, l.steps ?? 0);
    if (strike == null) return null;
    out.push({ kind: l.kind, side: l.side, qty, strike, expiry: l.far ? x.farExpiry! : x.expiry });
  }
  return out;
}
