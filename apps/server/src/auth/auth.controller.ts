import {
  BadRequestException,
  Controller,
  Post,
  Delete,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Get,
  Param,
  ForbiddenException,
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
import type { FastifyRequest } from 'fastify';

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

  @Get('config')
  getAuthConfig() {
    const loginNotice = process.env['LOGIN_NOTICE']?.trim() || null;
    return {
      registrationEnabled: isRegistrationAllowed(),
      loginNotice,
    };
  }

  @Post('register')
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  async register(@Req() req: FastifyRequest, @Body() body: unknown) {
    if (!isRegistrationAllowed()) {
      throw new ForbiddenException('Registration is disabled');
    }
    const parsed = RegisterRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors as Record<string, string[]>);
    }
    return this.authService.register(
      parsed.data.username,
      parsed.data.password,
      sessionContextFromRequest(req),
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  async login(@Req() req: FastifyRequest, @Body() body: unknown) {
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors as Record<string, string[]>);
    }
    return this.authService.login(
      parsed.data.username,
      parsed.data.password,
      sessionContextFromRequest(req),
    );
  }

  @Post('totp/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async verifyTotp(
    @Req() req: FastifyRequest & { user: { sub: string } },
    @Body() body: { code: string },
  ) {
    return this.authService.verifyTotp(req.user.sub, body.code, sessionContextFromRequest(req));
  }

  @Post('totp/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async setupTotp(@Req() req: FastifyRequest & { user: { sub: string; username: string } }) {
    const secret = this.totpService.generateSecret();
    const otpauthUrl = this.totpService.generateOtpauthUrl(secret, req.user.username);
    const qrCodeDataUrl = await this.totpService.generateQrDataUrl(otpauthUrl);
    return { secret, otpauthUrl, qrCodeDataUrl };
  }

  @Post('totp/enable')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async disableTotp(@Req() req: FastifyRequest & { user: { sub: string } }) {
    await this.usersService.disableTotp(req.user.sub);
    return { success: true };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  async refresh(@Req() req: FastifyRequest, @Body() body: { refreshToken: string }) {
    return this.authService.refreshTokens(body.refreshToken, sessionContextFromRequest(req));
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body() body: { refreshToken: string }) {
    await this.authService.logout(body.refreshToken);
    return { success: true };
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async listSessions(@Req() req: FastifyRequest & { user: { sub: string; sessionId?: string } }) {
    return this.authService.listSessions(req.user.sub, req.user.sessionId);
  }

  @Delete('sessions/others')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async revokeAllOtherSessions(
    @Req() req: FastifyRequest & { user: { sub: string; sessionId?: string } },
  ) {
    await this.authService.revokeAllOtherSessions(req.user.sub, req.user.sessionId);
    return { success: true };
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async passkeyRegisterOptions(
    @Req() req: FastifyRequest & { user: { sub: string; username: string } },
  ) {
    return this.passkeyService.generateRegistrationOptions(req.user.sub, req.user.username);
  }

  @Post('passkey/register/verify')
  @UseGuards(JwtAuthGuard)
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
    @Body() body: { userId?: string; response: AuthenticationResponseJSON },
  ) {
    const { verification, userId } = await this.passkeyService.verifyAuthentication(
      body.response,
      body.userId,
    );
    if (!verification.verified) return { verified: false };
    return {
      verified: true,
      ...(await this.authService.loginWithPasskey(userId!, sessionContextFromRequest(req))),
    };
  }

  @Get('passkey')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async listPasskeys(@Req() req: FastifyRequest & { user: { sub: string } }) {
    return this.passkeyService.listPasskeys(req.user.sub);
  }

  @Delete('passkey/:id')
  @UseGuards(JwtAuthGuard)
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
