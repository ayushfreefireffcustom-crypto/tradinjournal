import { z } from 'zod';

// ── Connect broker account ────────────────────────────────────────────────────

export const connectAccountSchema = z.object({
  mt5Login: z.coerce.number().int().positive(),
  password: z.string().min(1),
  server: z.string().min(1),
  // Optional broker display name chosen in the UI; when omitted the API
  // derives it from the server string.
  broker: z.string().min(1).optional(),
});

export type ConnectAccountInput = z.infer<typeof connectAccountSchema>;

// ── Update stored MT5 password ────────────────────────────────────────────────
// Used when a trader changes their MT5 password at the broker and needs to
// update the copy TRADElogs uses to sync.

export const updateCredentialsSchema = z.object({
  password: z.string().min(1),
});

export type UpdateCredentialsInput = z.infer<typeof updateCredentialsSchema>;

// ── Deals query ───────────────────────────────────────────────────────────────

export const dealsQuerySchema = z.object({
  accountId: z.string().min(1),
});

export type DealsQuery = z.infer<typeof dealsQuerySchema>;
