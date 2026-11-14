// Macro overview (v2): the regime map, the inputs behind it, the assets × drivers
// grid, the data-surprise grid and a Treasury-based policy proxy. Served as the
// OPTIONAL `overview` field on GET /api/macro/state, so older clients keep working.
// Policy pricing: `fedwatch` holds per-FOMC-meeting odds from 30-day Fed funds
// futures (CME FedWatch method) when those prices answer; `cuts` is the older
// Treasury-vs-Fed-funds proxy, kept as the fallback and labelled by `basis`.
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

/** Cut / hold / hike odds per FOMC meeting from Fed funds futures (CME FedWatch method). */
export const macroFedWatchSchema = z.object({
  basis: z.literal('fed-funds-futures'),
  /** Latest futures trade time. */
  asOf: z.string(),
  /** Market-implied effective Fed funds rate now, %. */
  impliedNow: z.number(),
  rows: z.array(z.object({
    /** Decision day, YYYY-MM-DD. */
    meeting: z.string(),
    /** e.g. "Dec 9". */
    label: z.string(),
    /** Odds (0..100) of a cut / no change / hike at this meeting. */
    cutPct: z.number(),
    holdPct: z.number(),
    hikePct: z.number(),
    /** Part of the cut (or hike) odds priced as 50 bp or more, 0..100. */
    bigMovePct: z.number(),
    /** Expected change at this meeting, bp (negative = cuts). */
    expectedBp: z.number(),
    /** Implied effective rate after the meeting, %. */
    rateAfter: z.number(),
    /** 25 bp cuts priced from now through this meeting (negative = hikes). */
    cumulativeCuts: z.number(),
    /** Same, from the prior session's settlement prices. */
    cumulativeCutsYesterday: z.number().nullable(),
  })),
});
export type MacroFedWatch = z.infer<typeof macroFedWatchSchema>;

export const macroOverviewSchema = z.object({
  asOf: z.string(),
  regime: macroRegimeTrailSchema.nullable(),
  inputs: z.array(macroOverviewInputSchema),
  drivers: z.array(macroDriverSchema),
  grid: z.array(macroGridRowSchema),
  surprise: macroSurpriseSchema.nullable(),
  cuts: macroCutsProxySchema.nullable(),
  /** Optional so states cached before it existed still parse. */
  fedwatch: macroFedWatchSchema.nullable().optional(),
});
export type MacroOverview = z.infer<typeof macroOverviewSchema>;

/** /api/macro/state with the optional v2 overview attached. */
export type MacroStateV2 = MacroState & { overview?: MacroOverview };
