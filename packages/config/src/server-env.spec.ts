import { describe, it, expect } from 'vitest';
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
});
