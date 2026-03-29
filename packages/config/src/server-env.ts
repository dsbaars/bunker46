import { z } from 'zod';
import { SafeRelayUrlsSchema } from '@bunker46/shared-types';
import { NOSTR_CONSTANTS } from './constants.js';

export const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url(),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32).optional(),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  ENCRYPTION_KEY: z.string().min(32),

  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  WEBAUTHN_RP_NAME: z.string().default('Bunker46'),
  WEBAUTHN_RP_ID: z.string().default('localhost'),
  WEBAUTHN_ORIGIN: z.string().default('http://localhost:5173'),

  REDIS_URL: z.string().url().optional(),

  /** When "false" or "0", new user registration is disabled (backend and frontend). */
  ALLOW_REGISTRATION: z
    .string()
    .optional()
    .default('true')
    .transform((s) => s !== 'false' && s !== '0'),

  /**
   * When "true", "1", or "yes", trust X-Forwarded-For / X-Real-IP from a reverse proxy (e.g. Caddy).
   * Enables correct client IP for sessions and throttling. Only enable when the app is behind a proxy
   * that sets these headers; do not enable if clients can reach the app directly.
   */
  TRUST_PROXY: z
    .string()
    .optional()
    .default('false')
    .transform((s) => s === 'true' || s === '1' || s === 'yes'),

  /**
   * Optional notice shown on the login (and register) page, e.g. to warn that this is a testing
   * server and data may be deleted. Leave unset or empty to show no notice.
   */
  LOGIN_NOTICE: z.string().optional().default(''),

  /**
   * Override built-in default Nostr relays (wss:// only, comma-separated).
   * Used when no relays are stored in the database and as fallback in the bunker service.
   */
  NOSTR_DEFAULT_RELAYS: z
    .string()
    .optional()
    .default('')
    .superRefine((raw, ctx) => {
      const urls = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (urls.length === 0) return;
      const parsed = SafeRelayUrlsSchema.safeParse(urls);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: issue.message,
            path: ['NOSTR_DEFAULT_RELAYS', ...(issue.path as (string | number)[])],
          });
        }
      }
    })
    .transform((raw) => {
      const urls = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (urls.length === 0) return [...NOSTR_CONSTANTS.DEFAULT_RELAYS];
      return SafeRelayUrlsSchema.parse(urls);
    }),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Nest DI token for {@link ServerEnv.NOSTR_DEFAULT_RELAYS} (effective default relay URLs). */
export const NOSTR_DEFAULT_RELAYS_INJECTION_TOKEN = 'NOSTR_DEFAULT_RELAYS' as const;
