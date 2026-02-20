import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { TotpService } from './totp.service.js';
import { randomBytes } from 'node:crypto';

interface JwtPayload {
  sub: string;
  username: string;
  totpVerified: boolean;
  sessionId?: string;
  role?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly totpService: TotpService,
  ) {}

  async register(
    username: string,
    password: string,
    sessionContext?: { ipAddress?: string; userAgent?: string },
  ) {
    const user = await this.usersService.create(username, password);
    return this.createTokens(user.id, user.username, false, sessionContext, user.role);
  }

  async loginWithPasskey(
    userId: string,
    sessionContext?: { ipAddress?: string; userAgent?: string },
  ) {
    const user = await this.usersService.findById(userId);
    return this.createTokens(user.id, user.username, true, sessionContext, user.role);
  }

  async login(
    username: string,
    password: string,
    sessionContext?: { ipAddress?: string; userAgent?: string },
  ) {
    const user = await this.usersService.findByUsername(username);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await this.usersService.verifyPassword(user, password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (user.totpEnabled) {
      return {
        requiresTotp: true,
        partialToken: await this.jwtService.signAsync(
          { sub: user.id, username: user.username, totpVerified: false },
          { expiresIn: '5m' },
        ),
      };
    }

    return this.createTokens(user.id, user.username, true, sessionContext, user.role);
  }

  async verifyTotp(
    userId: string,
    code: string,
    sessionContext?: { ipAddress?: string; userAgent?: string },
  ) {
    const user = await this.usersService.findById(userId);
    if (!user.totpEnabled || !user.totpSecret) {
      throw new ForbiddenException('TOTP not enabled');
    }

    const valid = this.totpService.verifyToken(user.totpSecret, code);
    if (!valid) throw new UnauthorizedException('Invalid TOTP code');

    return this.createTokens(user.id, user.username, true, sessionContext, user.role);
  }

  async refreshTokens(
    refreshToken: string,
    sessionContext?: { ipAddress?: string; userAgent?: string },
  ) {
    const session = await this.prisma.session.findUnique({
      where: { refreshToken },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.prisma.session.delete({ where: { id: session.id } });
    return this.createTokens(
      session.user.id,
      session.user.username,
      session.totpVerified,
      sessionContext,
      session.user.role,
    );
  }

  async logout(refreshToken: string) {
    await this.prisma.session.deleteMany({ where: { refreshToken } });
  }

  async listSessions(userId: string, currentSessionId?: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
      },
    });
    return sessions.map((s) => ({
      id: s.id,
      userAgent: s.userAgent ?? undefined,
      ipAddress: s.ipAddress ?? undefined,
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      current: currentSessionId ? s.id === currentSessionId : false,
    }));
  }

  async revokeSession(userId: string, sessionId: string) {
    await this.prisma.session.deleteMany({
      where: { id: sessionId, userId },
    });
  }

  async revokeAllOtherSessions(userId: string, keepSessionId?: string) {
    const where: { userId: string; id?: { not: string } } = { userId };
    if (keepSessionId) where.id = { not: keepSessionId };
    await this.prisma.session.deleteMany({ where });
  }

  private async createTokens(
    userId: string,
    username: string,
    totpVerified: boolean,
    sessionContext?: { ipAddress?: string; userAgent?: string },
    role?: string,
  ) {
    const refreshToken = randomBytes(48).toString('hex');
    const refreshExpiresIn = process.env['JWT_REFRESH_EXPIRES_IN'] ?? '7d';
    const days = parseInt(refreshExpiresIn) || 7;

    const session = await this.prisma.session.create({
      data: {
        userId,
        refreshToken,
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        totpVerified,
        ipAddress: sessionContext?.ipAddress ?? null,
        userAgent: sessionContext?.userAgent ?? null,
      },
    });

    const payload: JwtPayload = {
      sub: userId,
      username,
      totpVerified,
      sessionId: session.id,
      ...(role && { role }),
    };
    const accessToken = await this.jwtService.signAsync(payload);

    return { accessToken, refreshToken, requiresTotp: false };
  }
}
