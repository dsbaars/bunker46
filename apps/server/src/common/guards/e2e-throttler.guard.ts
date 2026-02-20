import { ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Skips throttling when not in production and the request is from localhost.
 * Used so E2E tests and local dev do not hit rate limits; production still enforces them.
 */
export class E2eThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (process.env['NODE_ENV'] === 'production') return false;
    const { req } = this.getRequestResponse(context);
    const ip =
      typeof req.ip === 'string'
        ? req.ip
        : (req.socket?.remoteAddress ?? req.raw?.socket?.remoteAddress ?? '');
    const isLocalhost =
      ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost';
    if (isLocalhost) return true;
    return super.shouldSkip(context);
  }
}
