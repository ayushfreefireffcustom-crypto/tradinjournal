// Options (Part G): request bodies for multi-leg analysis and templates.
import { z } from 'zod';

const underlying = z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z0-9]{2,12}$/));
const expiryCode = z.string().regex(/^\d{6}$/);
export const optionsEnvSchema = z.enum(['live', 'testnet']);

export const optionLegSchema = z.object({
  kind: z.enum(['call', 'put', 'future']),
  side: z.union([z.literal(1), z.literal(-1)]),
  qty: z.number().int().min(1).max(100_000),
  strike: z.number().positive().optional(),
  expiry: expiryCode.optional(),
  price: z.number().min(0).max(10_000_000).optional(),
  iv: z.number().min(0.01).max(5).optional(),
}).strict().refine((l) => l.kind === 'future' || (l.strike != null && l.expiry != null), { message: 'Option legs need a strike and an expiry.' });

export const optionsAnalyzeSchema = z.object({
  env: optionsEnvSchema.default('live'),
  underlying,
  legs: z.array(optionLegSchema).min(1).max(8),
  /** Value the position at this time (ms); defaults to now. */
  at: z.number().int().positive().optional(),
  /** Vol for the probability of profit; defaults to the first expiry's ATM IV. */
  vol: z.number().min(0.01).max(5).optional(),
}).strict();
export type OptionsAnalyzeDto = z.infer<typeof optionsAnalyzeSchema>;

export const optionsTemplateSchema = z.object({
  env: optionsEnvSchema.default('live'),
  underlying,
  template: z.string().regex(/^[a-z_]{3,40}$/),
  expiry: expiryCode,
  qty: z.number().int().min(1).max(100_000).default(1),
}).strict();

export const optionsReplaySchema = z.object({
  env: optionsEnvSchema.default('live'),
  underlying,
  legs: z.array(optionLegSchema).min(1).max(8),
  path: z.enum(['flat', 'recorded']).default('flat'),
}).strict();

/** G11: a multi-leg option order, sent leg by leg. */
export const optionsBasketSchema = z.object({
  connectionId: z.string().min(1).max(64),
  /** One per click: a repeat with the same id returns the first send. */
  requestId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  underlying,
  legs: z.array(z.object({
    kind: z.enum(['call', 'put']),
    side: z.union([z.literal(1), z.literal(-1)]),
    qty: z.number().int().min(1).max(100_000),
    strike: z.number().positive(),
    expiry: expiryCode,
  }).strict()).min(1).max(8),
  /** Limit at the best price on the other side, at the mark, or market. */
  pricing: z.enum(['touch', 'mark', 'market']).default('touch'),
}).strict();
export type OptionsBasketDto = z.infer<typeof optionsBasketSchema>;
