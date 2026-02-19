import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { UsersService } from '../users/users.service.js';
import type { TotpService } from './totp.service.js';
import { randomBytes } from 'node:crypto';

interface JwtPayload {
  sub: string;
  username: string;
  totpVerified: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly totpService: TotpService,
  ) {}

  async register(username: string, password: string) {
    const user = await this.usersService.create(username, password);
    return this.createTokens(user.id, user.username, false);
  }

  async loginWithPasskey(userId: string) {
    const user = await this.usersService.findById(userId);
    return this.createTokens(user.id, user.username, true);
  }

  async login(username: string, password: string) {
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

    return this.createTokens(user.id, user.username, true);
  }

  async verifyTotp(userId: string, code: string) {
    const user = await this.usersService.findById(userId);
    if (!user.totpEnabled || !user.totpSecret) {
      throw new ForbiddenException('TOTP not enabled');
    }

    const valid = this.totpService.verifyToken(user.totpSecret, code);
    if (!valid) throw new UnauthorizedException('Invalid TOTP code');

    return this.createTokens(user.id, user.username, true);
  }

  async refreshTokens(refreshToken: string) {
    const session = await this.prisma.session.findUnique({
      where: { refreshToken },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.prisma.session.delete({ where: { id: session.id } });
    return this.createTokens(session.user.id, session.user.username, session.totpVerified);
  }

  async logout(refreshToken: string) {
    await this.prisma.session.deleteMany({ where: { refreshToken } });
  }

  private async createTokens(userId: string, username: string, totpVerified: boolean) {
    const payload: JwtPayload = { sub: userId, username, totpVerified };
    const accessToken = await this.jwtService.signAsync(payload);

    const refreshToken = randomBytes(48).toString('hex');
    const refreshExpiresIn = process.env['JWT_REFRESH_EXPIRES_IN'] ?? '7d';
    const days = parseInt(refreshExpiresIn) || 7;

    await this.prisma.session.create({
      data: {
        userId,
        refreshToken,
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        totpVerified,
      },
    });

    return { accessToken, refreshToken, requiresTotp: false };
  }
}
