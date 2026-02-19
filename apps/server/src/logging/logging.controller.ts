import { Controller, Get, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { TotpVerifiedGuard } from '../auth/guards/totp-verified.guard.js';
import type { LoggingService } from './logging.service.js';
import type { StatsService } from './stats.service.js';
import type { FastifyRequest } from 'fastify';

type AuthReq = FastifyRequest & { user: { sub: string } };

@ApiTags('logging')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TotpVerifiedGuard)
@Controller('api')
export class LoggingController {
  constructor(
    private readonly loggingService: LoggingService,
    private readonly statsService: StatsService,
  ) {}

  @Get('connections/:id/logs')
  async getConnectionLogs(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.loggingService.getLogsForConnection(
      id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('dashboard/stats')
  async getDashboardStats(@Req() req: AuthReq) {
    return this.statsService.getDashboardStats(req.user.sub);
  }
}
