// Keyed digests of API keys. Lets us detect the same key being connected twice
// without decrypting stored keys, and name rate-limit buckets without putting
// raw keys in memory maps or logs.

import { createHash, createHmac } from 'node:crypto';

/**
 * HMAC-SHA256 of `exchange:apiKey` under a server secret. Stable for a given
 * secret; useless to anyone without it. Pass the same secret everywhere
 * (we use CREDENTIAL_ENCRYPTION_KEY's bytes).
 */
export function fingerprintApiKey(exchange: string, apiKey: string, secret: Buffer | string): string {
  return createHmac('sha256', secret).update(`${exchange}:${apiKey.trim()}`).digest('hex');
}

/** Last 4 characters of the public key, safe to show in the UI. */
export function keyLast4(apiKey: string): string {
  const k = apiKey.trim();
  return k.length <= 4 ? k : k.slice(-4);
}

/** Short unkeyed digest for in-process bucket names (never persisted). */
export function bucketName(exchange: string, apiKey: string): string {
  return `${exchange}:${createHash('sha256').update(apiKey).digest('hex').slice(0, 16)}`;
}
