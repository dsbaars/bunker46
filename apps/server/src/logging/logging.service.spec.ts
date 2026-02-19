import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LoggingService } from './logging.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('LoggingService', () => {
  let service: LoggingService;
  let prisma: Partial<PrismaService>;

  beforeEach(() => {
    prisma = {
      signingLog: {
        create: vi.fn().mockResolvedValue({ id: 'log-1' }),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    service = new LoggingService(prisma as PrismaService);
  });

  describe('logSigningAction', () => {
    it('should create signing log entry', async () => {
      await service.logSigningAction({
        connectionId: 'conn-1',
        method: 'sign_event',
        result: 'APPROVED',
        durationMs: 100,
      });
      expect(prisma.signingLog?.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          connectionId: 'conn-1',
          method: 'sign_event',
          result: 'APPROVED',
          durationMs: 100,
          eventKind: undefined,
          errorMessage: undefined,
        }),
      });
    });

    it('should include eventKind and metadata when provided', async () => {
      await service.logSigningAction({
        connectionId: 'conn-1',
        method: 'sign_event',
        eventKind: 1,
        result: 'DENIED',
        durationMs: 50,
        metadata: { reason: 'user_denied' },
      });
      expect(prisma.signingLog?.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventKind: 1,
          metadata: { reason: 'user_denied' },
        }),
      });
    });
  });

  describe('getLogsForConnection', () => {
    it('should return paginated logs with total', async () => {
      vi.mocked(prisma.signingLog!.findMany!).mockResolvedValue([
        {
          id: 'log-1',
          connectionId: 'conn-1',
          method: 'sign_event',
          result: 'APPROVED',
          createdAt: new Date(),
        } as never,
      ]);
      vi.mocked(prisma.signingLog!.count!).mockResolvedValue(25);
      const result = await service.getLogsForConnection('conn-1', 2, 10);
      expect(result).toEqual({
        data: expect.any(Array),
        total: 25,
        page: 2,
        limit: 10,
        totalPages: 3,
      });
      expect(prisma.signingLog?.findMany).toHaveBeenCalledWith({
        where: { connectionId: 'conn-1' },
        orderBy: { createdAt: 'desc' },
        skip: 10,
        take: 10,
      });
    });

    it('should use default page and limit', async () => {
      await service.getLogsForConnection('conn-1');
      expect(prisma.signingLog?.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });
  });
});
