import { describe, it, expect, afterEach } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { E2eThrottlerGuard } from './e2e-throttler.guard.js';

type Req = { headers?: Record<string, string>; ip?: string };

/**
 * shouldSkip / getRequestResponse are protected; build a prototype-only instance (no DI) and stub
 * getRequestResponse so we can exercise the pure skip policy.
 */
function makeGuard(req: Req): { shouldSkip: (ctx: ExecutionContext) => Promise<boolean> } {
  const guard = Object.create(E2eThrottlerGuard.prototype) as {
    shouldSkip: (ctx: ExecutionContext) => Promise<boolean>;
    getRequestResponse: (ctx: ExecutionContext) => { req: Req; res: unknown };
  };
  guard.getRequestResponse = () => ({ req, res: {} });
  return guard;
}

const ctx = {} as ExecutionContext;
const ORIGINAL_NODE_ENV = process.env['NODE_ENV'];

describe('E2eThrottlerGuard.shouldSkip', () => {
  afterEach(() => {
    process.env['NODE_ENV'] = ORIGINAL_NODE_ENV;
  });

  it('does NOT skip bearer-authenticated requests in production', async () => {
    process.env['NODE_ENV'] = 'production';
    const guard = makeGuard({
      headers: { authorization: 'Bearer abc.def.ghi' },
      ip: '203.0.113.7',
    });
    await expect(guard.shouldSkip(ctx)).resolves.toBe(false);
  });

  it('does NOT skip localhost requests in production', async () => {
    process.env['NODE_ENV'] = 'production';
    const guard = makeGuard({ headers: {}, ip: '127.0.0.1' });
    await expect(guard.shouldSkip(ctx)).resolves.toBe(false);
  });

  it('skips bearer-authenticated requests outside production (E2E/dev)', async () => {
    process.env['NODE_ENV'] = 'development';
    const guard = makeGuard({
      headers: { authorization: 'Bearer abc.def.ghi' },
      ip: '203.0.113.7',
    });
    await expect(guard.shouldSkip(ctx)).resolves.toBe(true);
  });

  it('skips localhost requests outside production', async () => {
    process.env['NODE_ENV'] = 'development';
    const guard = makeGuard({ headers: {}, ip: '127.0.0.1' });
    await expect(guard.shouldSkip(ctx)).resolves.toBe(true);
  });
});
