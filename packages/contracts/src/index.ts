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
  priceAlerts: z.boolean().optional(),
});
export type NotificationPrefsInput = z.infer<typeof notificationPrefsSchema>;

// Web Push subscription registration (the browser's PushSubscription shape).
export const pushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  userAgent: z.string().max(400).optional(),
});
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

// ── Advanced charting / market data ───────────────────────────────────────────

// Chart timeframes, shared by the bridge, providers and the web client.
export const MARKET_TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'] as const;
export const marketTimeframeSchema = z.enum(MARKET_TIMEFRAMES);
export type MarketTimeframe = z.infer<typeof marketTimeframeSchema>;

// Asset classes route a symbol to the right provider (crypto→Binance,
// broker→MT5, stock/forex→Twelve Data).
export const ASSET_CLASSES = ['crypto', 'forex', 'stock', 'commodity', 'broker'] as const;
export const assetClassSchema = z.enum(ASSET_CLASSES);
export type AssetClass = z.infer<typeof assetClassSchema>;

// GET /api/market/candles query.
export const candlesQuerySchema = z.object({
  symbol: z.string().min(1).max(32),
  tf: marketTimeframeSchema,
  // Optional epoch-second window; when absent the service returns the latest `limit` bars.
  from: z.coerce.number().int().nonnegative().optional(),
  to: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  // Broker symbols need an account to reach the right MT5 terminal/broker.
  accountId: z.string().min(1).optional(),
});
export type CandlesQuery = z.infer<typeof candlesQuerySchema>;

// GET /api/market/search query.
export const symbolSearchSchema = z.object({
  q: z.string().min(1).max(64),
});
export type SymbolSearchQuery = z.infer<typeof symbolSearchSchema>;

// PUT /api/market/watchlist body.
export const watchlistSchema = z.object({
  symbols: z.array(z.string().min(1).max(32)).max(100),
});
export type WatchlistInput = z.infer<typeof watchlistSchema>;

// POST /internal/market/warm body (worker → API).
export const marketWarmSchema = z.object({
  bucket: z.string().min(1).max(64).optional(),
});
export type MarketWarmInput = z.infer<typeof marketWarmSchema>;

// ── Price alerts ──────────────────────────────────────────────────────────────

// Fire when price crosses above/below the threshold.
export const ALERT_DIRECTIONS = ['above', 'below'] as const;
export const alertDirectionSchema = z.enum(ALERT_DIRECTIONS);
export type AlertDirection = z.infer<typeof alertDirectionSchema>;

// POST /api/alerts — create a price alert.
export const createAlertSchema = z.object({
  symbol: z.string().min(1).max(32),
  direction: alertDirectionSchema,
  threshold: z.coerce.number().positive(),
  accountId: z.string().min(1).optional(), // broker symbols route via the account's MT5 creds
  recurring: z.boolean().optional(),
  note: z.string().max(200).optional(),
  // Current price the client already has (from the chart) — seeds lastPrice so
  // the alert is armed instantly without the server blocking on a price fetch.
  seedPrice: z.coerce.number().positive().optional(),
});
export type CreateAlertInput = z.infer<typeof createAlertSchema>;

// PATCH /api/alerts/:id — edit an alert.
export const updateAlertSchema = z.object({
  threshold: z.coerce.number().positive().optional(),
  status: z.enum(['active', 'disabled']).optional(),
  recurring: z.boolean().optional(),
  note: z.string().max(200).optional(),
});
export type UpdateAlertInput = z.infer<typeof updateAlertSchema>;

// POST /internal/alerts/dispatch body (worker → API).
export const alertsDispatchSchema = z.object({
  bucket: z.string().min(1).max(64).optional(),
});
export type AlertsDispatchInput = z.infer<typeof alertsDispatchSchema>;

// ── Macro segment ─────────────────────────────────────────────────────────────
// The single dashboard JSON the terminal AND the Claude assistant both consume.
// Decimals are serialized to numbers, timestamps to ISO strings over the wire.

export const macroIngestSchema = z.object({
  /** Marker carried through for logging/idempotency (cron tick). */
  reason: z.string().default('cron'),
});
export type MacroIngestInput = z.infer<typeof macroIngestSchema>;

export const macroRegimeSchema = z.object({
  growth: z.enum(['up', 'down']),
  inflation: z.enum(['up', 'down']),
  label: z.string(),
  recessionOdds: z.number().optional(),
});
export type MacroRegime = z.infer<typeof macroRegimeSchema>;

export const macroIndicatorDtoSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.number(),
  prev: z.number().nullable().optional(),
  forecast: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  source: z.string(),
  asOf: z.string(),
  /** Recent values oldest → newest, for a sparkline. */
  history: z.array(z.number()).optional(),
});

export const macroMarketDtoSchema = z.object({
  symbol: z.string(),
  price: z.number(),
  changePct: z.number().nullable().optional(),
  asOf: z.string(),
});

export const macroBiasDtoSchema = z.object({
  asset: z.string(),
  score: z.number(),
  label: z.string(),
  supporting: z.array(z.string()),
  opposing: z.array(z.string()),
});

export const macroEventDtoSchema = z.object({
  title: z.string(),
  country: z.string().nullable().optional(),
  impact: z.string().nullable().optional(),
  at: z.string(),
  actual: z.string().nullable().optional(),
  forecast: z.string().nullable().optional(),
  prev: z.string().nullable().optional(),
});

export const macroHeadlineDtoSchema = z.object({
  title: z.string(),
  source: z.string().nullable().optional(),
  url: z.string(),
  at: z.string(),
});

export const macroFxRateDtoSchema = z.object({
  code: z.string(),
  /** Foreign units per 1 USD. */
  rate: z.number(),
  asOf: z.string(),
});

export const macroStateSchema = z.object({
  asOf: z.string(),
  regime: macroRegimeSchema.nullable(),
  macro: z.array(macroIndicatorDtoSchema),
  markets: z.array(macroMarketDtoSchema),
  bias: z.array(macroBiasDtoSchema),
  events: z.array(macroEventDtoSchema),
  headlines: z.array(macroHeadlineDtoSchema),
  /** Optional FX basket for the strength matrix (USD base). */
  fx: z.array(macroFxRateDtoSchema).optional().default([]),
  engineVer: z.string(),
});
export type MacroState = z.infer<typeof macroStateSchema>;

// ── Macro membership (P4 gating) ─────────────────────────────────────────────

export const macroExchangeSchema = z.enum(['DELTA', 'COINDCX']);
export type MacroExchange = z.infer<typeof macroExchangeSchema>;

export const macroMemberApplySchema = z.object({
  exchange: macroExchangeSchema,
  /** Exchange user id — trimmed, non-empty, length-capped. */
  exchangeUid: z.string().trim().min(1).max(128),
});
export type MacroMemberApplyInput = z.infer<typeof macroMemberApplySchema>;

export const macroMemberStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED']);

export const macroMemberDtoSchema = z.object({
  id: z.string(),
  exchange: z.string(),
  exchangeUid: z.string(),
  status: macroMemberStatusSchema,
  plan: z.string(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MacroMemberDto = z.infer<typeof macroMemberDtoSchema>;

export const macroMemberDecisionSchema = z.object({
  /** Optional note for logs; not shown to the applicant in MVP. */
  note: z.string().max(500).optional(),
});
export type MacroMemberDecisionInput = z.infer<typeof macroMemberDecisionSchema>;

// ── Macro signals (P5) ───────────────────────────────────────────────────────

export const macroSignalDirectionSchema = z.enum(['LONG', 'SHORT', 'WAIT']);

export const macroSignalDtoSchema = z.object({
  id: z.string().optional(),
  asset: z.string(),
  direction: macroSignalDirectionSchema,
  entryLow: z.number(),
  entryHigh: z.number(),
  stop: z.number(),
  t1: z.number(),
  t2: z.number(),
  t3: z.number(),
  confidence: z.number(),
  rationale: z.string(),
  invalidation: z.string(),
  accountSize: z.number(),
  qty: z.number().nullable(),
  asOf: z.string(),
  engineVer: z.string(),
});
export type MacroSignalDto = z.infer<typeof macroSignalDtoSchema>;

// ── Macro assistant (P6) ─────────────────────────────────────────────────────

export const macroAssistantSchema = z.object({
  question: z.string().trim().min(1).max(2000),
});
export type MacroAssistantInput = z.infer<typeof macroAssistantSchema>;

// ── Trader Master (on-demand technical analysis) ─────────────────────────────
// An instrument + timeframe(s) → a structured "Analysis Report": direction,
// entry zone, stop, three targets, support/resistance, confidence, rationale.
// Chart-driven (OHLCV features), LLM-narrated, engine-validated levels.

// TA-meaningful subset of MARKET_TIMEFRAMES. A single tf = single-timeframe
// analysis; more than one = top-down multi-timeframe.
export const TRADER_TIMEFRAMES = ['15m', '1h', '4h', '1d'] as const;
export const traderTimeframeSchema = z.enum(TRADER_TIMEFRAMES);
export type TraderTimeframe = z.infer<typeof traderTimeframeSchema>;

export const traderDirectionSchema = z.enum(['LONG', 'SHORT', 'WAIT']);
export type TraderDirection = z.infer<typeof traderDirectionSchema>;

// POST /api/trader/analyze body.
export const traderAnalyzeSchema = z.object({
  symbol: z.string().trim().min(1).max(32),
  // 1..4 distinct timeframes; deduped/validated server-side too.
  timeframes: z.array(traderTimeframeSchema).min(1).max(TRADER_TIMEFRAMES.length),
});
export type TraderAnalyzeInput = z.infer<typeof traderAnalyzeSchema>;

// A support or resistance price with a short human label (e.g. "swing low").
export const traderLevelSchema = z.object({
  price: z.number(),
  label: z.string(),
});
export type TraderLevel = z.infer<typeof traderLevelSchema>;

// Per-timeframe read shown in the "View Detailed Analysis" breakdown.
export const traderTimeframeReadSchema = z.object({
  tf: traderTimeframeSchema,
  trend: z.enum(['up', 'down', 'range']),
  rsi: z.number(),
  atr: z.number(),
  note: z.string(),
});
export type TraderTimeframeRead = z.infer<typeof traderTimeframeReadSchema>;

export const traderOutcomeSchema = z.enum(['TARGET_HIT', 'STOP_HIT', 'EXPIRED', 'SKIPPED']);
export type TraderOutcome = z.infer<typeof traderOutcomeSchema>;

export const traderHitLevelSchema = z.enum(['T1', 'T2', 'T3']);
export type TraderHitLevel = z.infer<typeof traderHitLevelSchema>;

/** Independent lane score fed into reconcileLanes (−1 bearish … +1 bullish). */
export const traderLaneResultSchema = z.object({
  id: z.enum(['technical', 'macro', 'flow', 'news', 'ml']),
  score: z.number().min(-1).max(1),
  weight: z.number().min(0).max(1),
  rationale: z.string(),
  source: z.string().optional(),
  asOf: z.string().optional(),
  stale: z.boolean().optional(),
});
export type TraderLaneResult = z.infer<typeof traderLaneResultSchema>;

export const traderAnalysisDtoSchema = z.object({
  id: z.string().optional(),
  symbol: z.string(),
  assetClass: assetClassSchema,
  timeframes: z.array(traderTimeframeSchema),
  direction: traderDirectionSchema,
  entryLow: z.number(),
  entryHigh: z.number(),
  stop: z.number(),
  t1: z.number(),
  t2: z.number(),
  t3: z.number(),
  support: z.array(traderLevelSchema),
  resistance: z.array(traderLevelSchema),
  confidence: z.number().min(0).max(100),
  rationale: z.string(),
  invalidation: z.string(),
  detail: z.string(),
  perTimeframe: z.array(traderTimeframeReadSchema),
  laneBreakdown: z.array(traderLaneResultSchema).optional(),
  confidenceSource: z.enum(['heuristic', 'meta_v1', 'meta_lgbm']).optional(),
  rawConfidence: z.number().int().min(0).max(100).optional(),
  featureSnapshot: z
    .object({
      version: z.literal(1),
      names: z.array(z.string()),
      values: z.array(z.number()),
      heuristicConfidence: z.number(),
    })
    .optional(),
  // true when an LLM produced the narrative (levels are always engine-validated).
  aiUsed: z.boolean(),
  asOf: z.string(),
  engineVer: z.string(),
  // Triple-barrier grade — null while still open / pending candles.
  outcome: traderOutcomeSchema.nullable().optional(),
  hitLevel: traderHitLevelSchema.nullable().optional(),
  gradedAt: z.string().nullable().optional(),
  horizonBars: z.number().int().nullable().optional(),
  horizonTf: traderTimeframeSchema.nullable().optional(),
  mfePct: z.number().nullable().optional(),
  maePct: z.number().nullable().optional(),
});
export type TraderAnalysisDto = z.infer<typeof traderAnalysisDtoSchema>;

export const traderStrategyCreateSchema = z.object({
  prompt: z.string().trim().min(8).max(2000),
  symbol: z.string().trim().min(1).max(32).optional(),
  timeframe: traderTimeframeSchema.optional(),
});
export type TraderStrategyCreateInput = z.infer<typeof traderStrategyCreateSchema>;

export const traderStrategyBacktestSchema = z.object({
  symbol: z.string().trim().min(1).max(32),
  timeframe: traderTimeframeSchema.optional(),
});
export type TraderStrategyBacktestInput = z.infer<typeof traderStrategyBacktestSchema>;

export const traderMetaTrainSchema = z.object({
  bucket: z.string().min(1).max(32),
});
export type TraderMetaTrainJob = z.infer<typeof traderMetaTrainSchema>;

export const traderPaperTickSchema = z.object({
  bucket: z.string().min(1).max(32),
  limit: z.number().int().min(1).max(200).optional(),
});
export type TraderPaperTickJob = z.infer<typeof traderPaperTickSchema>;

/** Honest aggregate track record for Trader Master (wins + losses + calibration). */
export const traderCalibrationBucketSchema = z.object({
  bucket: z.string(), // e.g. "70-79"
  predicted: z.number(), // midpoint confidence used as predicted hit rate
  count: z.number().int(),
  hitRate: z.number().nullable(), // null when count === 0
  targetHits: z.number().int(),
  stopHits: z.number().int(),
  expired: z.number().int(),
});
export type TraderCalibrationBucket = z.infer<typeof traderCalibrationBucketSchema>;

export const traderTrackRecordSchema = z.object({
  sampleSize: z.number().int(),
  graded: z.number().int(),
  pending: z.number().int(),
  skipped: z.number().int(),
  targetHits: z.number().int(),
  stopHits: z.number().int(),
  expired: z.number().int(),
  /** Among TARGET_HIT + STOP_HIT only (expired excluded from win-rate denom). */
  hitRate: z.number().nullable(),
  /** Avg R expectancy using mid-entry → stop as 1R; T1=+1R, T2=+2R, T3=+3.2R approx. */
  expectancyR: z.number().nullable(),
  calibration: z.array(traderCalibrationBucketSchema),
  bySymbol: z.array(z.object({
    symbol: z.string(),
    count: z.number().int(),
    hitRate: z.number().nullable(),
    targetHits: z.number().int(),
    stopHits: z.number().int(),
  })),
  methodology: z.string(),
  disclaimer: z.string(),
  asOf: z.string(),
});
export type TraderTrackRecord = z.infer<typeof traderTrackRecordSchema>;

export const traderGradeJobSchema = z.object({
  bucket: z.string().min(1).max(32),
  limit: z.number().int().min(1).max(200).optional(),
});
export type TraderGradeJob = z.infer<typeof traderGradeJobSchema>;

// ── Platform access control + admin ───────────────────────────────────────────

export {
  accessSourceSchema,
  elefinStatusSchema,
  activityStatusSchema,
  platformAccessStatusSchema,
  accessStatusDtoSchema,
  verifyElefinSchema,
  createAccessGrantSchema,
  accessGrantDtoSchema,
  maintenanceModeSchema,
  maintenanceModeDtoSchema,
  adminOverviewDtoSchema,
  adminUserRowDtoSchema,
  adminUsersQuerySchema,
  adminBrokerDetailSchema,
  brokerBreakdownItemSchema,
  signupDayCountSchema,
  adminAuditItemSchema,
  adminEngagementDtoSchema,
  adminEngagementDaySchema,
  adminUserDossierDtoSchema,
  activityCheckResultSchema,
  type AccessSourceDto,
  type ElefinStatusDto,
  type ActivityStatusDto,
  type PlatformAccessStatusDto,
  type AccessStatusDto,
  type VerifyElefinInput,
  type CreateAccessGrantInput,
  type AccessGrantDto,
  type MaintenanceModeInput,
  type MaintenanceModeDto,
  type AdminOverviewDto,
  type AdminUserRowDto,
  type AdminBrokerDetailDto,
  type BrokerBreakdownItemDto,
  type SignupDayCountDto,
  type AdminAuditItemDto,
  type AdminEngagementDto,
  type AdminEngagementDayDto,
  type AdminUserDossierDto,
  type AdminUsersQuery,
  type ActivityCheckResult,
} from './schema/access.js';

export {
  updateLocationSchema,
  userLocationDtoSchema,
  adminGeoPointSchema,
  adminGeoDtoSchema,
  type UpdateLocationInput,
  type UserLocationDto,
  type AdminGeoPointDto,
  type AdminGeoDto,
} from './schema/location.js';
