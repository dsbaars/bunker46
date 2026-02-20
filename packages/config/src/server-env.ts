import { z } from 'zod';

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
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
