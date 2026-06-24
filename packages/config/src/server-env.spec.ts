import { describe, it, expect } from 'vitest';
import { NOSTR_CONSTANTS } from './constants.js';
import { serverEnvSchema } from './server-env.js';

describe('serverEnvSchema', () => {
  const baseEnv = {
    DATABASE_URL: 'postgresql://localhost:5432/test',
    JWT_SECRET: 'a'.repeat(32),
    ENCRYPTION_KEY: 'b'.repeat(32),
  };

  describe('ALLOW_REGISTRATION', () => {
    it('defaults to true when omitted', () => {
      const result = serverEnvSchema.safeParse(baseEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ALLOW_REGISTRATION).toBe(true);
      }
    });

    it('parses "true" as true', () => {
      const result = serverEnvSchema.safeParse({
        ...baseEnv,
        ALLOW_REGISTRATION: 'true',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ALLOW_REGISTRATION).toBe(true);
      }
    });

    it('parses "false" as false', () => {
      const result = serverEnvSchema.safeParse({
        ...baseEnv,
        ALLOW_REGISTRATION: 'false',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ALLOW_REGISTRATION).toBe(false);
      }
    });

    it('parses "0" as false', () => {
      const result = serverEnvSchema.safeParse({
        ...baseEnv,
        ALLOW_REGISTRATION: '0',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ALLOW_REGISTRATION).toBe(false);
      }
    });

    it('parses other values as true', () => {
      const result = serverEnvSchema.safeParse({
        ...baseEnv,
        ALLOW_REGISTRATION: '1',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ALLOW_REGISTRATION).toBe(true);
      }
    });
  });

  describe('production secret validation', () => {
    const strongSecrets = {
      JWT_SECRET: 'Vq8c3Jt0pN7xR2wL5kZ9bH4dM6sA1eF3gC8uY2nB7oP',
      JWT_REFRESH_SECRET: 'Zr4m9Kx2tQ7yW1aS6dG3hJ8bN5cV0fL2eR9pU4iO7kX',
      ENCRYPTION_KEY: 'Lp3n8Bx1qT6yV2aD7gH4jK9cM5sW0fR3eZ8uI2oN7bC',
    };

    it('accepts strong secrets in production', () => {
      const result = serverEnvSchema.safeParse({
        ...baseEnv,
        ...strongSecrets,
        NODE_ENV: 'production',
      });
      expect(result.success).toBe(true);
    });

    it('rejects placeholder JWT_SECRET in production', () => {
      const result = serverEnvSchema.safeParse({
        ...baseEnv,
        ...strongSecrets,
        NODE_ENV: 'production',
        JWT_SECRET: 'change-me-to-a-random-string-at-least-32-chars',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path[0] === 'JWT_SECRET')).toBe(true);
      }
    });

    it('rejects placeholder ENCRYPTION_KEY in production', () => {
      const result = serverEnvSchema.safeParse({
        ...baseEnv,
        ...strongSecrets,
        NODE_ENV: 'production',
        ENCRYPTION_KEY: 'change-me-to-a-secure-encryption-key-min-32',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path[0] === 'ENCRYPTION_KEY')).toBe(true);
      }
    });

    it('rejects a single-repeated-character secret in production', () => {
      const result = serverEnvSchema.safeParse({
        ...baseEnv,
        ...strongSecrets,
        NODE_ENV: 'production',
        JWT_SECRET: 'a'.repeat(40),
      });
      expect(result.success).toBe(false);
    });

    it('rejects a low-distinct-character secret (e.g. "abab…") in production', () => {
      const result = serverEnvSchema.safeParse({
        ...baseEnv,
        ...strongSecrets,
        NODE_ENV: 'production',
        ENCRYPTION_KEY: 'ab'.repeat(20), // 40 chars, only 2 distinct characters
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path[0] === 'ENCRYPTION_KEY')).toBe(true);
      }
    });

    it('allows placeholder secrets outside production (development default)', () => {
      // baseEnv uses 'a'*32 / 'b'*32 and no NODE_ENV (=> development); must still pass.
      const result = serverEnvSchema.safeParse(baseEnv);
      expect(result.success).toBe(true);
    });
  });

  describe('NOSTR_DEFAULT_RELAYS', () => {
    it('defaults to built-in relays when omitted', () => {
      const result = serverEnvSchema.safeParse(baseEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.NOSTR_DEFAULT_RELAYS).toEqual([...NOSTR_CONSTANTS.DEFAULT_RELAYS]);
      }
    });

    it('defaults to built-in when empty string', () => {
      const result = serverEnvSchema.safeParse({
        ...baseEnv,
        NOSTR_DEFAULT_RELAYS: '  ,  ',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.NOSTR_DEFAULT_RELAYS).toEqual([...NOSTR_CONSTANTS.DEFAULT_RELAYS]);
      }
    });

    it('parses comma-separated wss URLs', () => {
      const result = serverEnvSchema.safeParse({
        ...baseEnv,
        NOSTR_DEFAULT_RELAYS: 'wss://relay1.example.com, wss://relay2.example.com',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.NOSTR_DEFAULT_RELAYS).toEqual([
          'wss://relay1.example.com',
          'wss://relay2.example.com',
        ]);
      }
    });

    it('rejects invalid relay URLs', () => {
      const result = serverEnvSchema.safeParse({
        ...baseEnv,
        NOSTR_DEFAULT_RELAYS: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });

    it('rejects ws:// (only wss allowed)', () => {
      const result = serverEnvSchema.safeParse({
        ...baseEnv,
        NOSTR_DEFAULT_RELAYS: 'ws://relay.example.com',
      });
      expect(result.success).toBe(false);
    });
  });
});
