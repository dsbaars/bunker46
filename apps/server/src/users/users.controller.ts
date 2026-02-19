import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { UsersService } from './users.service.js';
import type { UserProfileDto } from '@bunker46/shared-types';
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
    const passkeysCount = await (this.usersService as any).prisma.passkey.count({
      where: { userId: user.id },
    });
    return {
      id: user.id,
      username: user.username,
      email: user.email ?? undefined,
      totpEnabled: user.totpEnabled,
      passkeysCount,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
