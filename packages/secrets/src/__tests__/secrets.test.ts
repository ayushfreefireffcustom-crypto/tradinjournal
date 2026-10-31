import { describe, expect, it } from 'vitest';
import { decryptWithKey, encryptWithKey, isEncrypted, parseEncryptionKey, requireEncryptionKey, SecretKeyError } from '../index.js';

const KEY = parseEncryptionKey('a'.repeat(64))!;

describe('secrets', () => {
  it('round-trips with a fresh IV each time', () => {
    const a = encryptWithKey('s3cret', KEY);
    expect(isEncrypted(a)).toBe(true);
    expect(a).not.toBe(encryptWithKey('s3cret', KEY));
    expect(decryptWithKey(a, KEY)).toBe('s3cret');
  });

  it('rejects the wrong key, tampering and plaintext', () => {
    const a = encryptWithKey('s3cret', KEY);
    expect(() => decryptWithKey(a, parseEncryptionKey('b'.repeat(64))!)).toThrow(SecretKeyError);
    expect(() => decryptWithKey(a.slice(0, -2) + 'AA', KEY)).toThrow(SecretKeyError);
    expect(() => decryptWithKey('plain', KEY)).toThrow(/not encrypted/);
  });

  it('only accepts 64-hex keys', () => {
    expect(parseEncryptionKey('abc')).toBeNull();
    expect(parseEncryptionKey(undefined)).toBeNull();
    expect(() => requireEncryptionKey('')).toThrow(/64 hex/);
  });
});
