// AES-256-GCM encryption at rest, shared by the API and the trading engine.
//
// Stored format: "enc:v1:<iv>.<tag>.<ciphertext>" (base64url). The key is
// CREDENTIAL_ENCRYPTION_KEY: 32 bytes as 64 hex characters. Rotating it makes
// every stored value unreadable, so it must never change.
//
// Pure functions: callers pass the key. apps/api/src/lib/secrets.ts adds the
// env default and the legacy-plaintext fallback used for broker passwords.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const SECRET_PREFIX = 'enc:v1:';

export class SecretKeyError extends Error {}

/** The 32-byte key, or null when the value isn't exactly 64 hex characters. */
export function parseEncryptionKey(raw: string | undefined): Buffer | null {
  if (!raw || !/^[0-9a-fA-F]{64}$/.test(raw.trim())) return null;
  return Buffer.from(raw.trim(), 'hex');
}

export function isEncrypted(value: string | null | undefined): boolean {
  return !!value && value.startsWith(SECRET_PREFIX);
}

export function encryptWithKey(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${SECRET_PREFIX}${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ct.toString('base64url')}`;
}

/** Decrypt an "enc:v1:" value. Throws on anything else: no plaintext pass-through. */
export function decryptWithKey(stored: string, key: Buffer): string {
  if (!isEncrypted(stored)) throw new SecretKeyError('Value is not encrypted');
  const [iv, tag, ct] = stored.slice(SECRET_PREFIX.length).split('.');
  if (!iv || !tag || !ct) throw new SecretKeyError('Malformed encrypted credential');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    throw new SecretKeyError('Could not decrypt stored credential (wrong key or tampered value)');
  }
}

/** Key for exchange secrets: required, with a clear error when missing. */
export function requireEncryptionKey(raw: string | undefined): Buffer {
  const key = parseEncryptionKey(raw);
  if (!key) throw new SecretKeyError('CREDENTIAL_ENCRYPTION_KEY must be set to 64 hex characters to store exchange keys');
  return key;
}
