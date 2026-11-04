// Broker IB integrations beyond a plain list:
// - postbacks: the broker (or its IB platform: Cellxpert, MyAffiliates…) calls a secret
//   URL on every registration, deposit, trade or commission event;
// - a REST adapter for broker partner APIs (Exness-style login → token, API key, basic);
// - commission report uploads.
// Everything feeds the same IbAccount list, so verification works the same way.
import { randomBytes } from 'crypto';
import { prisma, type Prisma } from '@tradinjournal/db';
import type { BrokerIntegrationDto, IbApiConfig } from '@tradinjournal/contracts';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { AppError, NotFoundError, ValidationError } from '../../../http/errors.js';
import { decryptSecret, encryptSecret } from '../../../lib/secrets.js';
import { brokerLabel } from './brokers.js';
import { dig, parseEarnings, parsePostback, type IbRow } from './ib.logic.js';
import { getProgramSettings } from './settings.js';
import { logEvent } from './events.js';
import { applyRows, recheckLogin } from './ib.service.js';

const DAY_MS = 86_400_000;
type Actor = { id: string; email: string } | null;

export const POSTBACK_PARAMS = [
  { name: 'event', meaning: 'registration, deposit, trade or commission' },
  { name: 'account_id', meaning: 'the client’s trading account number (also: login, uid)' },
  { name: 'email', meaning: 'client email (optional)' },
  { name: 'lots', meaning: 'volume in lots for trade events' },
  { name: 'amount', meaning: 'deposit or commission amount' },
  { name: 'currency', meaning: 'currency of the amount' },
  { name: 'event_id', meaning: 'the broker’s id for the event, so repeats count once' },
  { name: 'date', meaning: 'when it happened (ISO date or unix time)' },
];

const postbackUrl = (token: string) => `${env.AUTH_URL.replace(/\/+$/, '')}/api/ib/postback/${token}`;

async function ownBroker(partnerId: string, id: string) {
  const b = await prisma.partnerBroker.findFirst({ where: { id, partnerId } });
  if (!b) throw new NotFoundError('Broker connection not found');
  return b;
}

export async function integration(partnerId: string, id: string): Promise<BrokerIntegrationDto> {
  let b = await ownBroker(partnerId, id);
  if (!b.postbackToken) b = await prisma.partnerBroker.update({ where: { id }, data: { postbackToken: randomBytes(24).toString('base64url') } });
  const [events, settings] = await Promise.all([
    prisma.brokerEvent.findMany({ where: { partnerBrokerId: id }, orderBy: { createdAt: 'desc' }, take: 30 }),
    getProgramSettings(),
  ]);
  return {
    postbackUrl: postbackUrl(b.postbackToken!), postbackParams: POSTBACK_PARAMS,
    api: { config: (b.apiConfig as IbApiConfig | null) ?? null, hasSecret: !!b.apiKey, allowedHosts: settings.ibApiHosts },
    events: events.map(e => ({ id: e.id, at: e.createdAt.toISOString(), kind: e.kind, accountId: e.accountId, status: e.status, error: e.error })),
  };
}

export async function rotatePostback(partnerId: string, id: string, actor: Actor = null) {
  await ownBroker(partnerId, id);
  await prisma.partnerBroker.update({ where: { id }, data: { postbackToken: randomBytes(24).toString('base64url') } });
  await logEvent({ kind: 'ib.postback_rotate', partnerId, actor, message: 'Postback URL changed; the old one stops working' });
  return integration(partnerId, id);
}

// ── Postbacks ─────────────────────────────────────────────────────────────────

/** Handles one broker postback. Never throws: brokers retry on errors, and a bad event shouldn't loop. */
export async function receivePostback(token: string, params: Record<string, unknown>): Promise<{ status: 'ok' | 'ignored' | 'error'; touchedUsers: string[]; partnerId?: string }> {
  const b = token.length >= 20 ? await prisma.partnerBroker.findUnique({ where: { postbackToken: token } }) : null;
  if (!b) return { status: 'error', touchedUsers: [] };
  const ev = parsePostback(params);
  const log = (status: string, error: string | null = null) => prisma.brokerEvent.create({
    data: { partnerBrokerId: b.id, kind: ev.kind, accountId: ev.accountId, payload: params as Prisma.InputJsonValue, status, error },
  });
  try {
    if (ev.kind === 'unknown' || (!ev.accountId && ev.kind !== 'commission')) {
      await log('ignored', ev.kind === 'unknown' ? 'No recognised event type' : 'No account id');
      return { status: 'ignored', touchedUsers: [], partnerId: b.partnerId };
    }
    const now = new Date();
    if (ev.accountId) {
      const at = ev.at ?? now;
      const prev = await prisma.ibAccount.findUnique({ where: { partnerBrokerId_accountId: { partnerBrokerId: b.id, accountId: ev.accountId } } });
      const recent = (d: Date | null | undefined) => !!d && now.getTime() - d.getTime() < 30 * DAY_MS;
      await prisma.ibAccount.upsert({
        where: { partnerBrokerId_accountId: { partnerBrokerId: b.id, accountId: ev.accountId } },
        create: {
          partnerBrokerId: b.id, partnerId: b.partnerId, broker: b.broker, accountId: ev.accountId, email: ev.email, platform: ev.platform, reportedAt: now,
          ...(ev.kind === 'deposit' ? { depositTotal: ev.amount ?? 0 } : {}),
          ...(ev.kind === 'trade' ? { lotsTotal: ev.lots ?? 0, lots30d: ev.lots ?? 0, trades30d: 1, lastTradeAt: at } : {}),
        },
        update: {
          removedAt: null, lastSeenAt: now, reportedAt: now, ...(ev.email ? { email: ev.email } : {}), ...(ev.platform ? { platform: ev.platform } : {}),
          ...(ev.kind === 'deposit' ? { depositTotal: (prev?.depositTotal ?? 0) + (ev.amount ?? 0) } : {}),
          // 30-day counters restart once the last trade is older than 30 days.
          ...(ev.kind === 'trade' ? {
            lotsTotal: (prev?.lotsTotal ?? 0) + (ev.lots ?? 0),
            lots30d: (recent(prev?.lastTradeAt) ? prev?.lots30d ?? 0 : 0) + (ev.lots ?? 0),
            trades30d: (recent(prev?.lastTradeAt) ? prev?.trades30d ?? 0 : 0) + 1,
            lastTradeAt: at,
          } : {}),
        },
      });
      const accountCount = await prisma.ibAccount.count({ where: { partnerBrokerId: b.id, removedAt: null } });
      await prisma.partnerBroker.update({ where: { id: b.id }, data: { status: 'OK', lastSyncAt: now, lastError: null, accountCount } });
    }
    if (ev.kind === 'commission' && ev.amount != null) {
      const externalId = ev.eventId ?? `${(ev.at ?? now).toISOString()}:${ev.accountId ?? '-'}:${ev.amount}`;
      await prisma.ibEarning.upsert({
        where: { partnerBrokerId_externalId: { partnerBrokerId: b.id, externalId } },
        create: { partnerId: b.partnerId, partnerBrokerId: b.id, accountId: ev.accountId, amount: ev.amount, currency: ev.currency ?? 'USD', earnedAt: ev.at ?? now, source: 'POSTBACK', externalId },
        update: {},
      });
    }
    await log('ok');
    const touchedUsers = ev.accountId && ev.kind === 'registration' ? await recheckLogin(b.partnerId, ev.accountId) : [];
    return { status: 'ok', touchedUsers, partnerId: b.partnerId };
  } catch (err) {
    logger.warn('[partners] postback failed', { broker: b.id, err });
    await log('error', err instanceof Error ? err.message.slice(0, 300) : 'error').catch(() => {});
    return { status: 'error', touchedUsers: [], partnerId: b.partnerId };
  }
}

// ── Commission report upload ──────────────────────────────────────────────────

export async function uploadEarnings(partnerId: string, id: string, text: string, currency: string, actor: Actor = null) {
  const b = await ownBroker(partnerId, id);
  const { rows, skipped } = parseEarnings(text, currency);
  if (!rows.length) throw new ValidationError('No commission lines found. The file needs a header with a date column and an amount / commission column.');
  const known = new Set((await prisma.ibEarning.findMany({ where: { partnerBrokerId: b.id, externalId: { in: rows.map(r => r.externalId) } }, select: { externalId: true } })).map(e => e.externalId));
  const fresh = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!known.has(r.externalId) && !fresh.has(r.externalId)) fresh.set(r.externalId, r);
  await prisma.ibEarning.createMany({
    data: [...fresh.values()].map(r => ({ partnerId, partnerBrokerId: b.id, accountId: r.accountId, amount: r.amount, currency: r.currency ?? currency, earnedAt: r.at, source: 'UPLOAD', externalId: r.externalId })),
    skipDuplicates: true,
  });
  const added = fresh.size;
  await logEvent({ kind: 'ib.earnings', partnerId, actor, message: `${brokerLabel(b.broker)} commission report: ${added} new lines${skipped ? `, ${skipped} skipped` : ''}` });
  return { added, duplicates: rows.length - added, skipped };
}

// ── REST adapter ──────────────────────────────────────────────────────────────

function hostAllowed(url: string, hosts: string[]): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase();
  return hosts.some(a => h === a || h.endsWith(`.${a}`));
}

export async function saveApiConfig(partnerId: string, id: string, config: IbApiConfig, secret: string | undefined, actor: Actor = null) {
  const b = await ownBroker(partnerId, id);
  const { ibApiHosts } = await getProgramSettings();
  if (!hostAllowed(config.baseUrl, ibApiHosts)) {
    throw new AppError(422, 'IB_API_HOST', ibApiHosts.length
      ? `That API address isn’t on the approved list (${ibApiHosts.join(', ')}). Ask TRADElogs to add it.`
      : 'No broker API addresses are approved yet. Ask TRADElogs to add your broker’s API address.');
  }
  if (!secret && !b.apiKey) throw new ValidationError('Enter the password or API key for the broker API.');
  await prisma.partnerBroker.update({
    where: { id }, data: { method: 'API', apiConfig: config as unknown as Prisma.InputJsonValue, ...(secret ? { apiKey: encryptSecret(secret) } : {}), status: 'PENDING' },
  });
  await logEvent({ kind: 'ib.api_config', partnerId, actor, message: `${brokerLabel(b.broker)} API connection set up (${new URL(config.baseUrl).hostname})` });
  return syncApi(id, actor);
}

async function apiFetch(url: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).pathname}${text ? `: ${text.slice(0, 120)}` : ''}`);
  try { return JSON.parse(text); } catch { throw new Error('The broker API didn’t return JSON.'); }
}

/** Pulls the client list through the broker's API and applies it like an uploaded list. */
export async function syncApi(id: string, actor: Actor = null): Promise<{ ok: boolean; accounts: number; error?: string }> {
  const b = await prisma.partnerBroker.findUnique({ where: { id } });
  if (!b || b.method !== 'API' || !b.apiConfig || !b.apiKey) return { ok: false, accounts: 0, error: 'Not configured' };
  const cfg = b.apiConfig as unknown as IbApiConfig;
  const { ibApiHosts } = await getProgramSettings();
  try {
    if (!hostAllowed(cfg.baseUrl, ibApiHosts)) throw new Error('The API address is no longer on the approved list.');
    const secret = decryptSecret(b.apiKey);
    const base = cfg.baseUrl.replace(/\/+$/, '');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (cfg.auth === 'jwt-login') {
      const tok = await apiFetch(`${base}${cfg.authPath ?? '/api/auth/'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ login: cfg.username, password: secret }),
      }) as Record<string, unknown>;
      const token = (tok.token ?? tok.access ?? tok.access_token) as string | undefined;
      if (!token) throw new Error('Login worked but no token came back.');
      headers.Authorization = `JWT ${token}`;
    } else if (cfg.auth === 'bearer') headers.Authorization = `Bearer ${secret}`;
    else if (cfg.auth === 'basic') headers.Authorization = `Basic ${Buffer.from(`${cfg.username ?? ''}:${secret}`).toString('base64')}`;
    else headers[cfg.headerName || 'X-API-Key'] = secret;

    const rows: IbRow[] = [];
    const activity = new Map<string, { lots?: number; deposit?: number }>();
    let url: string | null = `${base}${cfg.clientsPath.startsWith('/') ? '' : '/'}${cfg.clientsPath}`;
    for (let page = 0; url && page < 50; page++) {
      const body = await apiFetch(url, { headers }) as Record<string, unknown>;
      const list = dig(body, cfg.listKey);
      if (!Array.isArray(list)) throw new Error(`No list at “${cfg.listKey || '(top level)'}” in the response.`);
      for (const item of list) {
        const acc = dig(item, cfg.fields.accountId);
        if (acc == null || !/^[A-Za-z0-9_-]{3,30}$/.test(String(acc))) continue;
        const email = cfg.fields.email ? dig(item, cfg.fields.email) : null;
        rows.push({ accountId: String(acc), email: typeof email === 'string' && email.includes('@') ? email.toLowerCase() : null });
        const lots = cfg.fields.lots ? Number(dig(item, cfg.fields.lots)) : NaN, dep = cfg.fields.deposit ? Number(dig(item, cfg.fields.deposit)) : NaN;
        activity.set(String(acc), { ...(Number.isFinite(lots) ? { lots } : {}), ...(Number.isFinite(dep) ? { deposit: dep } : {}) });
      }
      const next = (body.next ?? dig(body, 'links.next')) as string | undefined;
      url = typeof next === 'string' && hostAllowed(next, ibApiHosts) ? next : null;
    }
    if (!rows.length) throw new Error('The API returned no client accounts.');
    await applyRows(b, rows, 'replace', 0, 'synced from the broker API', actor);
    const now = new Date();
    for (const [accountId, a] of activity) {
      if (a.lots == null && a.deposit == null) continue;
      await prisma.ibAccount.updateMany({ where: { partnerBrokerId: b.id, accountId }, data: { ...(a.lots != null ? { lotsTotal: a.lots } : {}), ...(a.deposit != null ? { depositTotal: a.deposit } : {}), reportedAt: now } });
    }
    await prisma.brokerEvent.create({ data: { partnerBrokerId: b.id, kind: 'api_sync', payload: { accounts: rows.length }, status: 'ok' } });
    return { ok: true, accounts: rows.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 300) : 'Sync failed';
    await prisma.partnerBroker.update({ where: { id }, data: { status: 'ERROR', lastError: msg, lastSyncAt: new Date() } });
    await prisma.brokerEvent.create({ data: { partnerBrokerId: b.id, kind: 'api_sync', payload: {}, status: 'error', error: msg } });
    await logEvent({ kind: 'ib.sync_failed', partnerId: b.partnerId, actor, message: `${brokerLabel(b.broker)} API sync failed: ${msg}` });
    return { ok: false, accounts: 0, error: msg };
  }
}

export async function syncDueApis(now = Date.now()): Promise<string[]> {
  const due = await prisma.partnerBroker.findMany({
    where: { method: 'API', partner: { status: 'ACTIVE' }, OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: new Date(now - 60 * 60_000) } }] },
    select: { id: true, partnerId: true }, take: 20,
  });
  for (const b of due) await syncApi(b.id);
  return [...new Set(due.map(d => d.partnerId))];
}
