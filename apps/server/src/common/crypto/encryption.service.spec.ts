import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash, createCipheriv, randomBytes } from 'node:crypto';
import { EncryptionService } from './encryption.service.js';

const PASSPHRASE_KEY = 'a-very-secure-test-key-that-is-32chars!';
const HEX_KEY = 'a'.repeat(64); // 32 bytes as hex
const BASE64_KEY = randomBytes(32).toString('base64'); // 32 bytes as base64

/** Re-create the pre-v2 (legacy) ciphertext format: SHA-256(rawKey) + AES-256-GCM, no prefix. */
function legacyEncrypt(rawKey: string, plaintext: string): string {
  const key = createHash('sha256').update(rawKey).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(() => {
    vi.stubEnv('ENCRYPTION_KEY', PASSPHRASE_KEY);
    service = new EncryptionService();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should encrypt and decrypt a string', () => {
    const plaintext = 'nsec1abc123secretkey';
    const encrypted = service.encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(service.decrypt(encrypted)).toBe(plaintext);
  });

  it('should produce different ciphertexts for same plaintext', () => {
    const a = service.encrypt('same-text');
    const b = service.encrypt('same-text');
    expect(a).not.toBe(b);
  });

  it('tags new ciphertext with the v2 format prefix', () => {
    expect(service.encrypt('x').startsWith('v2:')).toBe(true);
  });

  it('still decrypts legacy (pre-v2) ciphertext encrypted with the same key', () => {
    const legacy = legacyEncrypt(PASSPHRASE_KEY, 'nsec1legacysecret');
    expect(legacy.startsWith('v2:')).toBe(false);
    expect(service.decrypt(legacy)).toBe('nsec1legacysecret');
  });

  it('throws when ENCRYPTION_KEY is too short', () => {
    vi.stubEnv('ENCRYPTION_KEY', 'short');
    expect(() => new EncryptionService()).toThrow(/at least 32 characters/);
  });

  describe('raw 32-byte keys (recommended)', () => {
    it('accepts a 64-char hex key and round-trips', () => {
      vi.stubEnv('ENCRYPTION_KEY', HEX_KEY);
      const s = new EncryptionService();
      const enc = s.encrypt('secret');
      expect(enc.startsWith('v2:')).toBe(true);
      expect(s.decrypt(enc)).toBe('secret');
    });

    it('accepts a base64-encoded 32-byte key and round-trips', () => {
      vi.stubEnv('ENCRYPTION_KEY', BASE64_KEY);
      const s = new EncryptionService();
      expect(s.decrypt(s.encrypt('secret'))).toBe('secret');
    });

    it('a different key cannot decrypt raw-key ciphertext (GCM auth fails)', () => {
      vi.stubEnv('ENCRYPTION_KEY', HEX_KEY);
      const enc = new EncryptionService().encrypt('secret');
      vi.stubEnv('ENCRYPTION_KEY', PASSPHRASE_KEY);
      expect(() => new EncryptionService().decrypt(enc)).toThrow();
    });
  });
});
