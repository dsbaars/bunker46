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
        findMany: vi.fn().mockResolvedValue([{ name: 'App' }, { name: 'Other' }]),
      },
      signingLog: {
        count: vi.fn().mockResolvedValueOnce(10).mockResolvedValueOnce(42),
        groupBy: vi
          .fn()
          .mockResolvedValueOnce([
            { method: 'sign_event', _count: { method: 8 } },
            { method: 'ping', _count: { method: 2 } },
          ])
          .mockResolvedValueOnce([{ eventKind: 1, _count: { eventKind: 5 } }])
          .mockResolvedValueOnce([{ method: 'sign_event' }, { method: 'ping' }]),
        findMany: vi.fn(),
      },
      $queryRaw: vi.fn().mockResolvedValue([
        { ts: new Date('2026-02-17'), count: BigInt(5) },
        { ts: new Date('2026-02-18'), count: BigInt(12) },
        { ts: new Date('2026-02-19'), count: BigInt(25) },
      ]),
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
        chartRange: '7d',
        connectionNames: ['App', 'Other'],
        methods: ['ping', 'sign_event'],
      });
      expect(result.activityBuckets).toHaveLength(7);
      expect(
        result.activityBuckets?.every(
          (b) => typeof b.label === 'string' && typeof b.count === 'number',
        ),
      ).toBe(true);
    });

    it('should call prisma with userId and time bounds', async () => {
      await service.getDashboardStats('user-99');
      expect(prisma.session?.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'user-99' }) }),
      );
      expect(prisma.bunkerConnection?.count).toHaveBeenCalledTimes(2);
      expect(prisma.bunkerConnection?.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-99' },
        select: { name: true },
        orderBy: { name: 'asc' },
      });
      expect(prisma.signingLog?.count).toHaveBeenCalledTimes(2);
      expect(prisma.signingLog?.groupBy).toHaveBeenCalledTimes(3);
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });
  });
});
