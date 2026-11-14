// Macro overview (v2): the regime map, the inputs behind it, the assets × drivers
// grid, the data-surprise grid and a Treasury-based policy proxy. Served as the
// OPTIONAL `overview` field on GET /api/macro/state, so older clients keep working.
// No FedWatch feed exists: `cuts` is a proxy from Treasury yields vs Fed funds and
// says so in `basis`; there are no per-meeting odds anywhere in this payload.
import { z } from 'zod';
import type { MacroState } from '../index.js';

export const macroFactorKeySchema = z.enum([
  'inflation', 'policy', 'growth', 'rates', 'liquidity', 'credit', 'risk', 'dollar',
]);
export type MacroFactorKey = z.infer<typeof macroFactorKeySchema>;

const regimeLabel = z.enum(['Goldilocks', 'Reflation', 'Stagflation', 'Deflation']);
const dir = z.union([z.literal(-1), z.literal(0), z.literal(1)]);

export const macroRegimePointSchema = z.object({
  month: z.string(), // YYYY-MM
  growth: z.number(), // −2..+2
  inflation: z.number(), // −2..+2
  label: regimeLabel,
});

export const macroRegimeTrailSchema = z.object({
  label: regimeLabel,
  since: z.string(), // YYYY-MM
  months: z.number().int(),
  /** ≤ 8 words, deterministic from the trail. */
  line: z.string(),
  /** FRED series the trail is built from. */
  seriesCount: z.number().int(),
  near: z.object({ label: regimeLabel, axis: z.enum(['growth', 'inflation']) }).nullable(),
  points: z.array(macroRegimePointSchema),
});

export const macroOverviewInputSchema = z.object({
  key: z.enum(['core_cpi', 'policy', 'unemployment', 'net_liquidity']),
  label: z.string(),
  sub: z.string(),
  value: z.number(),
  /** How to format value/delta on the client. */
  format: z.enum(['pct', 'cuts', 'usd_mn']),
  spark: z.array(z.number()),
  delta: z.number().nullable(),
  deltaLabel: z.string(),
  /** Effect of the move on risk assets: colours the delta. */
  tone: z.enum(['pos', 'neg', 'flat']),
  asOf: z.string(),
});
export type MacroOverviewInput = z.infer<typeof macroOverviewInputSchema>;

export const macroDriverSchema = z.object({
  key: macroFactorKeySchema,
  label: z.string(),
  value: z.number().nullable(),
  direction: dir,
  weight: z.number(),
});

export const macroGridRowSchema = z.object({
  asset: z.string(),
  score: z.number(),
  label: z.string(),
  /** −100..+100. */
  net: z.number(),
  /** Net bias from the last snapshot of the previous UTC day. */
  netYesterday: z.number().nullable(),
  cells: z.array(z.object({
    factor: macroFactorKeySchema,
    raw: z.number(),
    cell: z.number().int().min(-2).max(2),
  })),
  flipsIf: z.object({
    factor: macroFactorKeySchema,
    direction: z.union([z.literal(-1), z.literal(1)]),
    text: z.string(),
    label: z.string(),
  }).nullable(),
  /** Daily net bias, oldest → newest, up to 30 days. */
  trend: z.array(z.number()),
});
export type MacroGridRow = z.infer<typeof macroGridRowSchema>;

export const macroSurpriseSchema = z.object({
  months: z.array(z.string()),
  series: z.array(z.object({
    key: z.string(),
    label: z.string(),
    cells: z.array(z.object({
      month: z.string(),
      level: z.number().int().min(-2).max(2).nullable(),
      actual: z.string().nullable(),
      forecast: z.string().nullable(),
    })),
  })),
  line: z.string().nullable(),
  releases: z.number().int(),
});

export const macroCutsProxySchema = z.object({
  basis: z.literal('treasury-vs-effr'),
  effr: z.number(),
  asOf: z.string(),
  rows: z.array(z.object({
    key: z.enum(['3m', '1y', '2y']),
    label: z.string(),
    yield: z.number(),
    /** 25bp cuts implied: (EFFR − yield) / 0.25. Negative = hikes. */
    cuts: z.number(),
    cutsYesterday: z.number().nullable(),
  })),
});

export const macroOverviewSchema = z.object({
  asOf: z.string(),
  regime: macroRegimeTrailSchema.nullable(),
  inputs: z.array(macroOverviewInputSchema),
  drivers: z.array(macroDriverSchema),
  grid: z.array(macroGridRowSchema),
  surprise: macroSurpriseSchema.nullable(),
  cuts: macroCutsProxySchema.nullable(),
});
export type MacroOverview = z.infer<typeof macroOverviewSchema>;

/** /api/macro/state with the optional v2 overview attached. */
export type MacroStateV2 = MacroState & { overview?: MacroOverview };
