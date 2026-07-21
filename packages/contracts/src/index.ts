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

// ── AI coach chat ─────────────────────────────────────────────────────────────
// A chat turn: the account to ground on, an optional existing conversation to
// append to, and the message history. Content/length caps keep prompt size (and
// cost) bounded and blunt abuse.

export const aiChatSchema = z.object({
  accountId: z.string().min(1),
  conversationId: z.string().min(1).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(20),
});

export type AiChatInput = z.infer<typeof aiChatSchema>;
