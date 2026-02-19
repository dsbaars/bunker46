import { Injectable } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { DashboardStatsDto } from '@bunker46/shared-types';

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardStats(userId: string): Promise<DashboardStatsDto> {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      activeSessions,
      totalConnections,
      activeConnections,
      signingActions24h,
      signingActions7d,
      methodCounts,
      kindCounts,
      recentLogs,
    ] = await Promise.all([
      this.prisma.session.count({ where: { userId, expiresAt: { gt: now } } }),
      this.prisma.bunkerConnection.count({ where: { userId } }),
      this.prisma.bunkerConnection.count({ where: { userId, status: 'ACTIVE' } }),
      this.prisma.signingLog.count({
        where: {
          connection: { userId },
          createdAt: { gte: twentyFourHoursAgo },
        },
      }),
      this.prisma.signingLog.count({
        where: {
          connection: { userId },
          createdAt: { gte: sevenDaysAgo },
        },
      }),
      this.prisma.signingLog.groupBy({
        by: ['method'],
        where: { connection: { userId }, createdAt: { gte: sevenDaysAgo } },
        _count: { method: true },
      }),
      this.prisma.signingLog.groupBy({
        by: ['eventKind'],
        where: {
          connection: { userId },
          createdAt: { gte: sevenDaysAgo },
          eventKind: { not: null },
        },
        _count: { eventKind: true },
      }),
      this.prisma.signingLog.findMany({
        where: { connection: { userId } },
        include: { connection: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const signingByMethod: Record<string, number> = {};
    for (const mc of methodCounts) {
      signingByMethod[mc.method] = mc._count.method;
    }

    const signingByKind: Record<string, number> = {};
    for (const kc of kindCounts) {
      if (kc.eventKind != null) {
        signingByKind[String(kc.eventKind)] = kc._count.eventKind!;
      }
    }

    return {
      activeSessions,
      totalConnections,
      activeConnections,
      signingActions24h,
      signingActions7d,
      signingByMethod,
      signingByKind,
      recentActivity: recentLogs.map((log) => ({
        id: log.id,
        method: log.method,
        connectionName: log.connection.name,
        result: log.result,
        timestamp: log.createdAt.toISOString(),
      })),
    };
  }
}
