import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LoggingService } from './logging.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('LoggingService', () => {
  let service: LoggingService;
  let prisma: Partial<PrismaService>;

  beforeEach(() => {
    prisma = {
      bunkerConnection: {
        findUnique: vi.fn().mockResolvedValue({ userId: 'user-1' }),
      },
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
        userId: 'user-1',
        connectionName: 'My App',
        clientPubkey: 'a'.repeat(64),
        method: 'sign_event',
        result: 'APPROVED',
        durationMs: 100,
      });
      expect(prisma.signingLog?.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          connectionId: 'conn-1',
          userId: 'user-1',
          connectionName: 'My App',
          clientPubkey: 'a'.repeat(64),
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
        userId: 'user-1',
        connectionName: 'My App',
        clientPubkey: 'a'.repeat(64),
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

  describe('getDashboardActivity', () => {
    it('scopes by denormalized userId (not the connection relation) so deleted-connection logs survive', async () => {
      vi.mocked(prisma.signingLog!.findMany!).mockResolvedValue([
        {
          id: 'log-1',
          connectionId: null, // connection was deleted; FK is SET NULL
          connectionName: 'Deleted App',
          method: 'sign_event',
          eventKind: 1,
          result: 'APPROVED',
          createdAt: new Date('2026-01-01T00:00:00Z'),
        } as never,
      ]);
      vi.mocked(prisma.signingLog!.count!).mockResolvedValue(1);

      const result = await service.getDashboardActivity('user-1');

      // Must filter on the denormalized userId, never via `connection: { userId }`,
      // otherwise orphaned (connectionId=null) logs drop out of the feed.
      const findManyArgs = vi.mocked(prisma.signingLog!.findMany!).mock.calls[0]![0]!;
      expect(findManyArgs.where).toEqual({ userId: 'user-1' });
      expect(findManyArgs.where).not.toHaveProperty('connection');
      // No relation include anymore — the name comes from the denormalized column.
      expect(findManyArgs).not.toHaveProperty('include');

      expect(result.data[0]).toMatchObject({
        id: 'log-1',
        connectionName: 'Deleted App',
        method: 'sign_event',
      });
      expect(result.total).toBe(1);
    });

    it('applies connectionName and method filters against denormalized columns', async () => {
      vi.mocked(prisma.signingLog!.findMany!).mockResolvedValue([]);
      vi.mocked(prisma.signingLog!.count!).mockResolvedValue(0);

      await service.getDashboardActivity('user-1', 1, 15, 'My App', 'sign_event');

      const findManyArgs = vi.mocked(prisma.signingLog!.findMany!).mock.calls[0]![0]!;
      expect(findManyArgs.where).toEqual({
        userId: 'user-1',
        connectionName: 'My App',
        method: 'sign_event',
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
      const result = await service.getLogsForConnection('conn-1', 'user-1', 2, 10);
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
      await service.getLogsForConnection('conn-1', 'user-1');
      expect(prisma.signingLog?.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });

    it('should throw NotFoundException when connection does not exist or belongs to another user', async () => {
      vi.mocked(prisma.bunkerConnection!.findUnique!).mockResolvedValue(null);
      await expect(service.getLogsForConnection('conn-1', 'user-1')).rejects.toThrow(
        'Connection not found',
      );

      vi.mocked(prisma.bunkerConnection!.findUnique!).mockResolvedValue({
        userId: 'other-user',
      } as never);
      await expect(service.getLogsForConnection('conn-1', 'user-1')).rejects.toThrow(
        'Connection not found',
      );
    });
  });
});
