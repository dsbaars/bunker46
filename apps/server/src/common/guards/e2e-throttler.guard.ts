import { ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

function hasBearerToken(req: { headers?: Record<string, string | string[] | undefined> }): boolean {
  const auth = req.headers?.['authorization'] ?? req.headers?.['Authorization'];
  const value = Array.isArray(auth) ? auth[0] : auth;
  return typeof value === 'string' && value.trim().toLowerCase().startsWith('bearer ');
}

/**
 * Skips throttling when:
 * - The request has an Authorization Bearer token (authenticated), so live refresh and normal API use do not hit limits.
 * - Not in production and the request is from localhost (E2E and local dev).
 */
export class E2eThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const { req } = this.getRequestResponse(context);
    if (hasBearerToken(req)) return true;
    if (process.env['NODE_ENV'] === 'production') return false;
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
