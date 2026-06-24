import { Injectable, UnauthorizedException, ForbiddenException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { TotpService } from './totp.service.js';
import { randomBytes, createHmac } from 'node:crypto';

interface JwtPayload {
  sub: string;
  username: string;
  totpVerified: boolean;
  totpEnabled?: boolean;
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
    @Inject('REFRESH_TOKEN_SECRET') private readonly refreshTokenSecret: string,
  ) {}

  /**
   * Keyed hash of a refresh token for storage/lookup. Refresh tokens are high-entropy random
   * values, so an HMAC (not a slow password hash) is sufficient; keying with the server's
   * refresh-token secret means a database-only leak cannot precompute or replay tokens. The
   * domain-separation prefix keeps this hash distinct from any other use of the same secret.
   */
  private hashRefreshToken(token: string): string {
    return createHmac('sha256', this.refreshTokenSecret)
      .update(`refresh-token:${token}`)
      .digest('hex');
  }

  async register(
    username: string,
    password: string,
    sessionContext?: { ipAddress?: string; userAgent?: string },
    options?: { allowWhenUsersExist?: boolean },
  ) {
    const user = await this.usersService.create(username, password, options);
    return this.createTokens(user.id, user.username, true, sessionContext, user.role, false);
  }

  async loginWithPasskey(
    userId: string,
    sessionContext?: { ipAddress?: string; userAgent?: string },
  ) {
    const user = await this.usersService.findById(userId);
    // A passkey is a phishing-resistant possession+verification factor, so a successful passkey
    // login is treated as fully authenticated (totpVerified=true) and does NOT additionally require
    // a TOTP code, even when the account also has TOTP enabled. Passkey *registration* requires a
    // fully-authenticated session (TotpVerifiedGuard on /auth/passkey/register/*), so a pre-TOTP
    // partial token cannot enrol a passkey to sidestep the second factor.
    return this.createTokens(
      user.id,
      user.username,
      true,
      sessionContext,
      user.role,
      user.totpEnabled,
    );
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
          {
            sub: user.id,
            username: user.username,
            totpVerified: false,
            totpEnabled: true,
          },
          { expiresIn: '5m' },
        ),
      };
    }

    return this.createTokens(user.id, user.username, true, sessionContext, user.role, false);
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

    return this.createTokens(user.id, user.username, true, sessionContext, user.role, true);
  }

  async refreshTokens(
    refreshToken: string,
    sessionContext?: { ipAddress?: string; userAgent?: string },
  ) {
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: this.hashRefreshToken(refreshToken) },
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
      session.user.totpEnabled,
    );
  }

  async logout(refreshToken: string) {
    await this.prisma.session.deleteMany({
      where: { refreshTokenHash: this.hashRefreshToken(refreshToken) },
    });
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
    totpEnabled = false,
  ) {
    const refreshToken = randomBytes(48).toString('hex');
    const refreshExpiresIn = process.env['JWT_REFRESH_EXPIRES_IN'] ?? '7d';
    const days = parseInt(refreshExpiresIn) || 7;

    const session = await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: this.hashRefreshToken(refreshToken),
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
      totpEnabled,
      sessionId: session.id,
      ...(role && { role }),
    };
    const accessToken = await this.jwtService.signAsync(payload);

    return { accessToken, refreshToken, requiresTotp: false };
  }
}
