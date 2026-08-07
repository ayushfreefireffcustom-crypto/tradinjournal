// Factor readers — each maps EngineInput → a signed direction.
// Convention for `direction`:
//   inflation +1 = inflation rising
//   policy     +1 = rates/policy hawkish (fed funds up)
//   growth     +1 = growth improving (payrolls up / unemployment down)
//   rates      +1 = long yields rising
//   liquidity  +1 = net liquidity expanding
//   credit     +1 = credit stress rising (HY OAS up)
//   risk       +1 = risk elevated (VIX up)
//   dollar     +1 = USD strengthening
import type {
  EngineInput,
  EngineIndicator,
  FactorDirection,
  FactorKey,
  FactorReading,
} from './types.js';

export interface FactorDef {
  key: FactorKey;
  label: string;
  weight: number;
  read: (input: EngineInput) => { value: number | null; direction: FactorDirection };
}

function byKey(input: EngineInput): Map<string, EngineIndicator> {
  return new Map(input.indicators.map(i => [i.key, i]));
}

/** Compare value vs prev → -1 | 0 | 1. Missing/non-finite prev or value → 0. */
export function trendDir(value: number, prev: number | null, eps = 0): FactorDirection {
  if (prev == null || !Number.isFinite(prev) || !Number.isFinite(value)) return 0;
  const d = value - prev;
  if (Math.abs(d) <= eps) return 0;
  return d > 0 ? 1 : -1;
}

/** Prefer first available series key. */
function pick(map: Map<string, EngineIndicator>, ...keys: string[]): EngineIndicator | null {
  for (const k of keys) {
    const row = map.get(k);
    if (row && Number.isFinite(row.value)) return row;
  }
  return null;
}

function marketChange(input: EngineInput, symbol: string): { value: number; direction: FactorDirection } | null {
  const m = input.markets.find(x => x.symbol === symbol);
  if (!m || !Number.isFinite(m.price)) return null;
  if (m.changePct == null || !Number.isFinite(m.changePct)) {
    return { value: m.price, direction: 0 };
  }
  const direction: FactorDirection = m.changePct > 0.05 ? 1 : m.changePct < -0.05 ? -1 : 0;
  return { value: m.price, direction };
}

export const FACTORS: readonly FactorDef[] = [
  {
    key: 'inflation',
    label: 'Inflation',
    weight: 1.2,
    read(input) {
      const map = byKey(input);
      // Core CPI preferred; fall back to headline CPI / Core PCE.
      const row = pick(map, 'CPILFESL', 'CPIAUCSL', 'PCEPILFE');
      if (!row) return { value: null, direction: 0 };
      return { value: row.value, direction: trendDir(row.value, row.prev) };
    },
  },
  {
    key: 'policy',
    label: 'Fed policy',
    weight: 1.1,
    read(input) {
      const map = byKey(input);
      const row = pick(map, 'DFF', 'FEDFUNDS');
      if (!row) return { value: null, direction: 0 };
      return { value: row.value, direction: trendDir(row.value, row.prev, 0.01) };
    },
  },
  {
    key: 'growth',
    label: 'Growth',
    weight: 1.3,
    read(input) {
      const map = byKey(input);
      const nfp = pick(map, 'PAYEMS');
      const unrate = pick(map, 'UNRATE');
      // Combine: NFP up and/or unemployment down → growth up.
      let score = 0;
      let value: number | null = null;
      if (nfp) {
        value = nfp.value;
        score += trendDir(nfp.value, nfp.prev);
      }
      if (unrate) {
        value = value ?? unrate.value;
        // Rising unemployment = growth down.
        score -= trendDir(unrate.value, unrate.prev, 0.05);
      }
      const direction: FactorDirection = score > 0 ? 1 : score < 0 ? -1 : 0;
      return { value, direction };
    },
  },
  {
    key: 'rates',
    label: 'Long yields',
    weight: 1.0,
    read(input) {
      const map = byKey(input);
      const row = pick(map, 'DGS10');
      if (!row) return { value: null, direction: 0 };
      return { value: row.value, direction: trendDir(row.value, row.prev, 0.01) };
    },
  },
  {
    key: 'liquidity',
    label: 'Net liquidity',
    weight: 1.2,
    read(input) {
      const map = byKey(input);
      const row = pick(map, 'NET_LIQUIDITY');
      if (!row) return { value: null, direction: 0 };
      // Ignore tiny mn$ noise.
      return { value: row.value, direction: trendDir(row.value, row.prev, 1_000) };
    },
  },
  {
    key: 'credit',
    label: 'Credit stress',
    weight: 1.0,
    read(input) {
      const map = byKey(input);
      const row = pick(map, 'BAMLH0A0HYM2');
      if (!row) return { value: null, direction: 0 };
      return { value: row.value, direction: trendDir(row.value, row.prev, 0.02) };
    },
  },
  {
    key: 'risk',
    label: 'Risk (VIX)',
    weight: 1.0,
    read(input) {
      const map = byKey(input);
      const row = pick(map, 'VIXCLS');
      if (!row) return { value: null, direction: 0 };
      return { value: row.value, direction: trendDir(row.value, row.prev, 0.5) };
    },
  },
  {
    key: 'dollar',
    label: 'US dollar',
    weight: 1.1,
    read(input) {
      const map = byKey(input);
      const row = pick(map, 'DTWEXBGS');
      if (row) return { value: row.value, direction: trendDir(row.value, row.prev, 0.05) };
      const m = marketChange(input, 'DXY');
      if (!m) return { value: null, direction: 0 };
      return m;
    },
  },
] as const;

/** Read every factor against the current input. */
export function readFactors(input: EngineInput): FactorReading[] {
  return FACTORS.map(f => {
    const { value, direction } = f.read(input);
    return { key: f.key, label: f.label, weight: f.weight, value, direction };
  });
}
