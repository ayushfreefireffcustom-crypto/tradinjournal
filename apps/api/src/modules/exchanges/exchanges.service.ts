// Exchange connections: users link their own exchange accounts with API keys.
// Keys are verified with the exchange, encrypted ("enc:v1:"), and never
// returned. Dependencies are injectable so the flow can be tested without a
// real exchange.
import { env } from '@tradinjournal/config';
import { prisma, type ExchangeConnection, type ExchangeEnvironment, type ExchangeVenue } from '@tradinjournal/db';
import type { ConnectExchangeInput, ExchangeCatalogItemDto, ExchangeConnectionDto } from '@tradinjournal/contracts';
import { ExchangeError, exchangeRegistry, fingerprintApiKey, keyLast4, type AccountInfo, type ApiCredentials, type Exchange } from '@tradinjournal/exchange';
import { decryptWithKey, encryptWithKey, requireEncryptionKey } from '@tradinjournal/secrets';
import { AppError, ConflictError, NotFoundError } from '../../http/errors.js';
import { logAdminAction } from '../admin/admin-audit.service.js';
import { adapterFor } from './exchanges.adapters.js';

export interface ExchangeDeps {
  adapterFor: (exchange: ExchangeVenue, environment: ExchangeEnvironment) => Exchange;
  key: () => Buffer;
  audit: (action: string, actor: { id: string; email: string }, targetId: string, details?: Record<string, unknown>) => Promise<void>;
}

const defaultDeps: ExchangeDeps = {
  adapterFor,
  key: () => requireEncryptionKey(env.CREDENTIAL_ENCRYPTION_KEY),
  audit: (action, actor, targetId, details) =>
    logAdminAction({ action, actorId: actor.id, actorEmail: actor.email, targetType: 'exchange_connection', targetId, details }).catch(() => undefined),
};

/** Exchange said no. 422 for problems the user fixes (key, IP, permission), 502/429 otherwise. */
export class ExchangeRejectedError extends AppError {
  constructor(err: ExchangeError) {
    const status = err.isCredentialProblem ? 422 : err.code === 'RATE_LIMIT' ? 429 : err.code === 'UNAVAILABLE' ? 502 : 422;
    super(status, `EXCHANGE_${err.code}`, err.message);
  }
}

function toAppError(err: unknown): unknown {
  return err instanceof ExchangeError ? new ExchangeRejectedError(err) : err;
}

type WithCounts = ExchangeConnection & { leader: { id: string } | null; _count: { follows: number } };

export function serializeConnection(c: WithCounts): ExchangeConnectionDto {
  return {
    id: c.id,
    exchange: c.exchange,
    environment: c.environment,
    label: c.label,
    keyLast4: c.keyLast4,
    canTrade: c.canTrade,
    status: c.status,
    lastError: c.lastError,
    lastCheckedAt: c.lastCheckedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    isLeader: !!c.leader,
    activeFollows: c._count.follows,
  };
}

const withCounts = { leader: { select: { id: true } }, _count: { select: { follows: { where: { status: { not: 'STOPPED' as const } } } } } };

export function catalog(): ExchangeCatalogItemDto[] {
  const ips = env.EXCHANGE_EGRESS_IPS.split(',').map((s) => s.trim()).filter(Boolean);
  return exchangeRegistry.map((x) => ({
    ...x,
    environments: x.availability === 'COMING_SOON' ? [] : env.EXCHANGE_LIVE_ENABLED && x.availability === 'LIVE' ? ['TESTNET', 'LIVE'] : ['TESTNET'],
    whitelistIps: x.ipWhitelistRequired ? ips : [],
  }));
}

export async function listConnections(userId: string): Promise<ExchangeConnectionDto[]> {
  const rows = await prisma.exchangeConnection.findMany({
    where: { userId, status: { not: 'REVOKED' } },
    include: withCounts,
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(serializeConnection);
}

async function ownConnection(userId: string, id: string): Promise<WithCounts> {
  // Another user's id looks exactly like a missing one (no existence leak).
  const c = await prisma.exchangeConnection.findFirst({ where: { id, userId, status: { not: 'REVOKED' } }, include: withCounts });
  if (!c) throw new NotFoundError('Exchange account not found');
  return c;
}

export function credsOf(c: Pick<ExchangeConnection, 'apiKeyEnc' | 'apiSecretEnc' | 'passphraseEnc'>, key: Buffer): ApiCredentials {
  return {
    apiKey: decryptWithKey(c.apiKeyEnc, key),
    apiSecret: decryptWithKey(c.apiSecretEnc, key),
    passphrase: c.passphraseEnc ? decryptWithKey(c.passphraseEnc, key) : undefined,
  };
}

export async function connectExchange(
  actor: { id: string; email: string },
  input: ConnectExchangeInput,
  deps: ExchangeDeps = defaultDeps,
): Promise<ExchangeConnectionDto> {
  const key = deps.key();
  const adapter = deps.adapterFor(input.exchange, input.environment);

  // 1. Cap per user.
  const count = await prisma.exchangeConnection.count({ where: { userId: actor.id, status: { not: 'REVOKED' } } });
  if (count >= env.EXCHANGE_MAX_CONNECTIONS) {
    throw new ConflictError(`You can connect up to ${env.EXCHANGE_MAX_CONNECTIONS} exchange accounts. Remove one first.`);
  }

  // 2. Same key already connected (checked before calling the exchange).
  const fingerprint = fingerprintApiKey(input.exchange, input.apiKey, key);
  const dupKey = await prisma.exchangeConnection.findFirst({
    where: { exchange: input.exchange, environment: input.environment, keyFingerprint: fingerprint, status: { not: 'REVOKED' } },
    select: { userId: true },
  });
  if (dupKey) {
    throw new ConflictError(dupKey.userId === actor.id ? 'You have already connected this API key.' : 'This API key is already connected to another TRADElogs account.');
  }

  // 3. Verify with the exchange. (Delta keys can't carry withdrawal rights over
  //    the API, so there is no withdraw scope to refuse; other venues check here.)
  const creds: ApiCredentials = { apiKey: input.apiKey, apiSecret: input.apiSecret, passphrase: input.passphrase };
  let verified;
  try {
    verified = await adapter.verify(creds);
  } catch (err) {
    throw toAppError(err);
  }
  if (!verified.canTrade) throw new ConflictError('This API key cannot trade. Enable the Trading permission on the key and try again.');

  // 4. Same exchange account through a different key.
  if (verified.accountRef) {
    const dupAccount = await prisma.exchangeConnection.findFirst({
      where: { exchange: input.exchange, environment: input.environment, accountRef: verified.accountRef, status: { not: 'REVOKED' } },
      select: { userId: true },
    });
    if (dupAccount) {
      throw new ConflictError(dupAccount.userId === actor.id ? 'This exchange account is already connected with another key.' : 'This exchange account is already connected to another TRADElogs account.');
    }
  }

  // 5. Encrypt and save.
  const created = await prisma.exchangeConnection.create({
    data: {
      userId: actor.id,
      exchange: input.exchange,
      environment: input.environment,
      label: input.label ?? `${input.environment === 'TESTNET' ? 'Testnet' : 'Live'} account`,
      apiKeyEnc: encryptWithKey(input.apiKey, key),
      apiSecretEnc: encryptWithKey(input.apiSecret, key),
      passphraseEnc: input.passphrase ? encryptWithKey(input.passphrase, key) : null,
      keyLast4: keyLast4(input.apiKey),
      keyFingerprint: fingerprint,
      accountRef: verified.accountRef ?? null,
      canTrade: verified.canTrade,
      status: 'ACTIVE',
      lastCheckedAt: new Date(),
    },
    include: withCounts,
  });
  await deps.audit('exchange.connect', actor, created.id, { exchange: input.exchange, environment: input.environment, keyLast4: created.keyLast4 });
  return serializeConnection(created);
}

/** Re-verify a stored key; marks it INVALID when the exchange rejects it. */
export async function testConnection(userId: string, id: string, deps: ExchangeDeps = defaultDeps): Promise<ExchangeConnectionDto> {
  const c = await ownConnection(userId, id);
  const adapter = deps.adapterFor(c.exchange, c.environment);
  try {
    const v = await adapter.verify(credsOf(c, deps.key()));
    const updated = await prisma.exchangeConnection.update({
      where: { id: c.id },
      data: { status: 'ACTIVE', canTrade: v.canTrade, lastError: null, lastCheckedAt: new Date(), accountRef: c.accountRef ?? v.accountRef ?? null },
      include: withCounts,
    });
    return serializeConnection(updated);
  } catch (err) {
    if (err instanceof ExchangeError && err.isCredentialProblem) {
      const updated = await prisma.exchangeConnection.update({
        where: { id: c.id },
        data: { status: 'INVALID', lastError: err.message, lastCheckedAt: new Date() },
        include: withCounts,
      });
      return serializeConnection(updated);
    }
    throw toAppError(err);
  }
}

export async function renameConnection(userId: string, id: string, label: string): Promise<ExchangeConnectionDto> {
  const c = await ownConnection(userId, id);
  const updated = await prisma.exchangeConnection.update({ where: { id: c.id }, data: { label }, include: withCounts });
  return serializeConnection(updated);
}

/**
 * Remove a connection. Blocked while it is a leader account or copies onto it
 * are running. The row is kept (history, orders) but its secrets are wiped.
 */
export async function removeConnection(actor: { id: string; email: string }, id: string, deps: ExchangeDeps = defaultDeps): Promise<void> {
  const c = await ownConnection(actor.id, id);
  if (c.leader) throw new ConflictError('This account is your copy-trading leader account. Stop being a leader first.');
  if (c._count.follows > 0) {
    throw new ConflictError(`Copy trading is running on this account (${c._count.follows} ${c._count.follows === 1 ? 'follow' : 'follows'}). Stop those first.`);
  }
  await prisma.exchangeConnection.update({
    where: { id: c.id },
    data: { status: 'REVOKED', apiKeyEnc: '', apiSecretEnc: '', passphraseEnc: null, lastError: null },
  });
  await deps.audit('exchange.disconnect', actor, c.id, { exchange: c.exchange, environment: c.environment, keyLast4: c.keyLast4 });
}

export async function connectionEquity(userId: string, id: string, deps: ExchangeDeps = defaultDeps): Promise<Pick<AccountInfo, 'equityUsd' | 'availableUsd' | 'baseCurrency'>> {
  const c = await ownConnection(userId, id);
  if (c.status !== 'ACTIVE') throw new ConflictError('Reconnect this account first: the exchange rejected its key.');
  try {
    const a = await deps.adapterFor(c.exchange, c.environment).getAccount(credsOf(c, deps.key()));
    return { equityUsd: a.equityUsd, availableUsd: a.availableUsd, baseCurrency: a.baseCurrency };
  } catch (err) {
    throw toAppError(err);
  }
}
