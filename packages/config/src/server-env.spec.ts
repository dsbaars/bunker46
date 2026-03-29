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
