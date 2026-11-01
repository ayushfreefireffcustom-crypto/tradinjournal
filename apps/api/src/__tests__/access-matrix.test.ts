// Z1: who can reach what, over the real app and auth on the local test DB.
// Every route the app registers is checked:
//   · without a session, everything under /api answers 401 (bar a short list
//     that's public on purpose) and everything under /internal needs the token;
//   · a signed-in non-admin gets 403 from every admin route;
//   · another user pointing at someone's records, by path or in a body/query,
//     gets exactly what a record that doesn't exist gets (so nothing is reached
//     and nothing is given away), the owner's rows don't change, the AI is never
//     called and no exchange call is made;
//   · lists never contain another user's ids.
// A route with a path param that isn't classified below fails the test, so new
// routes have to be thought about.
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { COPY_RISK_VERSION } from '@tradinjournal/contracts';
import type { RouteInfo } from './routes.js';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
const tag = `acl${Date.now()}`;
const PASS = 'Access-matrix-12345';

/** Open without a session on purpose, with the status an empty request gets. */
const PUBLIC: Record<string, { status: number; why: string }> = {
  'GET /api/r/:code': { status: 302, why: 'Partner referral link: counts the click and redirects to the site.' },
  'GET /api/referrals/check': { status: 422, why: 'The sign-up form checks a partner code before an account exists.' },
  'GET /api/access/maintenance': { status: 200, why: 'The maintenance banner shows before sign-in.' },
  'POST /api/hooks/tv/:token': { status: 404, why: 'TradingView alerts; the secret token is the credential.' },
  'POST /api/ai/weekly-review/unsubscribe': { status: 422, why: 'One-click unsubscribe from the email; a signed token in the body is the credential.' },
};

/** Param routes that aren't anyone's records: shared reference data. */
const SHARED: Record<string, string> = {
  'GET /api/calendar/:id': 'Economic calendar events are the same for everyone.',
  'POST /api/calendar/:id/watch': 'Watching an event adds a row for the caller only.',
  'DELETE /api/calendar/:id/watch': 'Unwatching removes the caller’s own row only.',
  'GET /api/signals/:symbol': 'Market signals for a symbol.',
  'GET /api/options/contracts/:symbol': 'Exchange contract data.',
  'GET /api/options/contracts/:symbol/candles': 'Exchange candles.',
};

const isAdminRoute = (t: string) => t.startsWith('/api/admin/') || t.startsWith('/api/macro/admin/');

/** A cuid-shaped id that matches nothing. */
const fakeId = (n: number) => `cm${tag.slice(-6)}${String(n).padStart(4, '0')}zzzzzzzzzzzzz`.slice(0, 25);

type Ids = Record<'strategy' | 'copyStrategy' | 'backtest' | 'deployment' | 'subDeployment' | 'template' | 'subscription' | 'account' | 'connection' | 'follow' | 'hiddenLeader' | 'apiKey' | 'journal' | 'conversation' | 'alert' | 'indicatorAlert' | 'screen' | 'traderStrategy' | 'partnerChannel' | 'partnerCode', string>;
interface Probe { route: string; method: string; path: (x: Ids, mine: Mine) => string; body?: (x: Ids, mine: Mine) => unknown }
/** The caller's own records, for requests that mix theirs with someone else's. */
interface Mine { strategy: string; account: string; connection: string; publicTemplate: string; publicLeader: string }

const rid = () => `acl-${Math.random().toString(36).slice(2, 12)}`;
const ticket = (connectionId: string) => ({ connectionId, symbol: 'BTCUSD', side: 'BUY', type: 'MARKET', size: { mode: 'contracts', value: 1 }, requestId: rid() });

/** Someone else's record in the path. Each must answer like a missing record. */
const PATH_PROBES: Probe[] = [
  { route: 'DELETE /api/partner/channels/:channelId', method: 'DELETE', path: (x) => `/api/partner/channels/${x.partnerChannel}` },
  { route: 'DELETE /api/partner/codes/:codeId', method: 'DELETE', path: (x) => `/api/partner/codes/${x.partnerCode}` },
  { route: 'GET /api/marketplace/publish-options/:strategyId', method: 'GET', path: (x) => `/api/marketplace/publish-options/${x.strategy}` },
  { route: 'PATCH /api/marketplace/templates/:id', method: 'PATCH', path: (x) => `/api/marketplace/templates/${x.template}`, body: () => ({ name: 'Taken over' }) },
  { route: 'POST /api/marketplace/templates/:id/:listing(list|unlist)', method: 'POST', path: (x) => `/api/marketplace/templates/${x.template}/list` },
  { route: 'POST /api/marketplace/templates/:id/:listing(list|unlist)', method: 'POST', path: (x) => `/api/marketplace/templates/${x.template}/unlist` },
  { route: 'POST /api/marketplace/subscriptions/:id/size', method: 'POST', path: (x) => `/api/marketplace/subscriptions/${x.subscription}/size`, body: () => ({ multiplier: 2 }) },
  ...['pause', 'resume', 'cancel', 'cancel_settle'].map((a): Probe => ({ route: 'POST /api/marketplace/subscriptions/:id/:action(pause|resume|cancel|cancel_settle)', method: 'POST', path: (x) => `/api/marketplace/subscriptions/${x.subscription}/${a}` })),
  { route: 'GET /api/marketplace/:id', method: 'GET', path: (x) => `/api/marketplace/${x.template}` },
  { route: 'POST /api/marketplace/:id/subscribe', method: 'POST', path: (x) => `/api/marketplace/${x.template}/subscribe`, body: () => ({ mode: 'paper', capital: 1000 }) },
  { route: 'PATCH /api/accounts/:id/credentials', method: 'PATCH', path: (x) => `/api/accounts/${x.account}/credentials`, body: () => ({ password: 'taken-over' }) },
  { route: 'POST /api/accounts/:id/sync', method: 'POST', path: (x) => `/api/accounts/${x.account}/sync` },
  { route: 'DELETE /api/accounts/:id', method: 'DELETE', path: (x) => `/api/accounts/${x.account}` },
  { route: 'POST /api/exchanges/:id/test', method: 'POST', path: (x) => `/api/exchanges/${x.connection}/test` },
  { route: 'PATCH /api/exchanges/:id', method: 'PATCH', path: (x) => `/api/exchanges/${x.connection}`, body: () => ({ label: 'Taken over' }) },
  { route: 'DELETE /api/exchanges/:id', method: 'DELETE', path: (x) => `/api/exchanges/${x.connection}` },
  { route: 'GET /api/exchanges/:id/equity', method: 'GET', path: (x) => `/api/exchanges/${x.connection}/equity` },
  // A leader who isn't approved and listed is invisible to everyone but its owner.
  { route: 'GET /api/leaders/:id', method: 'GET', path: (x) => `/api/leaders/${x.hiddenLeader}` },
  { route: 'GET /api/leaders/:id/trades', method: 'GET', path: (x) => `/api/leaders/${x.hiddenLeader}/trades` },
  { route: 'GET /api/leaders/:id/equity', method: 'GET', path: (x) => `/api/leaders/${x.hiddenLeader}/equity` },
  { route: 'GET /api/leaders/:id/round-trips', method: 'GET', path: (x) => `/api/leaders/${x.hiddenLeader}/round-trips` },
  { route: 'GET /api/follows/:id', method: 'GET', path: (x) => `/api/follows/${x.follow}` },
  { route: 'GET /api/follows/:id/orders', method: 'GET', path: (x) => `/api/follows/${x.follow}/orders` },
  { route: 'PATCH /api/follows/:id', method: 'PATCH', path: (x) => `/api/follows/${x.follow}`, body: () => ({ action: 'pause' }) },
  { route: 'POST /api/follows/:id/stop', method: 'POST', path: (x) => `/api/follows/${x.follow}/stop`, body: () => ({ closePositions: true }) },
  { route: 'POST /api/trading/api-keys/:id/revoke', method: 'POST', path: (x) => `/api/trading/api-keys/${x.apiKey}/revoke` },
  { route: 'PATCH /api/journal/:id', method: 'PATCH', path: (x) => `/api/journal/${x.journal}`, body: () => ({ body: 'Taken over' }) },
  { route: 'DELETE /api/journal/:id', method: 'DELETE', path: (x) => `/api/journal/${x.journal}` },
  { route: 'GET /api/ai/conversations/:id', method: 'GET', path: (x) => `/api/ai/conversations/${x.conversation}` },
  { route: 'DELETE /api/ai/conversations/:id', method: 'DELETE', path: (x) => `/api/ai/conversations/${x.conversation}` },
  { route: 'PATCH /api/alerts/:id', method: 'PATCH', path: (x) => `/api/alerts/${x.alert}`, body: () => ({ note: 'Taken over' }) },
  { route: 'DELETE /api/alerts/:id', method: 'DELETE', path: (x) => `/api/alerts/${x.alert}` },
  { route: 'PATCH /api/indicator-alerts/:id', method: 'PATCH', path: (x) => `/api/indicator-alerts/${x.indicatorAlert}`, body: () => ({ note: 'Taken over' }) },
  { route: 'DELETE /api/indicator-alerts/:id', method: 'DELETE', path: (x) => `/api/indicator-alerts/${x.indicatorAlert}` },
  { route: 'PATCH /api/screener/screens/:id', method: 'PATCH', path: (x) => `/api/screener/screens/${x.screen}`, body: () => ({ name: 'Taken over' }) },
  { route: 'DELETE /api/screener/screens/:id', method: 'DELETE', path: (x) => `/api/screener/screens/${x.screen}` },
  ...(['strategy', 'copyStrategy'] as const).flatMap((k): Probe[] => [
    { route: 'GET /api/strategies/:id', method: 'GET', path: (x) => `/api/strategies/${x[k]}` },
    { route: 'PATCH /api/strategies/:id', method: 'PATCH', path: (x) => `/api/strategies/${x[k]}`, body: () => ({ name: 'Taken over' }) },
    { route: 'POST /api/strategies/:id/tune', method: 'POST', path: (x) => `/api/strategies/${x[k]}/tune`, body: () => ({ goal: 'Make it win more often please' }) },
    { route: 'POST /api/strategies/:id/duplicate', method: 'POST', path: (x) => `/api/strategies/${x[k]}/duplicate` },
    { route: 'POST /api/strategies/:id/versions/:version/restore', method: 'POST', path: (x) => `/api/strategies/${x[k]}/versions/1/restore` },
    { route: 'POST /api/strategies/:id/backtests', method: 'POST', path: (x) => `/api/strategies/${x[k]}/backtests`, body: () => ({ from: '2026-09-01T00:00:00.000Z', to: '2026-09-10T00:00:00.000Z', capital: 1000, slippageBps: 5 }) },
    { route: 'POST /api/strategies/:id/deployments', method: 'POST', path: (x) => `/api/strategies/${x[k]}/deployments`, body: () => ({ mode: 'paper', capital: 1000 }) },
    { route: 'GET /api/strategies/:id/deployments', method: 'GET', path: (x) => `/api/strategies/${x[k]}/deployments` },
  ]),
  { route: 'GET /api/strategies/:id/backtests/:bid', method: 'GET', path: (x) => `/api/strategies/${x.strategy}/backtests/${x.backtest}` },
  // Their backtest under my strategy.
  { route: 'GET /api/strategies/:id/backtests/:bid', method: 'GET', path: (x, m) => `/api/strategies/${m.strategy}/backtests/${x.backtest}` },
  ...(['deployment', 'subDeployment'] as const).flatMap((k): Probe[] => [
    { route: 'GET /api/deployments/:id', method: 'GET', path: (x) => `/api/deployments/${x[k]}` },
    { route: 'POST /api/deployments/:id/size', method: 'POST', path: (x) => `/api/deployments/${x[k]}/size`, body: () => ({ multiplier: 2 }) },
    ...['pause', 'resume', 'stop', 'settle', 'emergency_close', 'archive'].map((a): Probe => ({ route: 'POST /api/deployments/:id/:action', method: 'POST', path: (x) => `/api/deployments/${x[k]}/${a}` })),
  ]),
  { route: 'POST /api/trader/strategies/:id/backtest', method: 'POST', path: (x) => `/api/trader/strategies/${x.traderStrategy}/backtest`, body: () => ({ symbol: 'BTCUSDT' }) },
  { route: 'POST /api/trader/strategies/:id/promote', method: 'POST', path: (x) => `/api/trader/strategies/${x.traderStrategy}/promote` },
  { route: 'POST /api/trader/strategies/:id/archive', method: 'POST', path: (x) => `/api/trader/strategies/${x.traderStrategy}/archive` },
];

/** Someone else's record named in a query or body, alone or next to the caller's own. */
const REF_PROBES: Probe[] = [
  ...['/api/trades/deals', '/api/trades/stats', '/api/trades/dashboard', '/api/trades'].map((p): Probe => ({ route: `GET ${p}`, method: 'GET', path: (x) => `${p}?accountId=${x.account}` })),
  { route: 'GET /api/ai/report', method: 'GET', path: (x) => `/api/ai/report?accountId=${x.account}` },
  { route: 'POST /api/ai/chat', method: 'POST', path: () => '/api/ai/chat', body: (x) => ({ accountId: x.account, messages: [{ role: 'user', content: 'How am I doing?' }] }) },
  { route: 'POST /api/ai/tool-turn', method: 'POST', path: () => '/api/ai/tool-turn', body: (x) => ({ accountId: x.account, user: 'q', assistant: 'a' }) },
  { route: 'POST /api/ai/tool-turn', method: 'POST', path: () => '/api/ai/tool-turn', body: (x, m) => ({ accountId: m.account, conversationId: x.conversation, user: 'q', assistant: 'a' }) },
  { route: 'POST /api/alerts', method: 'POST', path: () => '/api/alerts', body: (x) => ({ symbol: 'EURUSD', direction: 'above', threshold: 2, accountId: x.account }) },
  { route: 'POST /api/journal', method: 'POST', path: () => '/api/journal', body: (x) => ({ body: 'Linked to someone else', brokerAccountId: x.account }) },
  { route: 'POST /api/follows', method: 'POST', path: () => '/api/follows', body: (x, m) => ({ leaderId: m.publicLeader, connectionId: x.connection, riskAccepted: true, riskVersion: COPY_RISK_VERSION }) },
  { route: 'POST /api/follows', method: 'POST', path: () => '/api/follows', body: (x, m) => ({ leaderId: x.hiddenLeader, connectionId: m.connection, riskAccepted: true, riskVersion: COPY_RISK_VERSION }) },
  { route: 'POST /api/leaders/apply', method: 'POST', path: () => '/api/leaders/apply', body: (x) => ({ connectionId: x.connection, displayName: 'Taken over', bio: 'Twenty characters or more of bio text.' }) },
  { route: 'POST /api/trading/orders/preview', method: 'POST', path: () => '/api/trading/orders/preview', body: (x) => ticket(x.connection) },
  { route: 'POST /api/trading/orders', method: 'POST', path: () => '/api/trading/orders', body: (x) => ticket(x.connection) },
  { route: 'GET /api/trading/quote', method: 'GET', path: (x) => `/api/trading/quote?connectionId=${x.connection}&symbol=BTCUSD` },
  { route: 'GET /api/trading/history', method: 'GET', path: (x) => `/api/trading/history?connectionId=${x.connection}` },
  { route: 'POST /api/trading/history/import', method: 'POST', path: () => '/api/trading/history/import', body: (x) => ({ connectionId: x.connection }) },
  { route: 'POST /api/trading/webhook', method: 'POST', path: () => '/api/trading/webhook', body: (x) => ({ connectionId: x.connection }) },
  { route: 'PATCH /api/trading/webhook', method: 'PATCH', path: () => '/api/trading/webhook', body: (x) => ({ connectionId: x.connection }) },
  { route: 'GET /api/trading/protection', method: 'GET', path: (x) => `/api/trading/protection?connectionId=${x.connection}&symbol=BTCUSD` },
  { route: 'POST /api/trading/protection', method: 'POST', path: () => '/api/trading/protection', body: (x) => ({ connectionId: x.connection, symbol: 'BTCUSD', stopLoss: 1000 }) },
  { route: 'POST /api/trading/orders/cancel', method: 'POST', path: () => '/api/trading/orders/cancel', body: (x) => ({ connectionId: x.connection, symbol: 'BTCUSD', exchangeOrderId: '12345' }) },
  { route: 'POST /api/trading/positions/close', method: 'POST', path: () => '/api/trading/positions/close', body: (x) => ({ connectionId: x.connection, symbol: 'BTCUSD' }) },
  { route: 'POST /api/trading/positions/close-many', method: 'POST', path: () => '/api/trading/positions/close-many', body: (x) => ({ items: [{ connectionId: x.connection, symbol: 'BTCUSD' }] }) },
  { route: 'GET /api/trading/orders', method: 'GET', path: (x) => `/api/trading/orders?connectionId=${x.connection}` },
  { route: 'POST /api/options/orders/preview', method: 'POST', path: () => '/api/options/orders/preview', body: (x) => ({ connectionId: x.connection, requestId: rid(), underlying: 'BTC', legs: [{ kind: 'call', side: 1, qty: 1, strike: 100000, expiry: '311226' }] }) },
  { route: 'POST /api/options/orders', method: 'POST', path: () => '/api/options/orders', body: (x) => ({ connectionId: x.connection, requestId: rid(), underlying: 'BTC', legs: [{ kind: 'call', side: 1, qty: 1, strike: 100000, expiry: '311226' }] }) },
  { route: 'POST /api/strategies/:id/deployments', method: 'POST', path: (_x, m) => `/api/strategies/${m.strategy}/deployments`, body: (x) => ({ mode: 'live', connectionId: x.connection, confirmLive: true }) },
  { route: 'POST /api/marketplace/:id/subscribe', method: 'POST', path: (_x, m) => `/api/marketplace/${m.publicTemplate}/subscribe`, body: (x) => ({ mode: 'live', connectionId: x.connection, confirmLive: true }) },
  { route: 'POST /api/marketplace/templates', method: 'POST', path: () => '/api/marketplace/templates', body: (x) => ({ strategyId: x.strategy, name: 'Taken over', summary: 'Someone else’s rules, republished.', description: 'An attempt to publish a strategy that belongs to someone else.', category: 'trend', risk: 'low', params: [], exchanges: ['delta_india'] }) },
  { route: 'POST /api/marketplace/templates', method: 'POST', path: () => '/api/marketplace/templates', body: (x, m) => ({ strategyId: m.strategy, name: 'Borrowed record', summary: 'My rules with someone else’s results.', description: 'An attempt to show another user’s live run as my track record.', category: 'trend', risk: 'low', params: [], exchanges: ['delta_india'], trackDeploymentId: x.deployment }) },
  { route: 'PATCH /api/strategies/:id', method: 'PATCH', path: (_x, m) => `/api/strategies/${m.strategy}`, body: (x) => ({ baselineBacktestId: x.backtest }) },
];

/** API-key (bearer) routes that take a connection. */
const V1_PROBES: Probe[] = [
  { route: 'GET /api/v1/orders', method: 'GET', path: (x) => `/api/v1/orders?connectionId=${x.connection}` },
  { route: 'POST /api/v1/orders', method: 'POST', path: () => '/api/v1/orders', body: (x) => ticket(x.connection) },
  { route: 'POST /api/v1/orders/cancel', method: 'POST', path: () => '/api/v1/orders/cancel', body: (x) => ({ connectionId: x.connection, symbol: 'BTCUSD', exchangeOrderId: '12345' }) },
  { route: 'POST /api/v1/positions/close', method: 'POST', path: () => '/api/v1/positions/close', body: (x) => ({ connectionId: x.connection, symbol: 'BTCUSD' }) },
];

/** GET lists that reach outside the app (market data, news); not user records. */
const EXTERNAL_LISTS = ['/api/market', '/api/news', '/api/calendar', '/api/signals', '/api/overview', '/api/derivatives', '/api/patterns', '/api/macro', '/api/options/', '/api/telegram'];

describe.skipIf(!local)('access-control matrix', () => {
  let base = '';
  let close: () => Promise<unknown> = async () => undefined;
  let prisma: typeof import('@tradinjournal/db').prisma;
  let routes: RouteInfo[] = [];
  const aiCalls: string[] = [];
  const exchangeCalls: string[] = [];
  const origin = () => process.env.CORS_ORIGIN?.split(',')[0] ?? 'http://localhost:3000';
  const call = (method: string, path: string, opts: { body?: unknown; cookie?: string; bearer?: string } = {}) =>
    fetch(`${base}${path}`, {
      method, redirect: 'manual', signal: AbortSignal.timeout(15_000),
      headers: { 'content-type': 'application/json', origin: origin(), ...(opts.cookie ? { cookie: opts.cookie } : {}), ...(opts.bearer ? { authorization: `Bearer ${opts.bearer}` } : {}) },
      body: ['GET', 'HEAD'].includes(method) ? undefined : JSON.stringify(opts.body ?? {}),
    });
  const answer = async (r: Response) => {
    const text = await r.text();
    let code: string | undefined;
    try { code = (JSON.parse(text) as { error?: { code?: string } }).error?.code; } catch { /* not JSON */ }
    return { status: r.status, code, text };
  };
  const users = { a: { id: '', email: `${tag}-a@trading.test`, cookie: '' }, b: { id: '', email: `${tag}-b@trading.test`, cookie: '' }, admin: { id: '', email: `${tag}-admin@trading.test`, cookie: '' }, l: { id: '', email: `${tag}-l@trading.test`, cookie: '' } };
  let A = {} as Ids;
  let mine = {} as Mine;
  let bKey = '';
  const FAKE = {} as Ids;

  const jsonSafe = (v: unknown) => JSON.stringify(v, (_k, x: unknown) => (typeof x === 'bigint' ? x.toString() : x));
  /** Everything A owns, as stored. Compared before and after B's attempts. */
  const snapshotA = async () => {
    const u = users.a.id;
    const sorted = { orderBy: { id: 'asc' as const } };
    return jsonSafe(await Promise.all([
      prisma.user.findUnique({ where: { id: u } }),
      prisma.partner.findMany({ where: { userId: u }, include: { codes: sorted, channels: sorted } }),
      prisma.strategy.findMany({ where: { userId: u }, ...sorted, include: { versions: sorted } }),
      prisma.strategyBacktest.findMany({ where: { userId: u }, ...sorted, select: { id: true, strategyId: true, hash: true } }),
      prisma.strategyDeployment.findMany({ where: { userId: u }, ...sorted, include: { events: sorted, trades: sorted } }),
      prisma.strategyTemplate.findMany({ where: { creatorId: u }, ...sorted }),
      prisma.templateSubscription.findMany({ where: { userId: u }, ...sorted }),
      prisma.brokerAccount.findMany({ where: { userId: u }, ...sorted, include: { syncRuns: sorted } }),
      prisma.exchangeConnection.findMany({ where: { userId: u }, ...sorted, include: { orders: sorted, webhooks: sorted } }),
      prisma.copyLeader.findMany({ where: { userId: u }, ...sorted }),
      prisma.copyFollow.findMany({ where: { userId: u }, ...sorted }),
      prisma.apiKey.findMany({ where: { userId: u }, ...sorted }),
      prisma.journalEntry.findMany({ where: { userId: u }, ...sorted }),
      prisma.aiConversation.findMany({ where: { userId: u }, ...sorted, include: { messages: sorted } }),
      prisma.priceAlert.findMany({ where: { userId: u }, ...sorted }),
      prisma.indicatorAlert.findMany({ where: { userId: u }, ...sorted }),
      prisma.savedScreen.findMany({ where: { userId: u }, ...sorted }),
      prisma.traderStrategy.findMany({ where: { userId: u }, ...sorted }),
      prisma.activityEvent.findMany({ where: { userId: u }, ...sorted }),
    ]));
  };
  /** How many records B has in every table a probe could add to. */
  const countsB = async () => {
    const u = users.b.id;
    return jsonSafe(await Promise.all([
      prisma.strategy.count({ where: { userId: u } }), prisma.strategyBacktest.count({ where: { userId: u } }), prisma.strategyDeployment.count({ where: { userId: u } }),
      prisma.strategyTemplate.count({ where: { creatorId: u } }), prisma.templateSubscription.count({ where: { userId: u } }), prisma.copyFollow.count({ where: { userId: u } }),
      prisma.copyLeader.count({ where: { userId: u } }), prisma.exchangeOrder.count({ where: { userId: u } }), prisma.journalEntry.count({ where: { userId: u } }),
      prisma.priceAlert.count({ where: { userId: u } }),
      prisma.tradingWebhook.findUnique({ where: { userId: u } }), prisma.strategy.findMany({ where: { userId: u }, select: { id: true, baselineBacktestId: true, name: true }, orderBy: { id: 'asc' } }),
    ]));
  };

  /** Every row B owns, as text, to look for references to A's records. */
  const rowsOfB = async () => {
    const u = users.b.id;
    return jsonSafe(await Promise.all([
      prisma.strategy.findMany({ where: { userId: u } }), prisma.strategyDeployment.findMany({ where: { userId: u } }), prisma.strategyTemplate.findMany({ where: { creatorId: u } }),
      prisma.templateSubscription.findMany({ where: { userId: u } }), prisma.copyFollow.findMany({ where: { userId: u } }), prisma.copyLeader.findMany({ where: { userId: u } }),
      prisma.exchangeOrder.findMany({ where: { userId: u } }), prisma.journalEntry.findMany({ where: { userId: u } }), prisma.priceAlert.findMany({ where: { userId: u } }),
      prisma.aiConversation.findMany({ where: { userId: u }, include: { messages: true } }), prisma.tradingWebhook.findMany({ where: { userId: u } }), prisma.activityEvent.findMany({ where: { userId: u } }),
      prisma.indicatorAlert.findMany({ where: { userId: u } }), prisma.savedScreen.findMany({ where: { userId: u } }), prisma.traderStrategy.findMany({ where: { userId: u } }),
    ]));
  };

  beforeAll(async () => {
    vi.resetModules();
    Object.assign(process.env, {
      DATABASE_URL: DB, DIRECT_URL: DB, TRADING_ENABLED: 'true', PARTNER_PROGRAM_ENABLED: 'true', PLATFORM_ACCESS_ENABLED: 'false', PLANS_ENABLED: 'false',
      ADMIN_EMAILS: users.admin.email, MACRO_ADMIN_EMAILS: users.admin.email, AI_ENABLED: 'true', AI_API_KEY: 'test-key-not-used',
    });
    vi.doMock('../lib/email/client.js', () => ({ sendEmail: async () => undefined }));
    // Per-user limits are checked on their own (Z2); here they'd only cut the probes short.
    vi.doMock('../lib/rate-limit.js', async (orig) => ({ ...(await orig<typeof import('../lib/rate-limit.js')>()), perUserRateLimit: () => (_req: unknown, _res: unknown, next: () => void) => next() }));
    // A stand-in model: any call means a probe got past an ownership check.
    vi.doMock('../lib/ai/provider.js', async (orig) => {
      const real = await orig<typeof import('../lib/ai/provider.js')>();
      const fake = {
        model: 'fake',
        async *stream() { aiCalls.push('stream'); yield 'ok'; },
        async complete() { aiCalls.push('complete'); return 'ok'; },
        async json() { aiCalls.push('json'); return {}; },
      };
      return { ...real, getProvider: () => fake, isAiEnabled: () => true };
    });
    // Same for the exchange: nothing here may reach it with someone else's keys.
    vi.doMock('@tradinjournal/exchange', async (orig) => {
      const real = await orig<typeof import('@tradinjournal/exchange')>();
      return { ...real, adapterFor: (...args: Parameters<typeof real.adapterFor>) => { exchangeCalls.push(args.slice(0, 2).join(':')); return real.adapterFor(...args); } };
    });
    const { createApp } = await import('../app.js');
    const { listRoutes } = await import('./routes.js');
    const app = createApp();
    routes = listRoutes(app);
    const server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => new Promise((r) => { server.closeAllConnections(); server.close(r); });
    ({ prisma } = await import('@tradinjournal/db'));
    const { hashPassword } = await import('better-auth/crypto');
    const core = await import('@tradinjournal/core');
    const jar = (r: Response) => r.headers.getSetCookie().map((c) => c.split(';')[0]!).filter((kv) => kv.split('=')[1]).join('; ');
    for (const u of Object.values(users)) {
      const row = await prisma.user.create({ data: { email: u.email, name: `ACL ${u.email.split('-').pop()!.split('@')[0]}`, emailVerified: true, country: 'India', city: 'Pune', postalCode: '411001' } });
      await prisma.account.create({ data: { userId: row.id, accountId: row.id, providerId: 'credential', password: await hashPassword(PASS) } });
      u.id = row.id;
      const r = await call('POST', '/api/auth/sign-in/email', { body: { email: u.email, password: PASS } });
      expect(r.status).toBe(200);
      u.cookie = jar(r);
    }
    const a = users.a.id, b = users.b.id, l = users.l.id;
    const spec = core.defaultSpec('BTCUSDT');
    const conn = (userId: string, label: string) => prisma.exchangeConnection.create({ data: { userId, exchange: 'DELTA_INDIA', environment: 'TESTNET', label, apiKeyEnc: 'not-a-key', apiSecretEnc: 'not-a-secret', keyLast4: '0000', keyFingerprint: `${tag}-${label}`, canTrade: true } });

    // B and the leader/creator L, so B's own side of each feature is real.
    const bConn = await conn(b, 'b-main');
    const bStrategy = await prisma.strategy.create({ data: { userId: b, name: 'B strat', spec: spec as object } });
    const bAccount = await prisma.brokerAccount.create({ data: { userId: b, broker: 'Test', mt5Login: BigInt(Date.now()) + 1n, server: `${tag}-srv`, marginMode: 'NETTING' } });
    await prisma.partner.create({ data: { userId: b, status: 'ACTIVE', approvedAt: new Date(), codes: { create: { code: `${tag}B`.toUpperCase(), isPrimary: true } } } });
    await prisma.creatorProfile.create({ data: { userId: b, displayName: 'B creator', bio: 'B bio', status: 'approved' } });
    const lConn = await conn(l, 'l-main');
    const lLeader = await prisma.copyLeader.create({ data: { userId: l, connectionId: lConn.id, displayName: 'ACL leader', status: 'VERIFIED', listed: true } });
    await prisma.creatorProfile.create({ data: { userId: l, displayName: 'L creator', bio: 'L bio', status: 'approved' } });
    const lStrategy = await prisma.strategy.create({ data: { userId: l, name: 'L strat', spec: spec as object } });
    const tmpl = (creatorId: string, strategyId: string, name: string, status: string) => prisma.strategyTemplate.create({ data: { creatorId, strategyId, version: 1, spec: spec as object, name, summary: 'A test template summary.', description: 'A test template description that is long enough.', category: 'trend', risk: 'low', exchanges: ['delta_india'], symbols: ['BTCUSDT'], interval: spec.session.interval, status, publishedAt: status === 'published' ? new Date() : null } });
    const lTemplate = await tmpl(l, lStrategy.id, 'L public', 'published');
    mine = { strategy: bStrategy.id, account: bAccount.id, connection: bConn.id, publicTemplate: lTemplate.id, publicLeader: lLeader.id };

    // A's records.
    const aConn = await conn(a, 'a-main');
    const aConn2 = await conn(a, 'a-lead');
    const strategy = await prisma.strategy.create({ data: { userId: a, name: 'A strat', spec: spec as object, versions: { create: { version: 1, spec: spec as object } } } });
    const backtest = await prisma.strategyBacktest.create({ data: { strategyId: strategy.id, userId: a, version: 1, params: {}, metrics: { netPnl: 123.45 }, result: { trades: [] }, hash: `${tag}-bt` } });
    const deployment = await prisma.strategyDeployment.create({ data: { userId: a, strategyId: strategy.id, version: 1, spec: spec as object, name: 'A run', mode: 'live', connectionId: aConn.id, capital: 1000, events: { create: { at: new Date(), kind: 'info', message: 'started' } } } });
    const template = await tmpl(a, strategy.id, 'A hidden', 'pending');
    const copyStrategy = await prisma.strategy.create({ data: { userId: a, name: 'A copy', spec: spec as object, source: 'template', templateId: lTemplate.id } });
    const subDeployment = await prisma.strategyDeployment.create({ data: { userId: a, strategyId: copyStrategy.id, version: 1, spec: spec as object, name: 'A copy run', mode: 'paper', capital: 1000 } });
    const subscription = await prisma.templateSubscription.create({ data: { userId: a, templateId: lTemplate.id, strategyId: copyStrategy.id, deploymentId: subDeployment.id } });
    const account = await prisma.brokerAccount.create({ data: { userId: a, broker: 'Test', mt5Login: BigInt(Date.now()) + 2n, server: `${tag}-srv`, marginMode: 'NETTING' } });
    const follow = await prisma.copyFollow.create({ data: { userId: a, leaderId: lLeader.id, connectionId: aConn.id } });
    const hiddenLeader = await prisma.copyLeader.create({ data: { userId: a, connectionId: aConn2.id, displayName: 'A hidden leader', status: 'PENDING' } });
    await prisma.exchangeOrder.create({ data: { userId: a, connectionId: aConn.id, source: 'MANUAL', clientOrderId: `${tag}-o1`, symbol: 'BTCUSD', side: 'BUY', type: 'MARKET', qty: 1 } });
    const apiKey = await prisma.apiKey.create({ data: { userId: a, name: 'A key', prefix: `${tag}a`, secretHash: 'not-a-hash', last4: 'aaaa', scope: 'trade' } });
    const journal = await prisma.journalEntry.create({ data: { userId: a, body: 'A private note' } });
    const conversation = await prisma.aiConversation.create({ data: { userId: a, title: 'A chat', messages: { create: { role: 'user', content: 'A private question' } } } });
    const alert = await prisma.priceAlert.create({ data: { userId: a, symbol: 'BTCUSDT', direction: 'above', threshold: 200000 } });
    const indicatorAlert = await prisma.indicatorAlert.create({ data: { userId: a, symbol: 'BTCUSDT', timeframe: '1h', left: { kind: 'price' }, operator: 'above', right: { kind: 'value', value: 1 } } });
    const screen = await prisma.savedScreen.create({ data: { userId: a, name: 'A screen', definition: {} } });
    const traderStrategy = await prisma.traderStrategy.create({ data: { userId: a, name: 'A trader', prompt: 'buy dips', rules: { kind: 'ema_cross', direction: 'LONG', symbol: 'BTCUSDT', timeframe: '1h', fast: 9, slow: 21, stopAtr: 1.5, targetR: 2 } } });
    const partner = await prisma.partner.create({ data: { userId: a, status: 'ACTIVE', approvedAt: new Date(), codes: { create: [{ code: `${tag}A`.toUpperCase(), isPrimary: true }, { code: `${tag}A2`.toUpperCase() }] }, channels: { create: { label: 'A channel', slug: 'a-channel' } } }, include: { codes: true, channels: true } });
    await prisma.creatorProfile.create({ data: { userId: a, displayName: 'A creator', bio: 'A bio', status: 'approved' } });
    A = {
      strategy: strategy.id, copyStrategy: copyStrategy.id, backtest: backtest.id, deployment: deployment.id, subDeployment: subDeployment.id, template: template.id, subscription: subscription.id,
      account: account.id, connection: aConn.id, follow: follow.id, hiddenLeader: hiddenLeader.id, apiKey: apiKey.id, journal: journal.id, conversation: conversation.id, alert: alert.id,
      indicatorAlert: indicatorAlert.id, screen: screen.id, traderStrategy: traderStrategy.id, partnerChannel: partner.channels[0]!.id, partnerCode: partner.codes.find((c) => !c.isPrimary)!.id,
    };
    Object.keys(A).forEach((k, i) => { (FAKE as Record<string, string>)[k] = fakeId(i); });

    // B's API key and webhook, made the normal way.
    const key = await call('POST', '/api/trading/api-keys', { cookie: users.b.cookie, body: { name: 'B key', scope: 'trade' } });
    expect(key.status).toBeLessThan(300);
    bKey = ((await key.json()) as { data: { key: string } }).data.key;
    expect(bKey).toBeTruthy();
    await prisma.tradingWebhook.create({ data: { userId: b, connectionId: bConn.id, token: `${tag}-tok`, secretHash: 'not-a-hash', secretLast4: '0000' } });
  }, 120_000);

  afterAll(async () => {
    const ids = Object.values(users).map((u) => u.id).filter(Boolean);
    if (prisma && ids.length) {
      // Tables without a cascading user FK first, then the users (everything else cascades).
      await prisma.journalEntry.deleteMany({ where: { userId: { in: ids } } });
      await prisma.aiConversation.deleteMany({ where: { userId: { in: ids } } });
      await prisma.priceAlert.deleteMany({ where: { userId: { in: ids } } });
      await prisma.traderStrategy.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await close();
    await prisma?.$disconnect();
  });

  it('classifies every route with a path param', () => {
    const owned = new Set([...PATH_PROBES, ...REF_PROBES].map((p) => p.route));
    const unclassified = routes
      .filter((r) => r.template.includes(':') && !r.template.includes('*'))
      .map((r) => `${r.method} ${r.template}`)
      .filter((k) => !PUBLIC[k] && !SHARED[k] && !owned.has(k) && !isAdminRoute(k.split(' ')[1]!));
    expect(unclassified).toEqual([]);
    // And the probes name real routes (a renamed route would otherwise go unchecked).
    const real = new Set(routes.map((r) => `${r.method} ${r.template}`));
    expect([...PATH_PROBES, ...REF_PROBES, ...V1_PROBES].map((p) => p.route).filter((k) => !real.has(k))).toEqual([]);
    expect(Object.keys({ ...PUBLIC, ...SHARED }).filter((k) => !real.has(k))).toEqual([]);
  });

  it('answers 401 without a session, except the public routes', async () => {
    const wrong: string[] = [];
    for (const r of routes) {
      if (r.template.includes('*')) continue;
      const key = `${r.method} ${r.template}`;
      const res = await call(r.method, r.path).catch((e: Error) => ({ status: `ERR ${e.message}` }) as unknown as Response);
      if (r.path.startsWith('/internal/')) { if (res.status !== 401 && res.status !== 403) wrong.push(`${res.status} ${key}`); continue; }
      if (!r.path.startsWith('/api/')) continue;
      const want = PUBLIC[key]?.status ?? 401;
      if (res.status !== want) wrong.push(`${res.status} (want ${want}) ${key}`);
    }
    expect(wrong).toEqual([]);
    expect(routes.filter((r) => r.path.startsWith('/api/')).length).toBeGreaterThan(200);
  }, 120_000);

  it('never lets a signed-in user through the internal token', async () => {
    const wrong: string[] = [];
    for (const r of routes.filter((x) => x.path.startsWith('/internal/'))) {
      const res = await call(r.method, r.path, { cookie: users.b.cookie });
      if (res.status !== 401 && res.status !== 403) wrong.push(`${res.status} ${r.method} ${r.template}`);
    }
    expect(wrong).toEqual([]);
  }, 60_000);

  it('keeps admin routes to admins', async () => {
    const admin = routes.filter((r) => isAdminRoute(r.template));
    expect(admin.length).toBeGreaterThan(30);
    const wrong: string[] = [];
    for (const r of admin) {
      const res = await call(r.method, r.path, { cookie: users.b.cookie, body: {} });
      if (res.status !== 403) wrong.push(`${res.status} ${r.method} ${r.template}`);
    }
    expect(wrong).toEqual([]);
    // The admin really is let in (so the 403s above are about the role, not a broken route).
    const reads = admin.filter((r) => r.method === 'GET' && !r.template.includes(':'));
    const denied: string[] = [];
    for (const r of reads) {
      const res = await call('GET', r.path, { cookie: users.admin.cookie });
      if (res.status === 401 || res.status === 403) denied.push(`${res.status} ${r.template}`);
    }
    expect(denied).toEqual([]);
  }, 120_000);

  it('treats someone else’s records exactly like missing ones, and changes nothing', async () => {
    const before = await snapshotA();
    const beforeB = await countsB();
    aiCalls.length = 0;
    exchangeCalls.length = 0;
    const leaks: string[] = [];
    // Ids the probe sent, ids made on the spot and request ids differ between the
    // two calls by design; anything else that differs tells B something.
    const sent = new Set([...Object.values(A), ...Object.values(FAKE)]);
    const norm = (t: string) => t.replace(/c[a-z0-9]{24}/g, (id) => (sent.has(id) ? ':sent' : ':new')).replace(/acl-[a-z0-9]+/g, ':rid');
    const run = async (p: Probe, opts: { cookie?: string; bearer?: string }, mustFail: boolean) => {
      const theirs = await answer(await call(p.method, p.path(A, mine), { ...opts, body: p.body?.(A, mine) }));
      const missing = await answer(await call(p.method, p.path(FAKE, mine), { ...opts, body: p.body?.(FAKE, mine) }));
      const label = `${p.method} ${norm(p.path(A, mine))}${p.body ? ` ${norm(JSON.stringify(p.body(A, mine))).slice(0, 90)}` : ''}`;
      if (process.env.ACL_DEBUG) console.log(`ACL ${theirs.status} ${theirs.code ?? ''} ${label}${theirs.status === 422 ? ` :: ${theirs.text.slice(0, 300)}` : ''}`);
      if (mustFail && theirs.status < 400) leaks.push(`${theirs.status} ${label} → ${theirs.text.slice(0, 160)}`);
      else if (theirs.status !== missing.status || norm(theirs.text) !== norm(missing.text)) leaks.push(`${theirs.status}/${theirs.code} vs missing ${missing.status}/${missing.code}: ${label} → ${norm(theirs.text).slice(0, 120)} | ${norm(missing.text).slice(0, 120)}`);
    };
    for (const p of PATH_PROBES) await run(p, { cookie: users.b.cookie }, true);
    for (const p of REF_PROBES) await run(p, { cookie: users.b.cookie }, false);
    for (const p of V1_PROBES) await run(p, { bearer: bKey }, false);
    expect(leaks).toEqual([]);
    expect(aiCalls).toEqual([]);
    expect(exchangeCalls).toEqual([]);
    expect(await snapshotA()).toBe(before);
    expect(await countsB()).toBe(beforeB);
    // Nothing B owns now points at A's records.
    const bRows = await rowsOfB();
    expect(Object.entries(A).filter(([, id]) => bRows.includes(id)).map(([k]) => k)).toEqual([]);
  }, 300_000);

  it('the owner can still reach their own records (so the misses above are about ownership)', async () => {
    const reads: Array<[string, number]> = [
      [`/api/strategies/${A.strategy}`, 200], [`/api/strategies/${A.strategy}/backtests/${A.backtest}`, 200], [`/api/strategies/${A.strategy}/deployments`, 200],
      [`/api/deployments/${A.deployment}`, 200], [`/api/deployments/${A.subDeployment}`, 200], [`/api/follows/${A.follow}`, 200], [`/api/follows/${A.follow}/orders`, 200],
      [`/api/ai/conversations/${A.conversation}`, 200], [`/api/leaders/${A.hiddenLeader}/trades`, 200], [`/api/marketplace/${A.template}`, 200],
      [`/api/strategies/${A.copyStrategy}`, 403], // marketplace rules stay private even to the subscriber
    ];
    const wrong: string[] = [];
    for (const [p, want] of reads) {
      const r = await call('GET', p, { cookie: users.a.cookie });
      if (r.status !== want) wrong.push(`${r.status} (want ${want}) ${p}`);
    }
    expect(wrong).toEqual([]);
  }, 60_000);

  it('never lists someone else’s records', async () => {
    const lists = routes.filter((r) => r.method === 'GET' && r.path.startsWith('/api/') && !r.template.includes(':') && !isAdminRoute(r.template)
      && !EXTERNAL_LISTS.some((p) => r.path.startsWith(p) && !r.path.startsWith('/api/options/orders')) && !/stream|export\.csv/.test(r.path));
    expect(lists.length).toBeGreaterThan(40);
    const theirIds = [...Object.values(A), users.a.id, users.a.email];
    const leaks: string[] = [];
    for (const r of lists) {
      for (const opts of [{ cookie: users.b.cookie }, ...(r.path.startsWith('/api/v1/') ? [{ bearer: bKey }] : [])]) {
        const res = await call('GET', r.path, opts);
        if ((res.headers.get('content-type') ?? '').includes('event-stream')) { await res.body?.cancel(); continue; }
        const text = await res.text();
        const hit = theirIds.find((id) => text.includes(id));
        if (hit) leaks.push(`${r.path} contains ${hit === users.a.email ? 'their email' : 'their id'}`);
      }
    }
    expect(leaks).toEqual([]);
    // The same lists do show the owner their records (the check above isn't vacuous).
    const own = await (await call('GET', '/api/strategies', { cookie: users.a.cookie })).text();
    expect(own).toContain(A.strategy);
    expect(await (await call('GET', '/api/journal', { cookie: users.a.cookie })).text()).toContain(A.journal);
  }, 300_000);
});
