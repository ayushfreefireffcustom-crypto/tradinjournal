// Personal API keys (D16) for the /api/v1 trading API. A key looks like
// tl_<prefix>_<secret>: the prefix finds the row, the secret is checked against
// its hash in constant time. Keys are shown once, can be read-only or trade,
// and can be revoked; a revoked key stops working at once.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { ApiKeyCreatedDto, ApiKeyDto, CreateApiKeyInput } from '@tradinjournal/contracts';
import { prisma, type ApiKey } from '@tradinjournal/db';
import { ConflictError, NotFoundError } from '../../http/errors.js';

const MAX_ACTIVE = 10;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const KEY_RE = /^tl_([A-Za-z0-9]{12})_([A-Za-z0-9_-]{32,64})$/;

function dto(k: ApiKey): ApiKeyDto {
  return { id: k.id, name: k.name, prefix: k.prefix, last4: k.last4, scope: k.scope as ApiKeyDto['scope'], lastUsedAt: k.lastUsedAt?.toISOString() ?? null, revokedAt: k.revokedAt?.toISOString() ?? null, createdAt: k.createdAt.toISOString() };
}

export async function listApiKeys(userId: string): Promise<ApiKeyDto[]> {
  return (await prisma.apiKey.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })).map(dto);
}

export async function createApiKey(userId: string, input: CreateApiKeyInput): Promise<ApiKeyCreatedDto> {
  const active = await prisma.apiKey.count({ where: { userId, revokedAt: null } });
  if (active >= MAX_ACTIVE) throw new ConflictError(`You can have at most ${MAX_ACTIVE} active keys. Revoke one you no longer use.`);
  const prefix = randomBytes(9).toString('base64url').replace(/[-_]/g, 'x').slice(0, 12);
  const secret = randomBytes(30).toString('base64url');
  const key = `tl_${prefix}_${secret}`;
  const row = await prisma.apiKey.create({ data: { userId, name: input.name, prefix, secretHash: sha256(secret), last4: secret.slice(-4), scope: input.scope } });
  return { ...dto(row), key };
}

export async function revokeApiKey(userId: string, id: string, now = new Date()): Promise<ApiKeyDto> {
  const k = await prisma.apiKey.findFirst({ where: { id, userId } });
  if (!k) throw new NotFoundError('API key not found');
  if (k.revokedAt) return dto(k);
  return dto(await prisma.apiKey.update({ where: { id }, data: { revokedAt: now } }));
}

export interface KeyAuth { keyId: string; userId: string; scope: 'read' | 'trade' }

/** The key's owner and scope, or null for anything that isn't a live key. */
export async function authenticateApiKey(header: string | undefined, now = new Date()): Promise<KeyAuth | null> {
  const m = /^Bearer\s+(\S+)$/.exec(header ?? '');
  const parsed = m ? KEY_RE.exec(m[1]!) : null;
  if (!parsed) return null;
  const k = await prisma.apiKey.findUnique({ where: { prefix: parsed[1]! } });
  if (!k || k.revokedAt) return null;
  const a = Buffer.from(sha256(parsed[2]!), 'hex');
  const b = Buffer.from(k.secretHash, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  // Last-used is shown in settings; once a minute is plenty and saves a write per call.
  if (!k.lastUsedAt || now.getTime() - k.lastUsedAt.getTime() > 60_000) {
    await prisma.apiKey.update({ where: { id: k.id }, data: { lastUsedAt: now } }).catch(() => undefined);
  }
  return { keyId: k.id, userId: k.userId, scope: k.scope === 'trade' ? 'trade' : 'read' };
}
