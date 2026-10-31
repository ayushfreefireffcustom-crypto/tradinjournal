// Client for the trading platform: exchange connections, the copy-trading
// leaderboard and leader pages, and the user's follows. Types are declared
// locally (like partner-api.ts) and kept in lockstep with
// packages/contracts/src/schema/exchange.ts and copy.ts.
const API = process.env.NEXT_PUBLIC_API_URL || '';

/** Bump with COPY_RISK_VERSION in packages/contracts/src/schema/copy.ts. */
export const COPY_RISK_VERSION = '2026-10-31';

export type ExchangeEnvironment = 'TESTNET' | 'LIVE';
export type LeaderRange = '7d' | '30d' | 'all';
export type LeaderSort = 'roi' | 'pnl' | 'drawdown' | 'followers' | 'winrate' | 'sharpe' | 'newest';
export type SizingMode = 'PROPORTIONAL' | 'FIXED_NOTIONAL' | 'MULTIPLIER';
export type RiskGrade = 'A' | 'B' | 'C' | 'D' | 'E';
export type FollowStatus = 'ACTIVE' | 'PAUSED' | 'STOPPED';

export interface ExchangeConnection {
  id: string;
  exchange: 'DELTA_INDIA';
  environment: ExchangeEnvironment;
  label: string;
  keyLast4: string;
  canTrade: boolean;
  status: 'ACTIVE' | 'INVALID' | 'REVOKED';
  lastError: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
  isLeader: boolean;
  activeFollows: number;
}

export interface ExchangeCatalogItem {
  id: string;
  displayName: string;
  availability: 'LIVE' | 'TESTNET_ONLY' | 'COMING_SOON';
  environments: ExchangeEnvironment[];
  requiredFields: Array<{ id: 'apiKey' | 'apiSecret' | 'passphrase'; label: string; secret: boolean }>;
  keyInstructions: string;
  keyPageUrl: { testnet?: string; live?: string };
  ipWhitelistRequired: boolean;
  whitelistIps: string[];
}

export interface LeaderStats {
  range: LeaderRange;
  roiPct: number | null;
  pnlUsd: number | null;
  maxDrawdownPct: number | null;
  winRatePct: number | null;
  tradeCount: number;
  sharpe: number | null;
  profitableWeeksPct: number | null;
}

export interface LeaderCard {
  id: string;
  displayName: string;
  bio: string | null;
  exchange: string;
  environment: ExchangeEnvironment;
  followers: number;
  maxFollowers: number | null;
  daysActive: number;
  equityUsd: number | null;
  stats: LeaderStats;
  riskGrade: RiskGrade | null;
  recommendedMarginUsd: number | null;
  sparkline: number[];
  following: boolean;
  isMine: boolean;
}

export interface LeaderDetail extends LeaderCard {
  createdAt: string;
  statsByRange: Record<LeaderRange, LeaderStats>;
  openPositions: Array<{ symbol: string; side: 'LONG' | 'SHORT'; size: number; since: string | null }>;
  lastTradeAt: string | null;
}

export interface LeaderTrade {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  qty: number;
  price: number;
  reduceOnly: boolean;
  positionAfter: number | null;
  at: string;
}

export interface MyLeader {
  id: string;
  displayName: string;
  bio: string | null;
  status: 'PENDING' | 'VERIFIED' | 'PAUSED' | 'DELISTED';
  listed: boolean;
  connectionId: string;
  connectionLabel: string;
  followers: number;
  pausedFollowers: number;
  openCopiedPositions: number;
  followersPnlUsd: number;
  createdAt: string;
}

export interface Follow {
  id: string;
  status: FollowStatus;
  pauseReason: string | null;
  leader: { id: string; displayName: string; status: string; exchange: string };
  connection: { id: string; label: string; status: string; environment: ExchangeEnvironment };
  sizingMode: SizingMode;
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

export interface FollowPosition {
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

export interface FollowDetail extends Follow {
  positions: FollowPosition[];
  trackingErrorBps: number | null;
  medianLatencyMs: number | null;
}

export interface CopiedOrder {
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

export interface Page<T> { items: T[]; nextCursor: string | null }

/** Settings shared by starting and editing a follow. */
export interface FollowSettings {
  sizingMode: SizingMode;
  sizingValue: number;
  leverage?: number | null;
  maxPositionUsd?: number | null;
  dailyLossLimitUsd?: number | null;
  maxProfitUsd?: number | null;
  copyReverse?: boolean;
}

export interface StopResult { follow: Follow; closes: Array<{ symbol: string; ok: boolean; qty: number; message: string }> }

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly details?: Record<string, string[]>) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { code?: string; message?: string; details?: Record<string, string[]> } } | null;
  if (!res.ok) {
    const details = json?.error?.details;
    // Validation errors: lead with the first field message, it's the useful one.
    const first = details ? Object.values(details).flat()[0] : undefined;
    throw new ApiError(first ?? json?.error?.message ?? `Request failed (${res.status})`, res.status, json?.error?.code, details);
  }
  return json!.data as T;
}

const body = (b: unknown): RequestInit => ({ body: JSON.stringify(b) });
const qs = (o: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const exchangesApi = {
  catalog: () => call<ExchangeCatalogItem[]>('/exchanges/catalog'),
  list: () => call<ExchangeConnection[]>('/exchanges'),
  connect: (b: { exchange: 'DELTA_INDIA'; environment: ExchangeEnvironment; label?: string; apiKey: string; apiSecret: string; passphrase?: string }) =>
    call<ExchangeConnection>('/exchanges', { method: 'POST', ...body(b) }),
  test: (id: string) => call<ExchangeConnection>(`/exchanges/${id}/test`, { method: 'POST', ...body({}) }),
  rename: (id: string, label: string) => call<ExchangeConnection>(`/exchanges/${id}`, { method: 'PATCH', ...body({ label }) }),
  remove: (id: string) => call<{ ok: true }>(`/exchanges/${id}`, { method: 'DELETE' }),
  equity: (id: string) => call<{ equityUsd: number; availableUsd: number; baseCurrency: string }>(`/exchanges/${id}/equity`),
};

export const leadersApi = {
  list: (q: { sort?: LeaderSort; range?: LeaderRange; q?: string }) => call<LeaderCard[]>(`/leaders${qs(q)}`),
  get: (id: string, range: LeaderRange) => call<LeaderDetail>(`/leaders/${id}${qs({ range })}`),
  trades: (id: string, cursor?: string) => call<Page<LeaderTrade>>(`/leaders/${id}/trades${qs({ cursor, limit: 25 })}`),
  equity: (id: string, range: LeaderRange) => call<Array<{ t: string; equityUsd: number }>>(`/leaders/${id}/equity${qs({ range })}`),
  me: () => call<MyLeader | null>('/leaders/me'),
  apply: (b: { connectionId: string; displayName: string; bio: string }) => call<MyLeader>('/leaders/apply', { method: 'POST', ...body(b) }),
  updateMe: (b: { displayName?: string; bio?: string; listed?: boolean }) => call<MyLeader>('/leaders/me', { method: 'PATCH', ...body(b) }),
};

export const followsApi = {
  list: (all = false) => call<Follow[]>(`/follows${all ? '?all=1' : ''}`),
  get: (id: string) => call<FollowDetail>(`/follows/${id}`),
  orders: (id: string, cursor?: string) => call<Page<CopiedOrder>>(`/follows/${id}/orders${qs({ cursor, limit: 25 })}`),
  create: (b: FollowSettings & { leaderId: string; connectionId: string }) =>
    call<Follow>('/follows', { method: 'POST', ...body({ ...b, riskAccepted: true, riskVersion: COPY_RISK_VERSION }) }),
  update: (id: string, b: Partial<FollowSettings> & { action?: 'pause' | 'resume' }) => call<Follow>(`/follows/${id}`, { method: 'PATCH', ...body(b) }),
  stop: (id: string, closePositions: boolean) => call<StopResult>(`/follows/${id}/stop`, { method: 'POST', ...body({ closePositions }) }),
};

// ── Formatting shared by the copy-trading pages ─────────────────────────────

export const VENUE: Record<string, string> = { DELTA_INDIA: 'Delta Exchange India' };
export const venueName = (id: string) => VENUE[id] ?? id;

export function usd(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
export function signedUsd(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
export function pct(v: number | null | undefined, digits = 1, signed = false): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const s = `${Math.abs(v).toFixed(digits)}%`;
  return signed ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${s}` : v < 0 ? `−${s}` : s;
}
export const toneOf = (v: number | null | undefined) => (v == null || v === 0 ? '' : v > 0 ? 'pos' : 'neg');

export function price(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const digits = Math.abs(v) >= 1000 ? 1 : Math.abs(v) >= 1 ? 2 : 5;
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function sizingLabel(mode: SizingMode, value: number): string {
  if (mode === 'FIXED_NOTIONAL') return `${usd(value, 0)} per trade`;
  if (mode === 'MULTIPLIER') return `${value}× the leader's size`;
  return value === 1 ? 'Matched to your balance' : `Matched to your balance × ${value}`;
}

export const RANGE_LABEL: Record<LeaderRange, string> = { '7d': '7 days', '30d': '30 days', all: 'All time' };

// ── Admin (C5) ──────────────────────────────────────────────────────────────

export type LeaderStatus = 'PENDING' | 'VERIFIED' | 'PAUSED' | 'DELISTED';
export type AdminLeaderAction = 'approve' | 'reject' | 'pause' | 'resume' | 'delist';

export interface AdminLeaderRow {
  id: string;
  displayName: string;
  bio: string | null;
  status: LeaderStatus;
  listed: boolean;
  user: { id: string; name: string; email: string };
  connection: { id: string; label: string; exchange: string; environment: ExchangeEnvironment; status: string; keyLast4: string };
  followers: number;
  roi30dPct: number | null;
  maxDrawdownAllPct: number | null;
  equityUsd: number | null;
  tradeCount: number;
  lastTradeAt: string | null;
  createdAt: string;
}

export interface KillSwitch { enabled: boolean; reason: string | null; by: string | null; at: string | null }

export interface EngineHealth {
  engine: { up: boolean; lastBeatAt: string | null; startedAt: string | null; liveWatchers: number | null };
  killSwitch: KillSwitch;
  leaders: Record<LeaderStatus, number>;
  follows: Record<FollowStatus, number>;
  watchedLeaders: number;
  lastLeaderFillAt: string | null;
  last24h: { filled: number; skipped: number; rejected: number; medianLatencyMs: number | null; p90LatencyMs: number | null; meanAbsSlippageBps: number | null; topReasons: Array<{ reason: string; count: number }> };
  brokenConnections: number;
  driftPositions: number;
}

export interface AdminUserCopy {
  connections: Array<{ id: string; label: string; exchange: string; environment: ExchangeEnvironment; status: string; lastError: string | null; keyLast4: string; createdAt: string }>;
  leader: { id: string; displayName: string; status: string } | null;
  follows: Follow[];
}

export const adminCopyApi = {
  leaders: (status?: LeaderStatus) => call<AdminLeaderRow[]>(`/admin/copy/leaders${qs({ status })}`),
  act: (id: string, action: AdminLeaderAction, reason?: string) => call<{ id: string; status: string }>(`/admin/copy/leaders/${id}/action`, { method: 'POST', ...body({ action, reason }) }),
  killSwitch: () => call<KillSwitch>('/admin/copy/kill-switch'),
  setKillSwitch: (enabled: boolean, reason?: string) => call<KillSwitch>('/admin/copy/kill-switch', { method: 'POST', ...body({ enabled, reason }) }),
  health: () => call<EngineHealth>('/admin/copy/health'),
  user: (id: string) => call<AdminUserCopy>(`/admin/copy/users/${id}`),
  stopFollow: (id: string, reason: string) => call<StopResult>(`/admin/copy/follows/${id}/stop`, { method: 'POST', ...body({ reason }) }),
};
