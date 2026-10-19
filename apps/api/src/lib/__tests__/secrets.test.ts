import { describe, it, expect, vi } from 'vitest';

vi.mock('@tradinjournal/config', () => ({ env: { CREDENTIAL_ENCRYPTION_KEY: 'a'.repeat(64) } }));
vi.mock('@tradinjournal/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const { encryptSecret, decryptSecret, encryptionKey, isEncrypted, SecretKeyError } = await import('../secrets.js');

const KEY = Buffer.from('b'.repeat(64), 'hex');
const OTHER = Buffer.from('c'.repeat(64), 'hex');

describe('broker password encryption', () => {
  it('round-trips and never stores the plaintext', () => {
    const enc = encryptSecret('Inv3stor!pass', KEY);
    expect(isEncrypted(enc)).toBe(true);
    expect(enc).not.toContain('Inv3stor');
    expect(decryptSecret(enc, KEY)).toBe('Inv3stor!pass');
  });

  it('uses a fresh IV every time', () => {
    expect(encryptSecret('same', KEY)).not.toBe(encryptSecret('same', KEY));
  });

  it('passes legacy plaintext through', () => {
    expect(decryptSecret('old-plain-password', KEY)).toBe('old-plain-password');
    expect(isEncrypted('old-plain-password')).toBe(false);
  });

  it('rejects the wrong key and tampering', () => {
    const enc = encryptSecret('secret', KEY);
    expect(() => decryptSecret(enc, OTHER)).toThrow(SecretKeyError);
    const parts = enc.split('.');
    const tampered = [parts[0], parts[1], Buffer.from('tampered').toString('base64url')].join('.');
    expect(() => decryptSecret(tampered, KEY)).toThrow(SecretKeyError);
    expect(() => decryptSecret('enc:v1:broken', KEY)).toThrow(SecretKeyError);
  });

  it('refuses to decrypt without a key, but writes plaintext without one', () => {
    expect(() => decryptSecret(encryptSecret('x', KEY), null)).toThrow(SecretKeyError);
    expect(encryptSecret('plain', null)).toBe('plain');
  });

  it('only accepts a 64-hex key', () => {
    expect(encryptionKey('a'.repeat(64))).toHaveLength(32);
    expect(encryptionKey('CHANGE_ME_hex_32')).toBeNull();
    expect(encryptionKey('')).toBeNull();
    expect(encryptionKey('a'.repeat(63))).toBeNull();
  });

  it('reads the key from env by default', () => {
    expect(decryptSecret(encryptSecret('from-env'))).toBe('from-env');
  });
});
