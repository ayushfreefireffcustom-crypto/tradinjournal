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

// ── Phase 2: Economic calendar + News ─────────────────────────────────────────
// Internal (worker → API) ingest triggers and the public query params. Web keeps
// its own client types in apps/web/src/lib/api.ts; contracts is shared API↔worker.

export const calendarIngestSchema = z.object({
  /** UTC window to (re)fetch. Both ISO datetimes. */
  from: z.string().datetime(),
  to: z.string().datetime(),
});
export type CalendarIngestInput = z.infer<typeof calendarIngestSchema>;

export const newsIngestSchema = z.object({
  /** Minute bucket the tick belongs to — carried through for logging/idempotency. */
  bucket: z.string().min(1),
});
export type NewsIngestInput = z.infer<typeof newsIngestSchema>;

export const newsEnrichSchema = z.object({
  /** Minute bucket the tick belongs to — carried through for logging/idempotency. */
  bucket: z.string().min(1),
});
export type NewsEnrichInput = z.infer<typeof newsEnrichSchema>;

export const notificationsDispatchSchema = z.object({
  bucket: z.string().min(1),
});
export type NotificationsDispatchInput = z.infer<typeof notificationsDispatchSchema>;

// ── Shared domain enums (single source of truth) ─────────────────────────────
// The calendar/news vocabularies live here once, as `as const` tuples + zod
// schemas + inferred TS types. Request validators, service-layer types, and
// runtime membership checks all derive from these — so a value is added in
// exactly one place. (The web app keeps its own copies; it's a standalone build
// with no workspace deps.)
export const EVENT_IMPACTS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export const eventImpactSchema = z.enum(EVENT_IMPACTS);
export type EventImpact = z.infer<typeof eventImpactSchema>;

export const NEWS_CATEGORIES = ['CRYPTO', 'MACRO', 'GEOPOLITICAL', 'REGULATORY', 'MARKETS'] as const;
export const newsCategorySchema = z.enum(NEWS_CATEGORIES);
export type NewsCategory = z.infer<typeof newsCategorySchema>;

export const SENTIMENTS = ['BULLISH', 'BEARISH', 'NEUTRAL'] as const;
export const sentimentSchema = z.enum(SENTIMENTS);
export type Sentiment = z.infer<typeof sentimentSchema>;

export const calendarQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  impact: eventImpactSchema.optional(),
  /** CSV of impacts to keep (e.g. "HIGH,MEDIUM") — trims the payload server-side. */
  impacts: z.string().max(40).optional(),
  currency: z.string().min(1).max(8).optional(),
  category: z.string().min(1).max(40).optional(),
});
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;

export const newsQuerySchema = z.object({
  category: newsCategorySchema.optional(),
  country: z.string().min(2).max(2).optional(),
  impact: eventImpactSchema.optional(),
  sentiment: sentimentSchema.optional(),
  // Personalization: CSV of outlet keys to keep (`sources`) or drop
  // (`excludeSources`). Used to render the "your sources" / "everything else"
  // split. Parsed to arrays in the service.
  sources: z.string().max(4000).optional(),
  excludeSources: z.string().max(4000).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// Body for saving a user's preferred news outlets (keys like "rss:coindesk").
export const newsPreferencesSchema = z.object({
  sources: z.array(z.string().min(1).max(64)).max(60),
});
export type NewsPreferencesInput = z.infer<typeof newsPreferencesSchema>;
export type NewsQuery = z.infer<typeof newsQuerySchema>;

// Per-user notification preferences (PATCH body — all fields optional).
export const notificationPrefsSchema = z.object({
  timezone: z.string().min(1).max(64).optional(),
  inApp: z.boolean().optional(),
  email: z.boolean().optional(),
  push: z.boolean().optional(),
  minImpact: eventImpactSchema.optional(),
  currencies: z.array(z.string().min(1).max(8)).max(30).optional(),
  categories: z.array(z.string().min(1).max(40)).max(30).optional(),
  leadMinutes: z.coerce.number().int().min(0).max(1440).optional(),
  newsAlerts: z.boolean().optional(),
});
export type NotificationPrefsInput = z.infer<typeof notificationPrefsSchema>;

// Web Push subscription registration (the browser's PushSubscription shape).
export const pushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  userAgent: z.string().max(400).optional(),
});
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;
