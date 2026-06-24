import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import type { AuthService } from './auth.service.js';
import type { TotpService } from './totp.service.js';
import type { PasskeyService } from './passkey.service.js';
import type { UsersService } from '../users/users.service.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

describe('AuthController', () => {
  const mockAuthService = {
    register: vi.fn().mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', user: {} }),
    login: vi
      .fn()
      .mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', requiresTotp: false }),
    loginWithPasskey: vi
      .fn()
      .mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', requiresTotp: false }),
    refreshTokens: vi
      .fn()
      .mockResolvedValue({ accessToken: 'at2', refreshToken: 'rt2', requiresTotp: false }),
    logout: vi.fn().mockResolvedValue(undefined),
  };
  const mockTotpService = {};
  const mockPasskeyService = {
    verifyAuthentication: vi
      .fn()
      .mockResolvedValue({ verification: { verified: true }, userId: 'user-1' }),
  };
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
    const mockReply = {
      setCookie: vi.fn(),
      clearCookie: vi.fn(),
    } as unknown as FastifyReply;

    it('throws ForbiddenException when ALLOW_REGISTRATION is "false"', async () => {
      process.env['ALLOW_REGISTRATION'] = 'false';
      await expect(controller.register(mockReq, mockReply, validBody)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(controller.register(mockReq, mockReply, validBody)).rejects.toThrow(
        'Registration is disabled',
      );
      expect(mockAuthService.register).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when ALLOW_REGISTRATION is "0"', async () => {
      process.env['ALLOW_REGISTRATION'] = '0';
      await expect(controller.register(mockReq, mockReply, validBody)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockAuthService.register).not.toHaveBeenCalled();
    });

    it('allows the first account when registration is disabled and no users exist', async () => {
      process.env['ALLOW_REGISTRATION'] = 'false';
      mockUsersService.count.mockResolvedValue(0);
      await controller.register(mockReq, mockReply, validBody);
      expect(mockAuthService.register).toHaveBeenCalledWith(
        'newuser',
        'securepass8',
        expect.any(Object),
        { allowWhenUsersExist: false },
      );
    });

    it('calls authService.register when registration is allowed', async () => {
      process.env['ALLOW_REGISTRATION'] = 'true';
      await controller.register(mockReq, mockReply, validBody);
      expect(mockAuthService.register).toHaveBeenCalledWith(
        'newuser',
        'securepass8',
        expect.any(Object),
        { allowWhenUsersExist: true },
      );
    });

    it('sets the refresh token as an httpOnly cookie and strips it from the response', async () => {
      process.env['ALLOW_REGISTRATION'] = 'true';
      const result = await controller.register(mockReq, mockReply, validBody);
      expect(mockReply.setCookie).toHaveBeenCalledWith(
        'refresh_token',
        'rt',
        expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/api/auth' }),
      );
      expect(result).not.toHaveProperty('refreshToken');
      expect(result).toHaveProperty('accessToken', 'at');
    });

    it('calls authService.register when ALLOW_REGISTRATION is unset', async () => {
      delete process.env['ALLOW_REGISTRATION'];
      await controller.register(mockReq, mockReply, validBody);
      expect(mockAuthService.register).toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    const mockReply = { setCookie: vi.fn(), clearCookie: vi.fn() } as unknown as FastifyReply;

    beforeEach(() => {
      mockAuthService.refreshTokens.mockClear();
      vi.mocked(mockReply.setCookie).mockClear();
    });

    it('reads the refresh token from the httpOnly cookie, rotates it, and never returns it', async () => {
      const req = {
        headers: {},
        cookies: { refresh_token: 'rt-from-cookie' },
      } as unknown as FastifyRequest;
      const result = await controller.refresh(req, mockReply);
      expect(mockAuthService.refreshTokens).toHaveBeenCalledWith(
        'rt-from-cookie',
        expect.any(Object),
      );
      expect(mockReply.setCookie).toHaveBeenCalledWith('refresh_token', 'rt2', expect.any(Object));
      expect(result).not.toHaveProperty('refreshToken');
      expect(result).toHaveProperty('accessToken', 'at2');
    });

    it('rejects when the refresh cookie is missing', async () => {
      const req = { headers: {}, cookies: {} } as unknown as FastifyRequest;
      await expect(controller.refresh(req, mockReply)).rejects.toThrow('Missing refresh token');
      expect(mockAuthService.refreshTokens).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    const mockReply = { setCookie: vi.fn(), clearCookie: vi.fn() } as unknown as FastifyReply;

    it('revokes the cookie session and clears the cookie', async () => {
      const req = { headers: {}, cookies: { refresh_token: 'rt-x' } } as unknown as FastifyRequest;
      const result = await controller.logout(req, mockReply);
      expect(mockAuthService.logout).toHaveBeenCalledWith('rt-x');
      // Clear must carry the same attributes it was set with, or some browsers keep the cookie.
      expect(mockReply.clearCookie).toHaveBeenCalledWith(
        'refresh_token',
        expect.objectContaining({ path: '/api/auth', httpOnly: true, sameSite: 'lax' }),
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('issueSession on other token-minting endpoints', () => {
    const mockReply = { setCookie: vi.fn(), clearCookie: vi.fn() } as unknown as FastifyReply;
    const req = { ip: '127.0.0.1', headers: {} } as unknown as FastifyRequest;

    beforeEach(() => vi.mocked(mockReply.setCookie).mockClear());

    it('login sets the refresh cookie and strips the token from the body', async () => {
      const result = await controller.login(req, mockReply, {
        username: 'someuser',
        password: 'TestPassword1!',
      });
      expect(mockReply.setCookie).toHaveBeenCalledWith(
        'refresh_token',
        'rt',
        expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/api/auth' }),
      );
      expect(result).not.toHaveProperty('refreshToken');
      expect(result).toHaveProperty('accessToken', 'at');
    });

    it('passkey login sets the cookie on success and strips the token', async () => {
      const result = await controller.passkeyLoginVerify(req, mockReply, {
        response: {} as never,
      });
      expect(mockReply.setCookie).toHaveBeenCalledWith('refresh_token', 'rt', expect.any(Object));
      expect(result).not.toHaveProperty('refreshToken');
      expect(result).toMatchObject({ verified: true, accessToken: 'at' });
    });

    it('passkey login sets no cookie when verification fails', async () => {
      mockPasskeyService.verifyAuthentication.mockResolvedValueOnce({
        verification: { verified: false },
        userId: '',
      });
      const result = await controller.passkeyLoginVerify(req, mockReply, {
        response: {} as never,
      });
      expect(mockReply.setCookie).not.toHaveBeenCalled();
      expect(result).toEqual({ verified: false });
    });
  });
});
