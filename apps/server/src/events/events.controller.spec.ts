import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { EventsController } from './events.controller.js';
import type { EventsService } from './events.service.js';
import type { JwtService } from '@nestjs/jwt';

describe('EventsController.stream — TOTP enforcement', () => {
  let controller: EventsController;
  let eventsService: {
    isAvailable: ReturnType<typeof vi.fn>;
    subscribeUserActivity: ReturnType<typeof vi.fn>;
  };
  let jwtService: { verifyAsync: ReturnType<typeof vi.fn> };

  const req = { headers: {}, raw: { on: vi.fn() } } as unknown as FastifyRequest;
  const makeReply = () =>
    ({ status: vi.fn().mockReturnThis(), send: vi.fn() }) as unknown as FastifyReply;

  beforeEach(() => {
    eventsService = { isAvailable: vi.fn().mockReturnValue(false), subscribeUserActivity: vi.fn() };
    jwtService = { verifyAsync: vi.fn() };
    controller = new EventsController(
      eventsService as unknown as EventsService,
      jwtService as unknown as JwtService,
    );
  });

  it('rejects a pre-TOTP partial token', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 'u1', totpEnabled: true, totpVerified: false });
    await expect(controller.stream('partial-token', req, makeReply())).rejects.toThrow(
      UnauthorizedException,
    );
    expect(eventsService.isAvailable).not.toHaveBeenCalled();
  });

  it('allows a fully verified token (proceeds past the TOTP check)', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 'u1', totpEnabled: true, totpVerified: true });
    const reply = makeReply();
    await controller.stream('full-token', req, reply);
    // Redis disabled in this test → it gets past the TOTP gate and returns the 503 notice.
    expect(eventsService.isAvailable).toHaveBeenCalled();
    expect(reply.status).toHaveBeenCalledWith(503);
  });

  it('allows an account without TOTP enabled', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 'u1', totpEnabled: false, totpVerified: true });
    const reply = makeReply();
    await controller.stream('full-token', req, reply);
    expect(reply.status).toHaveBeenCalledWith(503);
  });
});
