import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StatsService } from './stats.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('StatsService', () => {
  let service: StatsService;
  let prisma: Partial<PrismaService>;

  beforeEach(() => {
    prisma = {
      session: { count: vi.fn().mockResolvedValue(2) },
      bunkerConnection: {
        count: vi.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(3),
      },
      signingLog: {
        count: vi.fn().mockResolvedValueOnce(10).mockResolvedValueOnce(42),
        groupBy: vi
          .fn()
          .mockResolvedValueOnce([
            { method: 'sign_event', _count: { method: 8 } },
            { method: 'ping', _count: { method: 2 } },
          ])
          .mockResolvedValueOnce([{ eventKind: 1, _count: { eventKind: 5 } }]),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'log-1',
            method: 'sign_event',
            result: 'APPROVED',
            createdAt: new Date('2026-02-19T12:00:00Z'),
            connection: { name: 'App' },
          },
        ]),
      },
    };
    service = new StatsService(prisma as PrismaService);
  });

  describe('getDashboardStats', () => {
    it('should return dashboard stats with correct shape', async () => {
      const result = await service.getDashboardStats('user-1');
      expect(result).toMatchObject({
        activeSessions: 2,
        totalConnections: 5,
        activeConnections: 3,
        signingActions24h: 10,
        signingActions7d: 42,
        signingByMethod: { sign_event: 8, ping: 2 },
        signingByKind: { '1': 5 },
      });
      expect(result.recentActivity).toHaveLength(1);
      expect(result.recentActivity?.[0]).toMatchObject({
        id: 'log-1',
        method: 'sign_event',
        connectionName: 'App',
        result: 'APPROVED',
      });
      expect(result.recentActivity?.[0]?.timestamp).toBeDefined();
    });

    it('should call prisma with userId and time bounds', async () => {
      await service.getDashboardStats('user-99');
      expect(prisma.session?.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'user-99' }) }),
      );
      expect(prisma.bunkerConnection?.count).toHaveBeenCalledTimes(2);
      expect(prisma.signingLog?.count).toHaveBeenCalledTimes(2);
      expect(prisma.signingLog?.groupBy).toHaveBeenCalledTimes(2);
      expect(prisma.signingLog?.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { connection: { userId: 'user-99' } },
          take: 10,
        }),
      );
    });
  });
});
