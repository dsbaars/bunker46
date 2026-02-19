import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { UsersService } from '../users/users.service.js';
import type { JwtService } from '@nestjs/jwt';
import type { TotpService } from './totp.service.js';

/** Session row shape returned by prisma.session.findMany with listSessions select */
type SessionRow = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  expiresAt: Date;
};

const mockUser = {
  id: 'user-1',
  username: 'testuser',
  passwordHash: 'hash',
  dateFormat: 'MM/DD/YYYY',
  timeFormat: '12h',
  totpEnabled: false,
  totpSecret: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AuthService', () => {
  let authService: AuthService;
  let prisma: Partial<PrismaService>;
  let usersService: Partial<UsersService>;
  let jwtService: Partial<JwtService>;
  let totpService: Partial<TotpService>;

  beforeEach(() => {
    prisma = {
      session: {
        create: vi.fn().mockResolvedValue({
          id: 'session-1',
          userId: mockUser.id,
          refreshToken: 'rt',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          totpVerified: true,
          ipAddress: null,
          userAgent: null,
          createdAt: new Date(),
        }),
        findUnique: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockResolvedValue(undefined),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    usersService = {
      create: vi.fn().mockResolvedValue(mockUser),
      findById: vi.fn().mockResolvedValue(mockUser),
      findByUsername: vi.fn().mockResolvedValue(mockUser),
      verifyPassword: vi.fn().mockResolvedValue(true),
    };
    jwtService = {
      signAsync: vi.fn().mockResolvedValue('access-token'),
    };
    totpService = {
      verifyToken: vi.fn().mockReturnValue(true),
    };
    authService = new AuthService(
      prisma as PrismaService,
      usersService as UsersService,
      jwtService as JwtService,
      totpService as TotpService,
    );
  });

  describe('register', () => {
    it('should create user and return tokens', async () => {
      const result = await authService.register('testuser', 'password');
      expect(usersService.create).toHaveBeenCalledWith('testuser', 'password');
      expect(prisma.session?.create).toHaveBeenCalled();
      expect(jwtService.signAsync).toHaveBeenCalled();
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: expect.any(String),
        requiresTotp: false,
      });
    });

    it('should pass session context to session create', async () => {
      await authService.register('u', 'p', {
        ipAddress: '1.2.3.4',
        userAgent: 'Mozilla/5.0',
      });
      expect(prisma.session?.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ipAddress: '1.2.3.4',
            userAgent: 'Mozilla/5.0',
          }),
        }),
      );
    });
  });

  describe('loginWithPasskey', () => {
    it('should return tokens for valid userId', async () => {
      const result = await authService.loginWithPasskey('user-1');
      expect(usersService.findById).toHaveBeenCalledWith('user-1');
      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBeDefined();
    });
  });

  describe('login', () => {
    it('should throw when user not found', async () => {
      vi.mocked(usersService.findByUsername!).mockResolvedValue(null);
      await expect(authService.login('nobody', 'pass')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw when password invalid', async () => {
      vi.mocked(usersService.verifyPassword!).mockResolvedValue(false);
      await expect(authService.login('testuser', 'wrong')).rejects.toThrow(UnauthorizedException);
    });

    it('should return tokens when no TOTP', async () => {
      const result = await authService.login('testuser', 'password');
      expect(result.requiresTotp).toBe(false);
      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBeDefined();
    });

    it('should return requiresTotp and partialToken when TOTP enabled', async () => {
      vi.mocked(usersService.findByUsername!).mockResolvedValue({
        ...mockUser,
        totpEnabled: true,
      });
      const result = await authService.login('testuser', 'password');
      expect(result.requiresTotp).toBe(true);
      expect(result.partialToken).toBe('access-token');
      expect(result.refreshToken).toBeUndefined();
    });
  });

  describe('verifyTotp', () => {
    it('should throw when TOTP not enabled', async () => {
      vi.mocked(usersService.findById!).mockResolvedValue({
        ...mockUser,
        totpEnabled: false,
        totpSecret: null,
      });
      await expect(authService.verifyTotp('user-1', '123456')).rejects.toThrow(ForbiddenException);
    });

    it('should throw when code invalid', async () => {
      vi.mocked(usersService.findById!).mockResolvedValue({
        ...mockUser,
        totpEnabled: true,
        totpSecret: 'encrypted',
      });
      vi.mocked(totpService.verifyToken!).mockReturnValue(false);
      await expect(authService.verifyTotp('user-1', '000000')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return tokens when code valid', async () => {
      vi.mocked(usersService.findById!).mockResolvedValue({
        ...mockUser,
        totpEnabled: true,
        totpSecret: 'encrypted',
      });
      const result = await authService.verifyTotp('user-1', '123456');
      expect(result.requiresTotp).toBe(false);
      expect(result.accessToken).toBe('access-token');
    });
  });

  describe('refreshTokens', () => {
    it('should throw when session not found', async () => {
      vi.mocked(prisma.session!.findUnique!).mockResolvedValue(null);
      await expect(authService.refreshTokens('bad-refresh')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw when session expired', async () => {
      vi.mocked(prisma.session!.findUnique!).mockResolvedValue({
        id: 's1',
        userId: mockUser.id,
        refreshToken: 'rt',
        expiresAt: new Date(Date.now() - 1000),
        totpVerified: true,
        ipAddress: null,
        userAgent: null,
        createdAt: new Date(),
        user: mockUser,
      });
      await expect(authService.refreshTokens('rt')).rejects.toThrow(UnauthorizedException);
    });

    it('should return new tokens and delete old session', async () => {
      vi.mocked(prisma.session!.findUnique!).mockResolvedValue({
        id: 's1',
        userId: mockUser.id,
        refreshToken: 'rt',
        expiresAt: new Date(Date.now() + 86400000),
        totpVerified: true,
        ipAddress: null,
        userAgent: null,
        createdAt: new Date(),
        user: mockUser,
      });
      const result = await authService.refreshTokens('rt');
      expect(prisma.session?.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
      expect(result.accessToken).toBe('access-token');
    });
  });

  describe('logout', () => {
    it('should delete sessions by refresh token', async () => {
      await authService.logout('refresh-token');
      expect(prisma.session?.deleteMany).toHaveBeenCalledWith({
        where: { refreshToken: 'refresh-token' },
      });
    });
  });

  describe('listSessions', () => {
    it('should return sessions with current flag', async () => {
      const sessions = [
        {
          id: 's1',
          userAgent: 'Chrome',
          ipAddress: '1.2.3.4',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 86400),
        },
        {
          id: 's2',
          userAgent: null,
          ipAddress: null,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 86400),
        },
      ];
      vi.mocked(prisma.session!.findMany!).mockResolvedValue(sessions as SessionRow[]);
      const result = await authService.listSessions('user-1', 's1');
      expect(result).toHaveLength(2);
      expect(result[0].current).toBe(true);
      expect(result[1].current).toBe(false);
      expect(result[0].userAgent).toBe('Chrome');
      expect(result[0].ipAddress).toBe('1.2.3.4');
    });
  });

  describe('revokeSession', () => {
    it('should delete session by id and userId', async () => {
      await authService.revokeSession('user-1', 'session-1');
      expect(prisma.session?.deleteMany).toHaveBeenCalledWith({
        where: { id: 'session-1', userId: 'user-1' },
      });
    });
  });

  describe('revokeAllOtherSessions', () => {
    it('should delete all sessions when keepSessionId not provided', async () => {
      await authService.revokeAllOtherSessions('user-1');
      expect(prisma.session?.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });

    it('should delete all sessions except keepSessionId', async () => {
      await authService.revokeAllOtherSessions('user-1', 'keep-session');
      expect(prisma.session?.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', id: { not: 'keep-session' } },
      });
    });
  });
});
