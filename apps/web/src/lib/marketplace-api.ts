// Client for the strategy marketplace (H1–H3).
import { ApiError } from '@/lib/copy-api';

const API = process.env.NEXT_PUBLIC_API_URL || '';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/api${path}`, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { code?: string; message?: string; details?: Record<string, string[]> } } | null;
  if (!res.ok) {
    const details = json?.error?.details;
    const first = details ? Object.values(details).flat()[0] : undefined;
    throw new ApiError(first ?? json?.error?.message ?? `Request failed (${res.status})`, res.status, json?.error?.code, details);
  }
  return json!.data as T;
}
const body = (method: string, b: unknown): RequestInit => ({ method, body: JSON.stringify(b) });

export const CATEGORIES: Array<[Category, string]> = [['trend', 'Trend'], ['reversion', 'Mean reversion'], ['breakout', 'Breakout'], ['momentum', 'Momentum'], ['range', 'Range'], ['scalping', 'Scalping']];
export const RISKS: Array<[Risk, string]> = [['low', 'Low risk'], ['medium', 'Medium risk'], ['high', 'High risk']];
export type Category = 'trend' | 'reversion' | 'breakout' | 'momentum' | 'range' | 'scalping';
export type Risk = 'low' | 'medium' | 'high';
export type Sort = 'popular' | 'return' | 'drawdown' | 'newest';

export interface Backtest { days: number; totalReturnPct: number | null; maxDrawdownPct: number | null; winRatePct: number | null; profitFactor: number | null; trades: number | null; sharpe: number | null; avgTradePct: number | null; exposurePct: number | null }
export interface Track { mode: 'paper' | 'live'; status: string; since: string; trades: number; pnl: number; returnPct: number | null; winRatePct: number | null }
export interface Card {
  id: string; name: string; summary: string; category: Category; risk: Risk; symbols: string[]; interval: string; exchanges: string[]; creator: string; subscribers: number; publishedAt: string | null;
  backtest: Backtest | null; track: Track | null;
  facts: { direction: 'long' | 'short' | 'both'; leverage: number; venue: string; hasStop: boolean; hasTarget: boolean; trailing: boolean; sessions: boolean; sizing: string };
}
export interface Param { key: string; label: string; min: number; max: number; step: number; value: number }
export interface Detail extends Card {
  description: string; status: string; isCreator: boolean;
  creatorProfile: { displayName: string; bio: string; links: string[] } | null;
  params: Param[]; equity: Array<{ t: number; equity: number }>; backtestWindow: { from: string; to: string } | null; computedAt: string | null;
  subscription: { id: string; status: string; deploymentId: string | null } | null;
}
export interface Subscription {
  id: string; status: 'active' | 'paused' | 'cancelled' | 'ended' | 'attention'; createdAt: string; cancelledAt: string | null;
  template: { id: string; name: string; creator: string; listed: boolean } | null;
  params: Array<{ key: string; label: string; value: number }>;
  deployment: { id: string; mode: 'paper' | 'live'; status: string; capital: number; multiplier: number; closedPnl: number; trades: number; openPnl: number | null; startedAt: string; error: string | null } | null;
}
export interface Creator { id: string; displayName: string; bio: string; experience: string | null; links: string[]; status: 'pending' | 'approved' | 'rejected' | 'suspended'; reviewNote: string | null; createdAt: string }
export interface CandidateParam { key: string; id: string; label: string; min: number; max: number; step: number; value: number }
export interface MyTemplate {
  id: string; name: string; summary: string; description: string; category: Category; risk: Risk; status: 'pending' | 'published' | 'rejected' | 'unlisted'; reviewNote: string | null;
  params: CandidateParam[]; exchanges: string[]; symbols: string[]; interval: string; version: number; strategyId: string | null; trackDeploymentId: string | null;
  performance: { backtest: { days: number; metrics: Partial<Backtest> } | null; note?: string } | null; subscribers: number; publishedAt: string | null; updatedAt: string;
}
export interface PublishOptions {
  strategy: { id: string; name: string; version: number; venue: string; symbols: string[]; interval: string };
  candidates: CandidateParam[]; liveIssues: string[];
  runs: Array<{ id: string; mode: string; status: string; startedAt: string; version: number }>;
}
export interface TemplateInput { strategyId: string; name: string; summary: string; description: string; category: Category; risk: Risk; params: Array<{ id: string; label?: string; min: number; max: number; step: number }>; exchanges: string[]; trackDeploymentId?: string | null }
export interface AdminQueue {
  creators: Array<Creator & { email: string; name: string }>;
  templates: Array<MyTemplate & { creator: string; readback: string[]; facts: Card['facts'] }>;
}

const qs = (o: Record<string, string | undefined>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v) p.set(k, v); const s = p.toString(); return s ? `?${s}` : ''; };

export const marketApi = {
  browse: (q: { category?: string; risk?: string; symbol?: string; q?: string; sort?: Sort }) => call<Card[]>(`/marketplace${qs(q)}`),
  detail: (id: string) => call<Detail>(`/marketplace/${id}`),
  subscribe: (id: string, b: { mode: 'paper' | 'live'; capital?: number; connectionId?: string; confirmLive?: boolean; params?: Record<string, number> }) => call<{ id: string; deploymentId: string }>(`/marketplace/${id}/subscribe`, body('POST', b)),
  subscriptions: () => call<Subscription[]>('/marketplace/subscriptions'),
  manage: (id: string, action: 'pause' | 'resume' | 'cancel' | 'cancel_settle') => call<Subscription>(`/marketplace/subscriptions/${id}/${action}`, { method: 'POST', body: '{}' }),
  resize: (id: string, multiplier: number) => call<Subscription>(`/marketplace/subscriptions/${id}/size`, body('POST', { multiplier })),
  creator: () => call<Creator | null>('/marketplace/creator'),
  apply: (b: { displayName: string; bio: string; experience?: string; links?: string[] }) => call<Creator>('/marketplace/creator', body('POST', b)),
  mine: () => call<MyTemplate[]>('/marketplace/mine'),
  publishOptions: (strategyId: string) => call<PublishOptions>(`/marketplace/publish-options/${strategyId}`),
  publish: (b: TemplateInput) => call<MyTemplate>('/marketplace/templates', body('POST', b)),
  update: (id: string, b: Partial<Omit<TemplateInput, 'strategyId'>> & { refreshRules?: boolean }) => call<MyTemplate>(`/marketplace/templates/${id}`, body('PATCH', b)),
  listing: (id: string, listed: boolean) => call<MyTemplate>(`/marketplace/templates/${id}/${listed ? 'list' : 'unlist'}`, { method: 'POST', body: '{}' }),
  adminQueue: (status: string) => call<AdminQueue>(`/admin/marketplace?status=${status}`),
  reviewCreator: (id: string, decision: 'approve' | 'reject' | 'suspend', note?: string) => call<{ id: string; status: string }>(`/admin/marketplace/creators/${id}`, body('POST', { decision, ...(note ? { note } : {}) })),
  reviewTemplate: (id: string, decision: 'publish' | 'reject' | 'unlist', note?: string) => call<{ id: string; status: string }>(`/admin/marketplace/templates/${id}`, body('POST', { decision, ...(note ? { note } : {}) })),
};

export const catLabel = (c: string) => CATEGORIES.find((x) => x[0] === c)?.[1] ?? c;
export const riskLabel = (r: string) => RISKS.find((x) => x[0] === r)?.[1] ?? r;
export const pctS = (v: number | null | undefined, d = 1) => (v == null ? '—' : `${v >= 0.05 * 10 ** (1 - d) ? '+' : v <= -0.05 * 10 ** (1 - d) ? '−' : ''}${Math.abs(v).toFixed(d)}%`);
