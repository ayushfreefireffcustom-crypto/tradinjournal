// Encryption at rest for stored broker passwords (AES-256-GCM).
//
// Stored format: "enc:v1:<iv>.<tag>.<ciphertext>" (base64url). Anything without
// that prefix is a legacy plaintext value: decryptSecret passes it through, so
// existing rows keep working until scripts/encrypt-broker-passwords.ts rewrites
// them. Key: CREDENTIAL_ENCRYPTION_KEY, 32 bytes as 64 hex characters. Rotating
// the key makes every encrypted value unreadable — users would have to re-enter
// their investor passwords.
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';

const PREFIX = 'enc:v1:';
let warned = false;

export class SecretKeyError extends Error {}

/** The 32-byte key, or null when CREDENTIAL_ENCRYPTION_KEY isn't a valid 64-hex value. */
export function encryptionKey(raw: string | undefined = env.CREDENTIAL_ENCRYPTION_KEY): Buffer | null {
  if (!raw || !/^[0-9a-fA-F]{64}$/.test(raw.trim())) return null;
  return Buffer.from(raw.trim(), 'hex');
}

export function isEncrypted(value: string | null | undefined): boolean {
  return !!value && value.startsWith(PREFIX);
}

/**
 * Encrypts when a key is configured. Without one it returns the value unchanged
 * (and logs once) so a missing key degrades to today's behaviour instead of
 * breaking account connections.
 */
export function encryptSecret(plain: string, key: Buffer | null = encryptionKey()): string {
  if (!key) {
    if (!warned) {
      logger.warn('[secrets] CREDENTIAL_ENCRYPTION_KEY is missing or not 64 hex chars — broker passwords are being stored unencrypted');
      warned = true;
    }
    return plain;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${PREFIX}${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ct.toString('base64url')}`;
}

/** Plaintext for a stored value; legacy plaintext passes through untouched. */
export function decryptSecret(stored: string, key: Buffer | null = encryptionKey()): string {
  if (!isEncrypted(stored)) return stored;
  if (!key) throw new SecretKeyError('Stored credential is encrypted but CREDENTIAL_ENCRYPTION_KEY is not configured');
  const [iv, tag, ct] = stored.slice(PREFIX.length).split('.');
  if (!iv || !tag || !ct) throw new SecretKeyError('Malformed encrypted credential');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    throw new SecretKeyError('Could not decrypt stored credential (wrong key or tampered value)');
  }
}
