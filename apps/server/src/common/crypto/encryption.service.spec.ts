import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EncryptionService } from './encryption.service.js';

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(() => {
    vi.stubEnv('ENCRYPTION_KEY', 'a-very-secure-test-key-that-is-32chars!');
    service = new EncryptionService();
  });

  it('should encrypt and decrypt a string', () => {
    const plaintext = 'nsec1abc123secretkey';
    const encrypted = service.encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    const decrypted = service.decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertexts for same plaintext', () => {
    const plaintext = 'same-text';
    const a = service.encrypt(plaintext);
    const b = service.encrypt(plaintext);
    expect(a).not.toBe(b);
  });
});
