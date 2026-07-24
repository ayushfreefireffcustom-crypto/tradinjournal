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
  // Retry of the last turn: the superseded user→assistant pair is replaced rather
  // than appended, so a retried thread doesn't accumulate duplicate questions.
  regenerate: z.boolean().optional(),
});

export type AiChatInput = z.infer<typeof aiChatSchema>;

// Query for the cached AI performance narrative. `force` bypasses the data-hash
// cache and rewrites the review; it arrives as a query string, hence the literals.
export const aiReportQuerySchema = z.object({
  accountId: z.string().min(1),
  force: z.enum(['1', 'true']).optional(),
});

export type AiReportQuery = z.infer<typeof aiReportQuerySchema>;

// ── Weekly AI review email ────────────────────────────────────────────────────

/** Toggle the weekly digest (opt-in: off until the user turns it on). */
export const weeklyReviewPrefSchema = z.object({
  enabled: z.boolean(),
});

export type WeeklyReviewPrefInput = z.infer<typeof weeklyReviewPrefSchema>;

/** Unsubscribe from an email link. Token is 32 random bytes, hex-encoded. */
export const weeklyReviewUnsubscribeSchema = z.object({
  token: z.string().min(32).max(128),
});

export type WeeklyReviewUnsubscribeInput = z.infer<typeof weeklyReviewUnsubscribeSchema>;

/** Worker → API: build and send one user's digest. Internal, token-authenticated. */
export const weeklyReviewRunSchema = z.object({
  userId: z.string().min(1),
  /** Only send if the last send predates this instant — the idempotency window. */
  sentAfter: z.string().datetime(),
});

export type WeeklyReviewRunInput = z.infer<typeof weeklyReviewRunSchema>;

/** Worker → API: one page of users due a digest. Internal, token-authenticated. */
export const weeklyReviewRecipientsQuerySchema = z.object({
  sentAfter: z.string().datetime(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export type WeeklyReviewRecipientsQuery = z.infer<typeof weeklyReviewRecipientsQuerySchema>;

// ── AI coach web-search source ────────────────────────────────────────────────
// A single web result the coach used to ground an external/current-facts answer.
// Response-only (never part of the chat request); shared so the API and web agree
// on one shape when persisting/rendering citations.

export const aiSourceSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  snippet: z.string(),
});

export type AiSource = z.infer<typeof aiSourceSchema>;
