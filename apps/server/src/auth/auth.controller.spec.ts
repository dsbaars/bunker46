import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { TotpVerifiedGuard } from './guards/totp-verified.guard.js';
import type { AuthService } from './auth.service.js';
import type { TotpService } from './totp.service.js';
import type { PasskeyService } from './passkey.service.js';
import type { UsersService } from '../users/users.service.js';
import type { FastifyRequest } from 'fastify';

/** Read the guards declared by @UseGuards on a controller method. */
function methodGuards(method: (...args: never[]) => unknown): unknown[] {
  return (Reflect.getMetadata('__guards__', method) as unknown[]) ?? [];
}

describe('AuthController', () => {
  const mockAuthService = {
    register: vi.fn().mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', user: {} }),
  };
  const mockTotpService = {};
  const mockPasskeyService = {};
  const mockUsersService = {
    count: vi.fn().mockResolvedValue(1),
  };

  let controller: AuthController;
  let envBackup: string | undefined;

  beforeEach(() => {
    controller = new AuthController(
      mockAuthService as unknown as AuthService,
      mockTotpService as TotpService,
      mockPasskeyService as PasskeyService,
      mockUsersService as unknown as UsersService,
    );
    envBackup = process.env['ALLOW_REGISTRATION'];
    mockAuthService.register.mockClear();
    // Default: at least one user already exists, so registration gating reflects
    // only ALLOW_REGISTRATION. Tests that exercise the first-account bootstrap
    // path override this to resolve 0.
    mockUsersService.count.mockReset();
    mockUsersService.count.mockResolvedValue(1);
  });

  afterEach(() => {
    if (envBackup !== undefined) {
      process.env['ALLOW_REGISTRATION'] = envBackup;
    } else {
      delete process.env['ALLOW_REGISTRATION'];
    }
  });

  describe('getAuthConfig', () => {
    it('returns registrationEnabled: true when ALLOW_REGISTRATION is unset', async () => {
      delete process.env['ALLOW_REGISTRATION'];
      expect(await controller.getAuthConfig()).toEqual({
        registrationEnabled: true,
        loginNotice: null,
      });
    });

    it('returns registrationEnabled: true when ALLOW_REGISTRATION is "true"', async () => {
      process.env['ALLOW_REGISTRATION'] = 'true';
      expect(await controller.getAuthConfig()).toEqual({
        registrationEnabled: true,
        loginNotice: null,
      });
    });

    it('returns registrationEnabled: true for any value other than false/0', async () => {
      process.env['ALLOW_REGISTRATION'] = '1';
      expect(await controller.getAuthConfig()).toEqual({
        registrationEnabled: true,
        loginNotice: null,
      });
      process.env['ALLOW_REGISTRATION'] = 'yes';
      expect(await controller.getAuthConfig()).toEqual({
        registrationEnabled: true,
        loginNotice: null,
      });
    });

    it('returns registrationEnabled: false when ALLOW_REGISTRATION is "false"', async () => {
      process.env['ALLOW_REGISTRATION'] = 'false';
      expect(await controller.getAuthConfig()).toEqual({
        registrationEnabled: false,
        loginNotice: null,
      });
    });

    it('returns registrationEnabled: false when ALLOW_REGISTRATION is "0"', async () => {
      process.env['ALLOW_REGISTRATION'] = '0';
      expect(await controller.getAuthConfig()).toEqual({
        registrationEnabled: false,
        loginNotice: null,
      });
    });

    it('returns registrationEnabled: true when registration is disabled but no users exist yet', async () => {
      process.env['ALLOW_REGISTRATION'] = 'false';
      mockUsersService.count.mockResolvedValue(0);
      expect(await controller.getAuthConfig()).toEqual({
        registrationEnabled: true,
        loginNotice: null,
      });
    });

    it('returns loginNotice when LOGIN_NOTICE is set', async () => {
      process.env['LOGIN_NOTICE'] = ' Testing server. Data may be deleted. ';
      expect(await controller.getAuthConfig()).toEqual({
        registrationEnabled: true,
        loginNotice: 'Testing server. Data may be deleted.',
      });
      delete process.env['LOGIN_NOTICE'];
    });
  });

  describe('register', () => {
    const validBody = { username: 'newuser', password: 'securepass8' };
    const mockReq = { ip: '127.0.0.1', headers: {} } as FastifyRequest;

    it('throws ForbiddenException when ALLOW_REGISTRATION is "false"', async () => {
      process.env['ALLOW_REGISTRATION'] = 'false';
      await expect(controller.register(mockReq, validBody)).rejects.toThrow(ForbiddenException);
      await expect(controller.register(mockReq, validBody)).rejects.toThrow(
        'Registration is disabled',
      );
      expect(mockAuthService.register).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when ALLOW_REGISTRATION is "0"', async () => {
      process.env['ALLOW_REGISTRATION'] = '0';
      await expect(controller.register(mockReq, validBody)).rejects.toThrow(ForbiddenException);
      expect(mockAuthService.register).not.toHaveBeenCalled();
    });

    it('allows the first account when registration is disabled and no users exist', async () => {
      process.env['ALLOW_REGISTRATION'] = 'false';
      mockUsersService.count.mockResolvedValue(0);
      await controller.register(mockReq, validBody);
      expect(mockAuthService.register).toHaveBeenCalledWith(
        'newuser',
        'securepass8',
        expect.any(Object),
        { allowWhenUsersExist: false },
      );
    });

    it('calls authService.register when registration is allowed', async () => {
      process.env['ALLOW_REGISTRATION'] = 'true';
      await controller.register(mockReq, validBody);
      expect(mockAuthService.register).toHaveBeenCalledWith(
        'newuser',
        'securepass8',
        expect.any(Object),
        { allowWhenUsersExist: true },
      );
    });

    it('calls authService.register when ALLOW_REGISTRATION is unset', async () => {
      delete process.env['ALLOW_REGISTRATION'];
      await controller.register(mockReq, validBody);
      expect(mockAuthService.register).toHaveBeenCalled();
    });
  });

  // Regression guard: a pre-TOTP partial token must not reach account/2FA-mutation endpoints.
  // This catches a new authenticated endpoint being added without TotpVerifiedGuard.
  describe('full-auth guard coverage', () => {
    const proto = AuthController.prototype;

    it.each([
      ['disableTotp'],
      ['setupTotp'],
      ['enableTotp'],
      ['listSessions'],
      ['revokeSession'],
      ['revokeAllOtherSessions'],
      ['passkeyRegisterOptions'],
      ['passkeyRegisterVerify'],
      ['listPasskeys'],
      ['deletePasskey'],
    ])('requires JwtAuthGuard + TotpVerifiedGuard on %s', (name) => {
      const guards = methodGuards((proto as Record<string, never>)[name]);
      expect(guards).toContain(JwtAuthGuard);
      expect(guards).toContain(TotpVerifiedGuard);
    });

    it('keeps totp/verify open to a partial token (JwtAuthGuard only)', () => {
      const guards = methodGuards(proto.verifyTotp);
      expect(guards).toContain(JwtAuthGuard);
      expect(guards).not.toContain(TotpVerifiedGuard);
    });
  });
});
