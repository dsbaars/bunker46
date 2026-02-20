import { Controller, Get, Patch, Body, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { UsersService } from './users.service.js';
import type { UserProfileDto, UserSettingsDto } from '@bunker46/shared-types';
import type { FastifyRequest } from 'fastify';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getProfile(
    @Req() req: FastifyRequest & { user: { sub: string } },
  ): Promise<UserProfileDto> {
    const user = await this.usersService.findById(req.user.sub);
    const passkeysCount = await this.usersService.getPasskeyCount(user.id);
    return {
      id: user.id,
      username: user.username,
      totpEnabled: user.totpEnabled,
      passkeysCount,
      createdAt: user.createdAt.toISOString(),
    };
  }

  @Patch('me/password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Req() req: FastifyRequest & { user: { sub: string } },
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    await this.usersService.updatePassword(req.user.sub, body.currentPassword, body.newPassword);
    return { success: true };
  }

  @Get('me/settings')
  async getSettings(
    @Req() req: FastifyRequest & { user: { sub: string } },
  ): Promise<UserSettingsDto> {
    return this.usersService.getUserSettings(req.user.sub);
  }

  @Patch('me/settings')
  @HttpCode(HttpStatus.OK)
  async updateSettings(
    @Req() req: FastifyRequest & { user: { sub: string } },
    @Body() body: { dateFormat?: string; timeFormat?: string },
  ): Promise<UserSettingsDto> {
    return this.usersService.updateUserSettings(req.user.sub, body);
  }
}
