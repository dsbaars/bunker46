import {
  BadRequestException,
  Controller,
  Post,
  Delete,
  Body,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Get,
  Param,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { LoginRequestSchema, RegisterRequestSchema } from '@bunker46/shared-types';
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from '@simplewebauthn/server';
import { AuthService } from './auth.service.js';
import { TotpService } from './totp.service.js';
import { PasskeyService } from './passkey.service.js';
import { UsersService } from '../users/users.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { TotpVerifiedGuard } from './guards/totp-verified.guard.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

/** httpOnly cookie that carries the refresh token; never exposed to browser JavaScript. */
const REFRESH_COOKIE = 'refresh_token';

/**
 * Whether the refresh cookie is marked `Secure` (sent only over HTTPS). Defaults to true in
 * production so a real deployment never ships the refresh token over plaintext. A `Secure` cookie
 * is silently dropped by the browser when the app is served over plain HTTP on a non-localhost host,
 * which makes every page reload log the user out (the reload can only restore the session by
 * exchanging this cookie). Operators serving over plain HTTP on a trusted network (e.g. a LAN-only
 * http://host:port) must therefore set `COOKIE_SECURE=false`; ideally, serve the app over HTTPS.
 */
function isCookieSecure(): boolean {
  const override = process.env['COOKIE_SECURE'];
  if (override === 'true') return true;
  if (override === 'false') return false;
  return process.env['NODE_ENV'] === 'production';
}

/**
 * Cookie attributes shared by set and clear. Browsers only delete a cookie when the clear call's
 * attributes match those it was set with, so both paths must use the same values.
 */
function refreshCookieAttrs() {
  return {
    httpOnly: true,
    secure: isCookieSecure(),
    sameSite: 'lax' as const,
    // Scope to the auth routes that consume it (refresh, logout), so it is not sent on every request.
    path: '/api/auth',
  };
}

function refreshCookieOptions() {
  // Keep in sync with AuthService's refresh-token expiry — both derive days from
  // JWT_REFRESH_EXPIRES_IN (default 7d) so the cookie lifetime matches the DB session expiry.
  const days = parseInt(process.env['JWT_REFRESH_EXPIRES_IN'] ?? '7d') || 7;
  return { ...refreshCookieAttrs(), maxAge: days * 24 * 60 * 60 };
}

function sessionContextFromRequest(req: FastifyRequest): {
  ipAddress?: string;
  userAgent?: string;
} {
  const ip =
    typeof req.ip === 'string'
      ? req.ip
      : ((req as FastifyRequest & { socket?: { remoteAddress?: string } }).socket?.remoteAddress ??
        undefined);
  const userAgent =
    typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined;
  return { ipAddress: ip, userAgent };
}

function isRegistrationAllowed(): boolean {
  const v = process.env['ALLOW_REGISTRATION'];
  return v !== 'false' && v !== '0';
}

@ApiTags('auth')
@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly totpService: TotpService,
    private readonly passkeyService: PasskeyService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Move the refresh token into an httpOnly cookie and strip it from the JSON body, so it is never
   * readable by browser JavaScript. Results without a refresh token (e.g. the partial-token TOTP
   * step, or a failed passkey verify) are returned unchanged.
   */
  private issueSession(
    reply: FastifyReply,
    result: Record<string, unknown>,
  ): Record<string, unknown> {
    const { refreshToken, ...rest } = result;
    if (typeof refreshToken === 'string') {
      reply.setCookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
    }
    return rest;
  }

  private clearRefreshCookie(reply: FastifyReply): void {
    reply.clearCookie(REFRESH_COOKIE, refreshCookieAttrs());
  }

  @Get('config')
  async getAuthConfig() {
    const loginNotice = process.env['LOGIN_NOTICE']?.trim() || null;
    // Until the first account exists, keep advertising the sign-up form even
    // when public registration is disabled (first-run setup). Short-circuit so
    // the DB is only queried when the env flag alone cannot decide, and never
    // let a DB hiccup turn the public login config into a 500.
    const registrationEnabled = isRegistrationAllowed() || (await this.noUsersExistSafe());
    return {
      registrationEnabled,
      loginNotice,
    };
  }

  private async noUsersExistSafe(): Promise<boolean> {
    try {
      return (await this.usersService.count()) === 0;
    } catch {
      return false;
    }
  }

  @Post('register')
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  async register(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() body: unknown,
  ) {
    const registrationAllowed = isRegistrationAllowed();
    // Cheap pre-check so we do not hash a password for requests that cannot
    // succeed. The authoritative, race-free gate (the very first account may be
    // created even when public registration is disabled) is enforced atomically
    // in UsersService.create.
    if (!registrationAllowed && (await this.usersService.count()) > 0) {
      throw new ForbiddenException('Registration is disabled');
    }
    const parsed = RegisterRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors as Record<string, string[]>);
    }
    const result = await this.authService.register(
      parsed.data.username,
      parsed.data.password,
      sessionContextFromRequest(req),
      { allowWhenUsersExist: registrationAllowed },
    );
    return this.issueSession(reply, result);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  async login(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() body: unknown,
  ) {
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors as Record<string, string[]>);
    }
    const result = await this.authService.login(
      parsed.data.username,
      parsed.data.password,
      sessionContextFromRequest(req),
    );
    return this.issueSession(reply, result);
  }

  // The ONLY authenticated endpoint that intentionally accepts a pre-TOTP partial token: it is the
  // step that completes the second factor. Every other authenticated route below adds
  // TotpVerifiedGuard so a partial token cannot read or mutate account/2FA state.
  @Post('totp/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async verifyTotp(
    @Req() req: FastifyRequest & { user: { sub: string } },
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() body: { code: string },
  ) {
    const result = await this.authService.verifyTotp(
      req.user.sub,
      body.code,
      sessionContextFromRequest(req),
    );
    return this.issueSession(reply, result);
  }

  @Post('totp/setup')
  @UseGuards(JwtAuthGuard, TotpVerifiedGuard)
  @ApiBearerAuth()
  async setupTotp(@Req() req: FastifyRequest & { user: { sub: string; username: string } }) {
    const secret = this.totpService.generateSecret();
    const otpauthUrl = this.totpService.generateOtpauthUrl(secret, req.user.username);
    const qrCodeDataUrl = await this.totpService.generateQrDataUrl(otpauthUrl);
    return { secret, otpauthUrl, qrCodeDataUrl };
  }

  @Post('totp/enable')
  @UseGuards(JwtAuthGuard, TotpVerifiedGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async enableTotp(
    @Req() req: FastifyRequest & { user: { sub: string; sessionId?: string } },
    @Body() body: { secret: string; code: string },
  ) {
    const { verifySync } = await import('otplib');
    const result = verifySync({ token: body.code, secret: body.secret });
    const valid = result.valid;
    if (!valid) return { success: false, message: 'Invalid TOTP code' };

    await this.totpService.enableTotp(req.user.sub, body.secret);
    if (req.user.sessionId) {
      await this.authService.revokeSession(req.user.sub, req.user.sessionId);
    }
    return { success: true, requireReauth: true };
  }

  @Delete('totp')
  @UseGuards(JwtAuthGuard, TotpVerifiedGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async disableTotp(@Req() req: FastifyRequest & { user: { sub: string } }) {
    await this.usersService.disableTotp(req.user.sub);
    return { success: true };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  async refresh(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }
    const result = await this.authService.refreshTokens(
      refreshToken,
      sessionContextFromRequest(req),
    );
    return this.issueSession(reply, result);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    this.clearRefreshCookie(reply);
    return { success: true };
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard, TotpVerifiedGuard)
  @ApiBearerAuth()
  async listSessions(@Req() req: FastifyRequest & { user: { sub: string; sessionId?: string } }) {
    return this.authService.listSessions(req.user.sub, req.user.sessionId);
  }

  @Delete('sessions/others')
  @UseGuards(JwtAuthGuard, TotpVerifiedGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async revokeAllOtherSessions(
    @Req() req: FastifyRequest & { user: { sub: string; sessionId?: string } },
  ) {
    await this.authService.revokeAllOtherSessions(req.user.sub, req.user.sessionId);
    return { success: true };
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard, TotpVerifiedGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async revokeSession(
    @Req() req: FastifyRequest & { user: { sub: string } },
    @Param('id') id: string,
  ) {
    await this.authService.revokeSession(req.user.sub, id);
    return { success: true };
  }

  @Get('passkey/register/options')
  @UseGuards(JwtAuthGuard, TotpVerifiedGuard)
  @ApiBearerAuth()
  async passkeyRegisterOptions(
    @Req() req: FastifyRequest & { user: { sub: string; username: string } },
  ) {
    return this.passkeyService.generateRegistrationOptions(req.user.sub, req.user.username);
  }

  @Post('passkey/register/verify')
  @UseGuards(JwtAuthGuard, TotpVerifiedGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async passkeyRegisterVerify(
    @Req() req: FastifyRequest & { user: { sub: string } },
    @Body() body: RegistrationResponseJSON,
  ) {
    const result = await this.passkeyService.verifyRegistration(req.user.sub, body);
    return { verified: result.verified };
  }

  @Post('passkey/login/options')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  async passkeyLoginOptions(@Body() body: { username?: string }) {
    return this.passkeyService.generateAuthenticationOptions(body.username);
  }

  @Post('passkey/login/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  async passkeyLoginVerify(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() body: { userId?: string; response: AuthenticationResponseJSON },
  ) {
    const { verification, userId } = await this.passkeyService.verifyAuthentication(
      body.response,
      body.userId,
    );
    if (!verification.verified) return { verified: false };
    const session = await this.authService.loginWithPasskey(
      userId!,
      sessionContextFromRequest(req),
    );
    return this.issueSession(reply, { verified: true, ...session });
  }

  @Get('passkey')
  @UseGuards(JwtAuthGuard, TotpVerifiedGuard)
  @ApiBearerAuth()
  async listPasskeys(@Req() req: FastifyRequest & { user: { sub: string } }) {
    return this.passkeyService.listPasskeys(req.user.sub);
  }

  @Delete('passkey/:id')
  @UseGuards(JwtAuthGuard, TotpVerifiedGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async deletePasskey(
    @Req() req: FastifyRequest & { user: { sub: string } },
    @Param('id') id: string,
  ) {
    await this.passkeyService.deletePasskey(req.user.sub, id);
    return { success: true };
  }
}
