import { Controller, Get, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { EventsService } from './events.service.js';

@Controller('api/events')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly jwtService: JwtService,
  ) {}

  @Get('stream')
  async stream(
    @Query('access_token') accessToken: string | undefined,
    @Req() req: FastifyRequest,
    @Res({ passthrough: false }) reply: FastifyReply,
  ): Promise<void> {
    const token = accessToken ?? req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) {
      throw new UnauthorizedException('Missing access token');
    }
    let payload: { sub: string; totpEnabled?: boolean; totpVerified?: boolean };
    try {
      payload = (await this.jwtService.verifyAsync(token)) as {
        sub: string;
        totpEnabled?: boolean;
        totpVerified?: boolean;
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    // Reject pre-TOTP partial tokens, mirroring TotpVerifiedGuard on the rest of the API.
    if (payload.totpEnabled === true && payload.totpVerified === false) {
      throw new UnauthorizedException('TOTP verification required');
    }
    const userId = payload.sub;
    if (!this.eventsService.isAvailable()) {
      reply.status(503).send({
        message: 'Real-time updates disabled (Redis not configured). Poll the API for updates.',
      });
      return;
    }
    const unsubscribe = this.eventsService.subscribeUserActivity(userId, () => {
      try {
        (reply.raw as NodeJS.WritableStream).write('data: activity\n\n');
      } catch {
        // client may have disconnected
      }
    });
    if (!unsubscribe) {
      reply.status(503).send({ message: 'Events service unavailable' });
      return;
    }
    req.raw.on('close', () => {
      unsubscribe();
    });
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    (reply.raw as NodeJS.WritableStream).write('data: connected\n\n');
  }
}
