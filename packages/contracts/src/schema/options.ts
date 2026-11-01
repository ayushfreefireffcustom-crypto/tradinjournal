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
