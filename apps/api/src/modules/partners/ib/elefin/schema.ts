// Elefin's responses, parsed strictly where it matters and tolerant of extra keys
// (zod objects strip unknown keys). Shapes follow the integration guide exactly.
import { z } from 'zod';

const iso = z.string().refine(s => Number.isFinite(Date.parse(s)), 'timestamp');
const isoOrNull = iso.nullable().optional().transform(v => v ?? null);
const money = z.coerce.number().finite().min(0);

export const clientStatus = z.enum(['active', 'suspended', 'inactive']);
export type ElefinClientStatus = z.infer<typeof clientStatus>;

/** The one client object, thirteen fields, identical on /clients, /clients/lookup and /clients/{id}. */
export const elefinClient = z.object({
  client_id: z.coerce.number().int().positive(),
  name: z.string().optional(),
  country: z.string().nullable().optional(),
  status: clientStatus,
  registered_at: iso,
  referred_at: isoOrNull,
  referral_code: z.string().nullable().optional(),
  funding: z.object({
    currency: z.string().optional(),
    deposits: money,
    first_deposit_at: isoOrNull,
    is_funded: z.boolean(),
  }),
  trading: z.object({
    lots: money,
    last_trade_at: isoOrNull,
  }),
});
export type ElefinClientRow = z.infer<typeof elefinClient>;

export const meta = z.object({
  current_page: z.coerce.number().int().min(1),
  per_page: z.coerce.number().int().min(1),
  last_page: z.coerce.number().int().min(0),
  total: z.coerce.number().int().min(0),
});
export type ElefinMeta = z.infer<typeof meta>;

/** { success, message, data } — every response, success or failure. */
export const envelope = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  data: z.unknown().optional(),
});

/** A list endpoint's `data`: rows stay unknown here so one bad row doesn't sink a page. */
export const listData = z.object({ data: z.array(z.unknown()), meta });

export const meData = z.object({
  key: z.object({
    name: z.string().nullable().optional(),
    abilities: z.array(z.string()).default([]),
    rate_limit_per_minute: z.coerce.number().int().positive().nullable().optional(),
    expires_at: isoOrNull,
  }),
  scope: z.object({
    type: z.string(),
    partner: z.object({ id: z.coerce.number().int(), name: z.string().nullable().optional() }).nullable().optional(),
  }),
  totals: z.object({ clients: z.coerce.number().int().min(0) }).partial().optional(),
  data_availability: z.object({ trades_from: isoOrNull }).partial().optional(),
  conventions: z.record(z.unknown()).optional(),
});
export type ElefinMe = z.infer<typeof meData>;

/** /clients/lookup: a miss is `{ affiliated: false }` and nothing else. */
export const lookupData = z.union([
  z.object({ affiliated: z.literal(false) }),
  elefinClient.extend({ affiliated: z.literal(true) }),
]);
export type ElefinLookup = z.infer<typeof lookupData>;

/** Field names in a row, one level deep ("funding.deposits"). Values are never kept. */
export function fieldNames(row: unknown): string[] {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(row)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) for (const k2 of Object.keys(v)) out.push(`${k}.${k2}`);
    else out.push(k);
  }
  return out.sort();
}

/** The thirteen documented fields, for the probe's "anything missing?" check. */
export const DOCUMENTED_FIELDS = [
  'client_id', 'country', 'funding.currency', 'funding.deposits', 'funding.first_deposit_at', 'funding.is_funded', 'name',
  'referral_code', 'referred_at', 'registered_at', 'status', 'trading.last_trade_at', 'trading.lots',
] as const;
