// TradingView webhooks (D14) and their request log (D15). A user gets one
// webhook: a public URL token and a secret that goes in each alert message
// (TradingView can't send custom headers). Only a hash of the secret is kept.
// Every alert runs through the same order ticket as the page, so the same
// checks apply; the alert's id makes a repeat a no-op.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '@tradinjournal/config';
import { tvAlertSchema, type TvAlert, type WebhookCreatedDto, type WebhookDto, type WebhookEventDto, type WebhookSetupInput, type WebhookUpdateInput } from '@tradinjournal/contracts';
import { prisma, type Prisma, type TradingWebhook } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../http/errors.js';
import { cacheIncr } from '../../lib/cache.js';
import { placeTicket } from './ticket.service.js';
import { closePosition, defaultTradingDeps, type TradingDeps } from './trading.service.js';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const RATE_PER_MIN = 30;

type WebhookRow = TradingWebhook & { connection: { id: string; label: string; environment: 'TESTNET' | 'LIVE'; status: string } };

function urlFor(token: string): string {
  return `${env.AUTH_URL.replace(/\/$/, '')}/api/hooks/tv/${token}`;
}

function dto(w: WebhookRow): WebhookDto {
  return {
    url: urlFor(w.token),
    secretLast4: w.secretLast4,
    enabled: w.enabled,
    liveConfirmed: w.liveConfirmed,
    connection: { id: w.connection.id, label: w.connection.label, environment: w.connection.environment, status: w.connection.status },
    createdAt: w.createdAt.toISOString(),
    rotatedAt: w.rotatedAt.toISOString(),
  };
}

const include = { connection: { select: { id: true, label: true, environment: true, status: true } } } as const;

async function tradableConnection(userId: string, connectionId: string, liveConfirmed: boolean | undefined) {
  const c = await prisma.exchangeConnection.findFirst({ where: { id: connectionId, userId } });
  if (!c) throw new NotFoundError('Exchange account not found');
  if (c.status !== 'ACTIVE') throw new ConflictError('This exchange key stopped working. Reconnect it first.');
  if (!c.canTrade) throw new ConflictError('This exchange key is read-only, so alerts couldn’t place orders with it.');
  if (c.environment === 'LIVE' && !liveConfirmed) throw new ValidationError('This is a real-money account: confirm that alerts may trade it unattended.', { liveConfirmed: ['required for a real-money account'] });
  return c;
}

export async function getWebhook(userId: string): Promise<WebhookDto | null> {
  const w = await prisma.tradingWebhook.findUnique({ where: { userId }, include });
  return w ? dto(w as WebhookRow) : null;
}

/** Create the webhook, or give it a new secret (the URL stays the same). The secret is shown once. */
export async function setupWebhook(userId: string, input: WebhookSetupInput, now = new Date()): Promise<WebhookCreatedDto> {
  const c = await tradableConnection(userId, input.connectionId, input.liveConfirmed);
  const secret = `tvs_${randomBytes(24).toString('base64url')}`;
  const data = { connectionId: c.id, secretHash: sha256(secret), secretLast4: secret.slice(-4), rotatedAt: now, liveConfirmed: c.environment === 'LIVE' ? true : false };
  const w = await prisma.tradingWebhook.upsert({
    where: { userId },
    create: { userId, token: randomBytes(18).toString('base64url'), ...data },
    update: data,
    include,
  });
  return { ...dto(w as WebhookRow), secret };
}

export async function updateWebhook(userId: string, input: WebhookUpdateInput): Promise<WebhookDto> {
  const w = await prisma.tradingWebhook.findUnique({ where: { userId } });
  if (!w) throw new NotFoundError('Set up the webhook first.');
  const data: Prisma.TradingWebhookUpdateInput = {};
  if (input.enabled !== undefined) data.enabled = input.enabled;
  if (input.connectionId !== undefined) {
    const c = await tradableConnection(userId, input.connectionId, input.liveConfirmed);
    data.connection = { connect: { id: c.id } };
    data.liveConfirmed = c.environment === 'LIVE';
  }
  const out = await prisma.tradingWebhook.update({ where: { userId }, data, include });
  return dto(out as WebhookRow);
}

export async function deleteWebhook(userId: string): Promise<void> {
  await prisma.tradingWebhook.deleteMany({ where: { userId } });
}

export async function webhookEvents(userId: string, cursor?: string, limit = 50): Promise<{ items: WebhookEventDto[]; nextCursor: string | null }> {
  const w = await prisma.tradingWebhook.findUnique({ where: { userId }, select: { id: true } });
  if (!w) return { items: [], nextCursor: null };
  const rows = await prisma.tradingWebhookEvent.findMany({
    where: { webhookId: w.id },
    orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, limit);
  return {
    items: page.map((e) => ({ id: e.id, receivedAt: e.receivedAt.toISOString(), ip: e.ip, status: e.status as WebhookEventDto['status'], reason: e.reason, alertId: e.alertId, payload: (e.payload as Record<string, unknown> | null) ?? null, orderId: e.orderId })),
    nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
  };
}

export interface AlertResult {
  httpStatus: number;
  body: { ok: boolean; status: WebhookEventDto['status'] | 'unknown'; message: string };
}

/** The client IP as the proxy in front of us saw it: the last X-Forwarded-For hop (earlier ones can be forged). */
export function clientIp(forwardedFor: string | undefined, socketIp: string | undefined): string | null {
  const hops = (forwardedFor ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const ip = hops.length ? hops[hops.length - 1]! : socketIp ?? null;
  return ip ? ip.replace(/^::ffff:/, '') : null;
}

function withoutSecret(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const { secret: _s, ...rest } = body as Record<string, unknown>;
  void _s;
  const text = JSON.stringify(rest);
  // Big messages are kept as a preview, not cut mid-JSON.
  return text.length <= 4000 ? rest : { truncated: true, preview: text.slice(0, 4000) };
}

/** One alert from TradingView. Never throws: every outcome is logged and answered. */
export async function handleAlert(token: string, raw: unknown, ip: string | null, now = new Date(), deps: TradingDeps = defaultTradingDeps): Promise<AlertResult> {
  const w = await prisma.tradingWebhook.findUnique({ where: { token } });
  if (!w) return { httpStatus: 404, body: { ok: false, status: 'unknown', message: 'Unknown webhook' } };

  const log = async (status: WebhookEventDto['status'], reason: string | null, extra: { alertId?: string | null; payload?: unknown; orderId?: string | null } = {}) => {
    await prisma.tradingWebhookEvent.create({
      data: { webhookId: w.id, ip, status, reason: reason?.slice(0, 500) ?? null, alertId: extra.alertId ?? null, payload: (withoutSecret(extra.payload) ?? undefined) as Prisma.InputJsonValue | undefined, orderId: extra.orderId ?? null, receivedAt: now },
    }).catch((err) => logger.warn('[tv-webhook] log failed', { err: String(err) }));
  };
  const reject = async (httpStatus: number, reason: string, extra: Parameters<typeof log>[2] = {}): Promise<AlertResult> => {
    await log('rejected', reason, extra);
    return { httpStatus, body: { ok: false, status: 'rejected', message: reason } };
  };

  if (env.TRADINGVIEW_IPS && (!ip || !env.TRADINGVIEW_IPS.includes(ip))) return reject(403, `Request from ${ip ?? 'an unknown address'}, which isn't one of TradingView's alert servers.`);

  let count = 0;
  try { count = await cacheIncr(`rl:tv:${w.id}`, 60); } catch { /* fail open: the limiter must not drop alerts */ }
  if (count > RATE_PER_MIN) return reject(429, `More than ${RATE_PER_MIN} alerts in a minute; this one was dropped.`);

  let body: unknown = raw;
  if (typeof raw === 'string') {
    try { body = JSON.parse(raw); } catch { return reject(400, 'The alert message isn’t valid JSON. Copy a template from the webhook page.'); }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reject(400, 'The alert message must be a JSON object.');

  const secret = (body as { secret?: unknown }).secret;
  const a = Buffer.from(sha256(typeof secret === 'string' ? secret : ''), 'hex');
  const b = Buffer.from(w.secretHash, 'hex');
  if (typeof secret !== 'string' || a.length !== b.length || !timingSafeEqual(a, b)) return reject(401, 'Wrong or missing secret. If you regenerated it, update your alerts.', { payload: body });

  const parsed = tvAlertSchema.safeParse(body);
  if (!parsed.success) return reject(422, parsed.error.issues.map((i) => `${i.path.join('.') || 'message'}: ${i.message}`).join('; '), { payload: body });
  const alert: TvAlert = parsed.data;
  const alertId = alert.id ?? null;
  if (!w.enabled) return reject(409, 'The webhook is switched off.', { alertId, payload: body });

  try {
    if (alert.action === 'close') {
      const r = await closePosition(w.userId, { connectionId: w.connectionId, symbol: alert.symbol, ...(alert.qty ? { qty: alert.qty } : {}) }, now, deps);
      const ok = ['FILLED', 'PARTIAL', 'SUBMITTED'].includes(r.order.status);
      await log(ok ? 'ordered' : 'failed', r.message, { alertId, payload: body, orderId: r.order.id });
      return { httpStatus: 200, body: { ok, status: ok ? 'ordered' : 'failed', message: r.message } };
    }
    // The alert id makes the ticket's request id, so a repeat is recognised and never sent twice.
    const requestId = alertId ? `tv-${sha256(`${w.id}:${alertId}`).slice(0, 40)}` : `tv-${randomBytes(16).toString('hex')}`;
    const r = await placeTicket(w.userId, {
      connectionId: w.connectionId,
      symbol: alert.symbol,
      side: alert.action === 'buy' ? 'BUY' : 'SELL',
      type: alert.type === 'limit' ? 'LIMIT' : 'MARKET',
      size: alert.qty ? { mode: 'contracts', value: alert.qty } : alert.size_usd ? { mode: 'usd', value: alert.size_usd } : { mode: 'risk', value: alert.risk_pct! },
      ...(alert.type === 'limit' ? { limitPrice: alert.price, tif: 'GTC' as const } : {}),
      ...(alert.tp ? { takeProfit: alert.tp } : {}),
      ...(alert.sl ? { stopLoss: alert.sl } : {}),
      ...(alert.reduce_only ? { reduceOnly: true } : {}),
      ...(alert.leverage ? { leverage: alert.leverage } : {}),
      ...(w.liveConfirmed ? { confirmLive: true } : {}),
      requestId,
    }, now, deps);
    const duplicate = /already sent/.test(r.message);
    const status: WebhookEventDto['status'] = duplicate ? 'duplicate' : r.outcome === 'rejected' ? 'failed' : 'ordered';
    const extra = r.protective.filter((p) => !p.ok).map((p) => p.message).join(' ');
    await log(status, `${r.message}${extra ? ` ${extra}` : ''}`, { alertId, payload: body, orderId: r.order?.id ?? null });
    return { httpStatus: 200, body: { ok: status !== 'failed', status, message: r.message } };
  } catch (err) {
    // A rule the order broke, or an account problem: logged with the reason, answered plainly.
    const msg = err instanceof ValidationError && err.fields?.ticket ? err.fields.ticket.join(' ') : err instanceof Error ? err.message : 'Unknown error';
    const http = err instanceof AppError ? err.statusCode : 500;
    if (!(err instanceof AppError)) logger.error('[tv-webhook] alert failed', { err: String(err) });
    await log(http >= 500 ? 'failed' : 'rejected', msg, { alertId, payload: body });
    return { httpStatus: http >= 500 ? 500 : http, body: { ok: false, status: http >= 500 ? 'failed' : 'rejected', message: msg } };
  }
}
