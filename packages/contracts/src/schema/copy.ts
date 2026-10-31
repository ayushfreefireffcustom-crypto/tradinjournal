import { z } from 'zod';

// ── Copy trading: leaders and follows (Part C) ──────────────────────────────

export const leaderRanges = ['7d', '30d', 'all'] as const;
export const leaderSorts = ['roi', 'pnl', 'drawdown', 'followers', 'winrate', 'sharpe', 'newest'] as const;
export const copySizingModes = ['PROPORTIONAL', 'FIXED_NOTIONAL', 'MULTIPLIER'] as const;
export type LeaderRange = (typeof leaderRanges)[number];
export type CopySizingModeDto = (typeof copySizingModes)[number];

/** Bump when the follow risk disclosure text changes; stored on each follow. */
export const COPY_RISK_VERSION = '2026-10-31';

export const leadersQuerySchema = z.object({
  sort: z.enum(leaderSorts).default('roi'),
  range: z.enum(leaderRanges).default('30d'),
  q: z.string().trim().max(60).optional(),
});
export type LeadersQuery = z.infer<typeof leadersQuerySchema>;

export const leaderRangeQuerySchema = z.object({ range: z.enum(leaderRanges).default('30d') });

export const cursorQuerySchema = z.object({
  cursor: z.string().min(1).max(40).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type CursorQuery = z.infer<typeof cursorQuerySchema>;

const displayName = z.string().trim().min(2, 'At least 2 characters.').max(40);
const bio = z.string().trim().max(2000);

export const applyLeaderSchema = z.object({
  connectionId: z.string().min(1),
  displayName,
  bio: bio.min(20, 'Tell followers a little about your strategy (20 characters or more).'),
});
export type ApplyLeaderInput = z.infer<typeof applyLeaderSchema>;

export const updateLeaderSchema = z
  .object({ displayName: displayName.optional(), bio: bio.optional(), listed: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update.');
export type UpdateLeaderInput = z.infer<typeof updateLeaderSchema>;

const usd = z.coerce.number().positive().max(10_000_000);

/** Sizing value ranges per mode; shared by create and edit. */
function checkSizing(v: { sizingMode?: CopySizingModeDto; sizingValue?: number }, ctx: z.RefinementCtx) {
  if (v.sizingMode == null || v.sizingValue == null) return;
  const [min, max, what] =
    v.sizingMode === 'FIXED_NOTIONAL' ? [1, 1_000_000, 'Amount per trade must be between $1 and $1,000,000.'] : [0.01, 100, 'Multiplier must be between 0.01× and 100×.'];
  if (v.sizingValue < min || v.sizingValue > max) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sizingValue'], message: what as string });
}

const followSettings = {
  sizingMode: z.enum(copySizingModes),
  sizingValue: z.coerce.number().positive(),
  leverage: z.coerce.number().int().min(1).max(100).nullable().optional(),
  maxPositionUsd: usd.nullable().optional(),
  dailyLossLimitUsd: usd.nullable().optional(),
  maxProfitUsd: usd.nullable().optional(),
  copyReverse: z.boolean().optional(),
};

export const createFollowSchema = z
  .object({
    leaderId: z.string().min(1),
    connectionId: z.string().min(1),
    ...followSettings,
    sizingMode: followSettings.sizingMode.default('PROPORTIONAL'),
    sizingValue: followSettings.sizingValue.default(1),
    riskAccepted: z.literal(true, { errorMap: () => ({ message: 'Read and accept the risk notice to start copying.' }) }),
    riskVersion: z.literal(COPY_RISK_VERSION, { errorMap: () => ({ message: 'The risk notice changed. Reload and accept it again.' }) }),
  })
  .superRefine(checkSizing);
export type CreateFollowInput = z.infer<typeof createFollowSchema>;

export const updateFollowSchema = z
  .object({
    action: z.enum(['pause', 'resume']).optional(),
    sizingMode: followSettings.sizingMode.optional(),
    sizingValue: followSettings.sizingValue.optional(),
    leverage: followSettings.leverage,
    maxPositionUsd: followSettings.maxPositionUsd,
    dailyLossLimitUsd: followSettings.dailyLossLimitUsd,
    maxProfitUsd: followSettings.maxProfitUsd,
    copyReverse: followSettings.copyReverse,
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update.')
  .refine((v) => (v.sizingMode == null) === (v.sizingValue == null), { message: 'Send the sizing mode and value together.', path: ['sizingValue'] })
  .superRefine(checkSizing);
export type UpdateFollowInput = z.infer<typeof updateFollowSchema>;

export const stopFollowSchema = z.object({ closePositions: z.boolean().default(false) });
export type StopFollowInput = z.infer<typeof stopFollowSchema>;

// ── DTOs ────────────────────────────────────────────────────────────────────

export type RiskGrade = 'A' | 'B' | 'C' | 'D' | 'E';

export interface LeaderStatsDto {
  range: LeaderRange;
  /** null until the engine has computed stats for this leader. */
  roiPct: number | null;
  /** Equity change over the range in USD (includes deposits and withdrawals). */
  pnlUsd: number | null;
  maxDrawdownPct: number | null;
  /** null until the leader has closed copied positions. */
  winRatePct: number | null;
  tradeCount: number;
  /** Annualised, from daily equity returns; null under 14 days of history. */
  sharpe: number | null;
  /** Share of weeks equity rose; null under 4 weeks of history. */
  profitableWeeksPct: number | null;
}

export interface LeaderCardDto {
  id: string;
  displayName: string;
  bio: string | null;
  exchange: string;
  environment: 'TESTNET' | 'LIVE';
  followers: number;
  maxFollowers: number | null;
  daysActive: number;
  equityUsd: number | null;
  stats: LeaderStatsDto;
  /** null while there is too little history to grade. */
  riskGrade: RiskGrade | null;
  /** Capital to copy at 1× without most trades rounding to zero; null when unknown. */
  recommendedMarginUsd: number | null;
  /** Downsampled equity curve for the range. */
  sparkline: number[];
  /** The signed-in user already copies this leader (active or paused). */
  following: boolean;
  isMine: boolean;
}

export interface LeaderOpenPositionDto {
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  /** When the position opened, if we saw it open; null for ones opened before we watched. */
  since: string | null;
}

export interface LeaderDetailDto extends LeaderCardDto {
  createdAt: string;
  statsByRange: Record<LeaderRange, LeaderStatsDto>;
  openPositions: LeaderOpenPositionDto[];
  lastTradeAt: string | null;
}

export interface LeaderTradeDto {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  qty: number;
  price: number;
  reduceOnly: boolean;
  positionAfter: number | null;
  at: string;
}

export interface EquityPointDto {
  t: string;
  equityUsd: number;
}

export interface MyLeaderDto {
  id: string;
  displayName: string;
  bio: string | null;
  status: 'PENDING' | 'VERIFIED' | 'PAUSED' | 'DELISTED';
  listed: boolean;
  connectionId: string;
  connectionLabel: string;
  followers: number;
  pausedFollowers: number;
  /** Followers' copied positions that are open now. */
  openCopiedPositions: number;
  /** Followers' total copy P&L (realized + unrealized), USD. */
  followersPnlUsd: number;
  createdAt: string;
}

export interface FollowDto {
  id: string;
  status: 'ACTIVE' | 'PAUSED' | 'STOPPED';
  pauseReason: string | null;
  leader: { id: string; displayName: string; status: string; exchange: string };
  connection: { id: string; label: string; status: string; environment: 'TESTNET' | 'LIVE' };
  sizingMode: CopySizingModeDto;
  sizingValue: number;
  leverage: number | null;
  maxPositionUsd: number | null;
  dailyLossLimitUsd: number | null;
  maxProfitUsd: number | null;
  copyReverse: boolean;
  startedAt: string;
  pausedAt: string | null;
  stoppedAt: string | null;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  openPositions: number;
  copiedOrders: number;
  skippedOrders: number;
  failedOrders: number;
  lastCopyAt: string | null;
}

export interface FollowPositionDto {
  symbol: string;
  side: 'LONG' | 'SHORT';
  qty: number;
  avgEntry: number;
  markPrice: number | null;
  unrealizedPnlUsd: number;
  realizedPnlUsd: number;
  openedAt: string;
  drift: boolean;
}

export interface FollowDetailDto extends FollowDto {
  positions: FollowPositionDto[];
  /** Mean |slippage| across filled copies, in basis points; null with no fills. */
  trackingErrorBps: number | null;
  /** Median time from the leader's fill to our order being filled, ms. */
  medianLatencyMs: number | null;
}

export interface CopiedOrderDto {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  qty: number;
  filledQty: number;
  reduceOnly: boolean;
  status: string;
  leaderPrice: number | null;
  fillPrice: number | null;
  slippageBps: number | null;
  realizedPnlUsd: number | null;
  error: string | null;
  leaderAt: string | null;
  requestedAt: string;
  filledAt: string | null;
}

export interface StopFollowResultDto {
  follow: FollowDto;
  /** One per open position when closing was asked for. */
  closes: Array<{ symbol: string; ok: boolean; qty: number; message: string }>;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

// ── Admin (C5) ──────────────────────────────────────────────────────────────

export const adminLeaderActions = ['approve', 'reject', 'pause', 'resume', 'delist'] as const;
export type AdminLeaderAction = (typeof adminLeaderActions)[number];

export const adminLeaderActionSchema = z.object({
  action: z.enum(adminLeaderActions),
  /** Shown to the leader for reject, pause and delist. */
  reason: z.string().trim().max(500).optional(),
});
export type AdminLeaderActionInput = z.infer<typeof adminLeaderActionSchema>;

export const adminLeadersQuerySchema = z.object({ status: z.enum(['PENDING', 'VERIFIED', 'PAUSED', 'DELISTED']).optional() });

export const killSwitchSchema = z
  .object({ enabled: z.boolean(), reason: z.string().trim().max(500).optional() })
  .refine((v) => !v.enabled || (v.reason?.length ?? 0) >= 3, { message: 'Say why copying is being stopped.', path: ['reason'] });
export type KillSwitchInput = z.infer<typeof killSwitchSchema>;

export const adminStopFollowSchema = z.object({ reason: z.string().trim().min(3, 'Say why.').max(500) });

export interface AdminLeaderRowDto {
  id: string;
  displayName: string;
  bio: string | null;
  status: 'PENDING' | 'VERIFIED' | 'PAUSED' | 'DELISTED';
  listed: boolean;
  user: { id: string; name: string; email: string };
  connection: { id: string; label: string; exchange: string; environment: 'TESTNET' | 'LIVE'; status: string; keyLast4: string };
  followers: number;
  roi30dPct: number | null;
  maxDrawdownAllPct: number | null;
  equityUsd: number | null;
  tradeCount: number;
  lastTradeAt: string | null;
  createdAt: string;
}

export interface KillSwitchDto {
  enabled: boolean;
  reason: string | null;
  by: string | null;
  at: string | null;
}

export interface EngineHealthDto {
  engine: { up: boolean; lastBeatAt: string | null; startedAt: string | null; liveWatchers: number | null };
  killSwitch: KillSwitchDto;
  leaders: Record<'PENDING' | 'VERIFIED' | 'PAUSED' | 'DELISTED', number>;
  follows: Record<'ACTIVE' | 'PAUSED' | 'STOPPED', number>;
  /** Leaders the engine should be watching (live, working key, with followers). */
  watchedLeaders: number;
  lastLeaderFillAt: string | null;
  last24h: {
    filled: number;
    skipped: number;
    rejected: number;
    medianLatencyMs: number | null;
    p90LatencyMs: number | null;
    meanAbsSlippageBps: number | null;
    topReasons: Array<{ reason: string; count: number }>;
  };
  brokenConnections: number;
  driftPositions: number;
}

export interface AdminUserCopyDto {
  connections: Array<{ id: string; label: string; exchange: string; environment: 'TESTNET' | 'LIVE'; status: string; lastError: string | null; keyLast4: string; createdAt: string }>;
  leader: { id: string; displayName: string; status: string } | null;
  follows: FollowDto[];
}
