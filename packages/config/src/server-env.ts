import { z } from 'zod';
import { SafeRelayUrlsSchema } from '@bunker46/shared-types';
import { NOSTR_CONSTANTS } from './constants.js';

/**
 * Placeholder/insecure secret detection for production fail-closed checks.
 * Hyphenated/word forms keep these specific enough that a real high-entropy secret is very unlikely
 * to match by accident, while still rejecting a verbatim copy of the shipped `.env.example` /
 * docker-compose defaults (all of which contain "change-me").
 */
const PLACEHOLDER_SECRET_PATTERNS = [/change-me/i, /placeholder/i, /your-secret/i];

/**
 * True when a production secret is an obvious placeholder or has trivially low entropy. Errs toward
 * over-rejection (fail-safe): the worst case is forcing the operator to pick a stronger key.
 */
function isInsecureProductionSecret(value: string): boolean {
  if (PLACEHOLDER_SECRET_PATTERNS.some((re) => re.test(value))) return true;
  // Too few distinct characters to be a real random key, e.g. "aaaa…", "abababab…", "abcabc…".
  // A random 32+ char hex/base64 key has well over a dozen distinct characters.
  if (new Set(value).size < 5) return true;
  return false;
}

export const serverEnvSchema = z
  .object({
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
  })
  .superRefine((env, ctx) => {
    // Fail closed in production: refuse to start with placeholder/low-entropy secrets so a verbatim
    // copy of the example env or compose defaults cannot run with publicly-known key material.
    if (env.NODE_ENV !== 'production') return;
    const secrets: [string, string | undefined][] = [
      ['JWT_SECRET', env.JWT_SECRET],
      ['JWT_REFRESH_SECRET', env.JWT_REFRESH_SECRET],
      ['ENCRYPTION_KEY', env.ENCRYPTION_KEY],
    ];
    for (const [name, value] of secrets) {
      if (value && isInsecureProductionSecret(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [name],
          message: `${name} is set to an insecure placeholder/low-entropy value. Generate a strong random secret (e.g. \`openssl rand -base64 48\`) before running in production.`,
        });
      }
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Nest DI token for {@link ServerEnv.NOSTR_DEFAULT_RELAYS} (effective default relay URLs). */
export const NOSTR_DEFAULT_RELAYS_INJECTION_TOKEN = 'NOSTR_DEFAULT_RELAYS' as const;
