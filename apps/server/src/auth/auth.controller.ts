import {
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
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { TotpService } from './totp.service.js';
import { PasskeyService } from './passkey.service.js';
import { UsersService } from '../users/users.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import type { FastifyRequest } from 'fastify';

@ApiTags('auth')
@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly totpService: TotpService,
    private readonly passkeyService: PasskeyService,
    private readonly usersService: UsersService,
  ) {}

  @Post('register')
  async register(@Body() body: { username: string; password: string }) {
    return this.authService.register(body.username, body.password);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: { username: string; password: string }) {
    return this.authService.login(body.username, body.password);
  }

  @Post('totp/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async verifyTotp(
    @Req() req: FastifyRequest & { user: { sub: string } },
    @Body() body: { code: string },
  ) {
    return this.authService.verifyTotp(req.user.sub, body.code);
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
    @Req() req: FastifyRequest & { user: { sub: string } },
    @Body() body: { secret: string; code: string },
  ) {
    const { authenticator } = await import('otplib');
    const valid = authenticator.verify({ token: body.code, secret: body.secret });
    if (!valid) return { success: false, message: 'Invalid TOTP code' };

    await this.totpService.enableTotp(req.user.sub, body.secret);
    return { success: true };
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
  async refresh(@Body() body: { refreshToken: string }) {
    return this.authService.refreshTokens(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body() body: { refreshToken: string }) {
    await this.authService.logout(body.refreshToken);
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
    @Body() body: any,
  ) {
    const result = await this.passkeyService.verifyRegistration(req.user.sub, body);
    return { verified: result.verified };
  }

  @Post('passkey/login/options')
  @HttpCode(HttpStatus.OK)
  async passkeyLoginOptions(@Body() body: { username: string }) {
    const { options, userId } = await this.passkeyService.generateAuthenticationOptions(
      body.username,
    );
    return { options, userId };
  }

  @Post('passkey/login/verify')
  @HttpCode(HttpStatus.OK)
  async passkeyLoginVerify(@Body() body: { userId: string; response: any }) {
    const result = await this.passkeyService.verifyAuthentication(body.userId, body.response);
    if (!result.verified) return { verified: false };
    return { verified: true, ...(await this.authService.loginWithPasskey(body.userId)) };
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
