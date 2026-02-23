import { Controller, Get, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { TotpVerifiedGuard } from '../auth/guards/totp-verified.guard.js';
import { LoggingService } from './logging.service.js';
import { StatsService } from './stats.service.js';
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
    @Req() req: AuthReq,
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.loggingService.getLogsForConnection(
      id,
      req.user.sub,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('dashboard/stats')
  async getDashboardStats(
    @Req() req: AuthReq,
    @Query('range') range?: string,
    @Query('tz') tz?: string,
  ) {
    const validRange = (['1h', '24h', '7d'] as const).find((r) => r === range) ?? '7d';
    return this.statsService.getDashboardStats(req.user.sub, validRange, tz);
  }

  @Get('dashboard/activity')
  async getDashboardActivity(
    @Req() req: AuthReq,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('connection') connection?: string,
    @Query('method') method?: string,
  ) {
    return this.loggingService.getDashboardActivity(
      req.user.sub,
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10) || 15, 100) : 15,
      connection || undefined,
      method || undefined,
    );
  }
}
