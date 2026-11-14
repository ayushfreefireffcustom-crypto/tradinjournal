// Liquidation map + max pain (estimated). We have no exchange feed of resting
// liquidation levels, so every value here is a MODEL estimate built from public
// open interest, volume-at-price and leverage-tier assumptions. The UI must label
// it "Estimated" everywhere it is shown.
import { z } from 'zod';

export const LIQUIDATION_COINS = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE'] as const;
export const liquidationCoinSchema = z.enum(LIQUIDATION_COINS);
export type LiquidationCoin = z.infer<typeof liquidationCoinSchema>;

export const liquidationMapQuerySchema = z.object({
  coin: liquidationCoinSchema.default('BTC'),
  /** Look-back window for the positions the model reconstructs. */
  window: z.enum(['24h', '48h', '7d']).default('48h'),
}).strict();
export type LiquidationMapQuery = z.infer<typeof liquidationMapQuerySchema>;

/** One price bucket of the ladder: USD notional that would be liquidated there. */
export const liquidationBandSchema = z.object({
  price: z.number(),
  longUsd: z.number(),
  shortUsd: z.number(),
});
export type LiquidationBand = z.infer<typeof liquidationBandSchema>;

export const maxPainSchema = z.object({
  /** Biggest long-liquidation cluster below price. */
  longPrice: z.number(),
  longUsd: z.number(),
  longPct: z.number(),
  /** Biggest short-liquidation cluster above price. */
  shortPrice: z.number(),
  shortUsd: z.number(),
  shortPct: z.number(),
  /** Chance price touches each side within 24h (0..100), from realised vol. Null if unknown. */
  touchDownPct: z.number().nullable(),
  touchUpPct: z.number().nullable(),
});
export type MaxPain = z.infer<typeof maxPainSchema>;

export const liquidationMapDtoSchema = z.object({
  coin: liquidationCoinSchema,
  symbol: z.string(),
  price: z.number(),
  asOf: z.string(),
  estimated: z.literal(true),
  window: z.enum(['24h', '48h', '7d']),
  /** Bucket size in price units. */
  step: z.number(),
  /** Ascending by price. */
  bands: z.array(liquidationBandSchema),
  maxPain: maxPainSchema,
  /** Price path for the same window (hourly or finer), for drawing on the same axis. */
  path: z.array(z.object({ t: z.string(), p: z.number() })),
  /** Realised liquidations in the last hour, if a feed answered. */
  lastHour: z.object({ totalUsd: z.number(), longShare: z.number() }).nullable(),
  sources: z.array(z.string()),
});
export type LiquidationMapDto = z.infer<typeof liquidationMapDtoSchema>;

export const maxPainRowSchema = maxPainSchema.extend({
  coin: liquidationCoinSchema,
  price: z.number(),
});
export const maxPainBoardDtoSchema = z.object({
  asOf: z.string(),
  estimated: z.literal(true),
  rows: z.array(maxPainRowSchema),
});
export type MaxPainBoardDto = z.infer<typeof maxPainBoardDtoSchema>;
