// Encryption at rest for stored broker passwords (AES-256-GCM).
//
// Stored format: "enc:v1:<iv>.<tag>.<ciphertext>" (base64url). Anything without
// that prefix is a legacy plaintext value: decryptSecret passes it through, so
// existing rows keep working until scripts/encrypt-broker-passwords.ts rewrites
// them. Key: CREDENTIAL_ENCRYPTION_KEY, 32 bytes as 64 hex characters. Rotating
// the key makes every encrypted value unreadable — users would have to re-enter
// their investor passwords.
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { decryptWithKey, encryptWithKey, isEncrypted, parseEncryptionKey, SecretKeyError } from '@tradinjournal/secrets';

export { isEncrypted, SecretKeyError };

let warned = false;

/** The 32-byte key, or null when CREDENTIAL_ENCRYPTION_KEY isn't a valid 64-hex value. */
export function encryptionKey(raw: string | undefined = env.CREDENTIAL_ENCRYPTION_KEY): Buffer | null {
  return parseEncryptionKey(raw);
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
  return encryptWithKey(plain, key);
}

/** Plaintext for a stored value; legacy plaintext passes through untouched. */
export function decryptSecret(stored: string, key: Buffer | null = encryptionKey()): string {
  if (!isEncrypted(stored)) return stored;
  if (!key) throw new SecretKeyError('Stored credential is encrypted but CREDENTIAL_ENCRYPTION_KEY is not configured');
  return decryptWithKey(stored, key);
}
