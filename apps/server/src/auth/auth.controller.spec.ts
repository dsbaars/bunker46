import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import type { AuthService } from './auth.service.js';
import type { TotpService } from './totp.service.js';
import type { PasskeyService } from './passkey.service.js';
import type { UsersService } from '../users/users.service.js';
import type { FastifyRequest } from 'fastify';

describe('AuthController', () => {
  const mockAuthService = {
    register: vi.fn().mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', user: {} }),
  };
  const mockTotpService = {};
  const mockPasskeyService = {};
  const mockUsersService = {};

  let controller: AuthController;
  let envBackup: string | undefined;

  beforeEach(() => {
    controller = new AuthController(
      mockAuthService as unknown as AuthService,
      mockTotpService as TotpService,
      mockPasskeyService as PasskeyService,
      mockUsersService as UsersService,
    );
    envBackup = process.env['ALLOW_REGISTRATION'];
    mockAuthService.register.mockClear();
  });

  afterEach(() => {
    if (envBackup !== undefined) {
      process.env['ALLOW_REGISTRATION'] = envBackup;
    } else {
      delete process.env['ALLOW_REGISTRATION'];
    }
  });

  describe('getAuthConfig', () => {
    it('returns registrationEnabled: true when ALLOW_REGISTRATION is unset', () => {
      delete process.env['ALLOW_REGISTRATION'];
      expect(controller.getAuthConfig()).toEqual({ registrationEnabled: true });
    });

    it('returns registrationEnabled: true when ALLOW_REGISTRATION is "true"', () => {
      process.env['ALLOW_REGISTRATION'] = 'true';
      expect(controller.getAuthConfig()).toEqual({ registrationEnabled: true });
    });

    it('returns registrationEnabled: true for any value other than false/0', () => {
      process.env['ALLOW_REGISTRATION'] = '1';
      expect(controller.getAuthConfig()).toEqual({ registrationEnabled: true });
      process.env['ALLOW_REGISTRATION'] = 'yes';
      expect(controller.getAuthConfig()).toEqual({ registrationEnabled: true });
    });

    it('returns registrationEnabled: false when ALLOW_REGISTRATION is "false"', () => {
      process.env['ALLOW_REGISTRATION'] = 'false';
      expect(controller.getAuthConfig()).toEqual({ registrationEnabled: false });
    });

    it('returns registrationEnabled: false when ALLOW_REGISTRATION is "0"', () => {
      process.env['ALLOW_REGISTRATION'] = '0';
      expect(controller.getAuthConfig()).toEqual({ registrationEnabled: false });
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

    it('calls authService.register when registration is allowed', async () => {
      process.env['ALLOW_REGISTRATION'] = 'true';
      await controller.register(mockReq, validBody);
      expect(mockAuthService.register).toHaveBeenCalledWith(
        'newuser',
        'securepass8',
        expect.any(Object),
      );
    });

    it('calls authService.register when ALLOW_REGISTRATION is unset', async () => {
      delete process.env['ALLOW_REGISTRATION'];
      await controller.register(mockReq, validBody);
      expect(mockAuthService.register).toHaveBeenCalled();
    });
  });
});
