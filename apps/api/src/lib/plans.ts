// Plans and limits (H15). Everything is free today: with PLANS_ENABLED off
// every user is on Free, which has every feature and the limits the app has
// always had. Turning paid plans on later is configuration here plus a plan
// resolver (billing); the checks below are already in every route that
// creates something countable.
import { env } from '@tradinjournal/config';
import { prisma } from '@tradinjournal/db';
import { AppError } from '../http/errors.js';

export const FEATURES = [
  'strategies.live', 'options.orders', 'copy.follow', 'copy.lead', 'trading.desk', 'webhooks', 'api.keys', 'marketplace.publish', 'ai.coach',
] as const;
export type Feature = (typeof FEATURES)[number];

export const LIMIT_KEYS = ['brokerAccounts', 'exchangeConnections', 'strategies', 'runningDeployments', 'indicatorAlerts', 'savedScreens', 'apiKeys', 'templates', 'subscriptions'] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

export const LIMIT_LABELS: Record<LimitKey, string> = {
  brokerAccounts: 'MT5 accounts', exchangeConnections: 'Exchange accounts', strategies: 'Strategies', runningDeployments: 'Running strategies',
  indicatorAlerts: 'Indicator alerts', savedScreens: 'Saved screens', apiKeys: 'Active API keys', templates: 'Published templates', subscriptions: 'Template subscriptions',
};

export interface PlanDef { label: string; features: Feature[]; limits: Record<LimitKey, number> }
export type PlanId = 'free' | 'pro';

// The limits that were hard-coded before plans existed; Free keeps them all.
const FREE_LIMITS: Record<LimitKey, number> = {
  brokerAccounts: 2, exchangeConnections: env.EXCHANGE_MAX_CONNECTIONS, strategies: 100, runningDeployments: 10,
  indicatorAlerts: 50, savedScreens: 20, apiKeys: 10, templates: 10, subscriptions: 10,
};

export const PLANS: Record<PlanId, PlanDef> = {
  free: { label: 'Free', features: [...FEATURES], limits: FREE_LIMITS },
  // Not sold yet; here so turning plans on is a config change, not a code change.
  pro: { label: 'Pro', features: [...FEATURES], limits: { ...FREE_LIMITS, brokerAccounts: 10, strategies: 500, runningDeployments: 50, indicatorAlerts: 200, savedScreens: 100, templates: 50, subscriptions: 50 } },
};

function assignments(): Map<string, PlanId> {
  const m = new Map<string, PlanId>();
  for (const part of (env.PLAN_ASSIGNMENTS ?? '').split(';')) {
    const [plan, emails] = part.split(':');
    if (!plan || !emails || !(plan.trim() in PLANS)) continue;
    for (const e of emails.split(',')) if (e.trim()) m.set(e.trim().toLowerCase(), plan.trim() as PlanId);
  }
  return m;
}

/** Which plan a user is on. Free whenever plans are off. */
export async function planOf(userId: string): Promise<PlanId> {
  if (!env.PLANS_ENABLED) return 'free';
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return (u && assignments().get(u.email.toLowerCase())) ?? 'free';
}

export class PlanLimitError extends AppError {
  constructor(message: string) {
    super(409, 'PLAN_LIMIT', message);
  }
}

export async function hasFeature(userId: string, f: Feature): Promise<boolean> {
  return PLANS[await planOf(userId)].features.includes(f);
}

export async function requireFeatureFor(userId: string, f: Feature, what: string): Promise<void> {
  if (!(await hasFeature(userId, f))) throw new PlanLimitError(`${what} isn’t part of your plan.`);
}

export async function limitOf(userId: string, key: LimitKey): Promise<number> {
  return PLANS[await planOf(userId)].limits[key];
}

/**
 * Refuse a create that would go past the plan's limit. `used` is how many
 * already count; the message says what to do instead of just "no".
 */
export async function assertWithinLimit(userId: string, key: LimitKey, used: number, hint: string): Promise<void> {
  const max = await limitOf(userId, key);
  if (used >= max) throw new PlanLimitError(`You can have up to ${max} ${LIMIT_LABELS[key].toLowerCase()}${env.PLANS_ENABLED ? ' on your plan' : ''}. ${hint}`);
}

const USAGE: Record<LimitKey, (userId: string) => Promise<number>> = {
  brokerAccounts: (userId) => prisma.brokerAccount.count({ where: { userId } }),
  exchangeConnections: (userId) => prisma.exchangeConnection.count({ where: { userId, status: { not: 'REVOKED' } } }),
  strategies: (userId) => prisma.strategy.count({ where: { userId, status: { not: 'archived' } } }),
  runningDeployments: (userId) => prisma.strategyDeployment.count({ where: { userId, status: { in: ['running', 'paused', 'stopping'] } } }),
  indicatorAlerts: (userId) => prisma.indicatorAlert.count({ where: { userId } }),
  savedScreens: (userId) => prisma.savedScreen.count({ where: { userId } }),
  apiKeys: (userId) => prisma.apiKey.count({ where: { userId, revokedAt: null } }),
  templates: (userId) => prisma.strategyTemplate.count({ where: { creatorId: userId, status: { in: ['pending', 'published'] } } }),
  subscriptions: (userId) => prisma.templateSubscription.count({ where: { userId, status: { in: ['active', 'paused'] } } }),
};
export const usageOf = (userId: string, key: LimitKey) => USAGE[key](userId);

export async function planSummary(userId: string) {
  const plan = await planOf(userId);
  const def = PLANS[plan];
  const used = await Promise.all(LIMIT_KEYS.map((k) => USAGE[k](userId)));
  return {
    plan, label: def.label, plansEnabled: env.PLANS_ENABLED,
    features: Object.fromEntries(FEATURES.map((f) => [f, def.features.includes(f)])) as Record<Feature, boolean>,
    limits: LIMIT_KEYS.map((k, i) => ({ key: k, label: LIMIT_LABELS[k], limit: def.limits[k], used: used[i]! })),
  };
}

/** Route guard: the feature must be on the user's plan (always true while everything is free). */
export function requireFeature(f: Feature, what: string) {
  return (_req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    requireFeatureFor(res.locals.user.id as string, f, what).then(() => next(), next);
  };
}
