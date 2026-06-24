import { describe, it, expect } from 'vitest';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { TotpVerifiedGuard } from './totp-verified.guard.js';

function contextWithUser(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('TotpVerifiedGuard', () => {
  const guard = new TotpVerifiedGuard();

  it('rejects a partial token (TOTP enabled but not yet verified)', () => {
    const ctx = contextWithUser({ sub: 'u1', totpEnabled: true, totpVerified: false });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows a fully verified TOTP session', () => {
    const ctx = contextWithUser({ sub: 'u1', totpEnabled: true, totpVerified: true });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows accounts without TOTP enabled', () => {
    const ctx = contextWithUser({ sub: 'u1', totpEnabled: false, totpVerified: false });
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
