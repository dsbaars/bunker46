import { ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

function hasBearerToken(req: { headers?: Record<string, string | string[] | undefined> }): boolean {
  const auth = req.headers?.['authorization'] ?? req.headers?.['Authorization'];
  const value = Array.isArray(auth) ? auth[0] : auth;
  return typeof value === 'string' && value.trim().toLowerCase().startsWith('bearer ');
}

/**
 * Throttling-skip policy.
 *
 * In production, nothing is skipped: authenticated (bearer) traffic is rate limited like any other
 * request. A blanket bearer-token bypass would disable rate limiting for all real API use and leave
 * authenticated flows (e.g. TOTP verification) open to brute force.
 *
 * Outside production, requests are skipped for local development and E2E convenience:
 * - any bearer-authenticated request (E2E exercises authenticated flows heavily), or
 * - any request originating from localhost.
 */
export class E2eThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (process.env['NODE_ENV'] === 'production') return false;

    const { req } = this.getRequestResponse(context);
    if (hasBearerToken(req)) return true;
    const ip =
      typeof req.ip === 'string'
        ? req.ip
        : (req.socket?.remoteAddress ??
          (req as { raw?: { socket?: { remoteAddress?: string } } }).raw?.socket?.remoteAddress ??
          '');
    const isLocalhost =
      ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost';
    if (isLocalhost) return true;
    return super.shouldSkip(context);
  }
}
