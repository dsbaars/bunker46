import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { DashboardStatsDto } from '@bunker46/shared-types';

type ChartRange = '1h' | '24h' | '7d';

const FIVE_MIN_MS = 5 * 60 * 1000;

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardStats(userId: string, range: ChartRange = '7d'): Promise<DashboardStatsDto> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const rangeStart =
      range === '1h' ? oneHourAgo : range === '24h' ? twentyFourHoursAgo : sevenDaysAgo;

    const [
      activeSessions,
      totalConnections,
      activeConnections,
      signingActions24h,
      signingActions7d,
      methodCounts,
      kindCounts,
      connectionNames,
      distinctMethods,
    ] = await Promise.all([
      this.prisma.session.count({ where: { userId, expiresAt: { gt: now } } }),
      this.prisma.bunkerConnection.count({ where: { userId } }),
      this.prisma.bunkerConnection.count({ where: { userId, status: 'ACTIVE' } }),
      this.prisma.signingLog.count({
        where: { connection: { userId }, createdAt: { gte: twentyFourHoursAgo } },
      }),
      this.prisma.signingLog.count({
        where: { connection: { userId }, createdAt: { gte: sevenDaysAgo } },
      }),
      this.prisma.signingLog.groupBy({
        by: ['method'],
        where: { connection: { userId }, createdAt: { gte: rangeStart } },
        _count: { method: true },
      }),
      this.prisma.signingLog.groupBy({
        by: ['eventKind'],
        where: {
          connection: { userId },
          createdAt: { gte: rangeStart },
          eventKind: { not: null },
        },
        _count: { eventKind: true },
      }),
      this.prisma.bunkerConnection
        .findMany({ where: { userId }, select: { name: true }, orderBy: { name: 'asc' } })
        .then((rows) => rows.map((r) => r.name)),
      this.prisma.signingLog
        .groupBy({ by: ['method'], where: { connection: { userId } } })
        .then((rows) => rows.map((r) => r.method).sort()),
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

    const activityBuckets = await this.buildActivityBuckets(userId, range, now, rangeStart);

    return {
      activeSessions,
      totalConnections,
      activeConnections,
      signingActions24h,
      signingActions7d,
      signingByMethod,
      signingByKind,
      activityBuckets,
      chartRange: range,
      connectionNames,
      methods: distinctMethods,
    };
  }

  private async buildActivityBuckets(
    userId: string,
    range: ChartRange,
    now: Date,
    rangeStart: Date,
  ): Promise<Array<{ label: string; count: number }>> {
    if (range === '7d') {
      const rows = await this.prisma.$queryRaw<Array<{ ts: Date; count: bigint }>>`
        SELECT DATE(sl.created_at) AS ts, COUNT(*) AS count
        FROM signing_logs sl
        JOIN bunker_connections bc ON sl.connection_id = bc.id
        WHERE bc.user_id = ${userId}
          AND sl.created_at >= ${rangeStart}
        GROUP BY DATE(sl.created_at)
        ORDER BY ts ASC
      `;
      const map = new Map<string, number>();
      for (const r of rows) {
        const key =
          r.ts instanceof Date ? r.ts.toISOString().split('T')[0]! : String(r.ts).split('T')[0]!;
        map.set(key, Number(r.count));
      }
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now);
        d.setUTCDate(d.getUTCDate() - (6 - i));
        const date = d.toISOString().split('T')[0]!;
        const label = new Date(date + 'T12:00:00Z').toLocaleDateString('en', {
          weekday: 'short',
          timeZone: 'UTC',
        });
        return { label, count: map.get(date) ?? 0 };
      });
    }

    if (range === '24h') {
      const rows = await this.prisma.$queryRaw<Array<{ ts: Date; count: bigint }>>`
        SELECT DATE_TRUNC('hour', sl.created_at) AS ts, COUNT(*) AS count
        FROM signing_logs sl
        JOIN bunker_connections bc ON sl.connection_id = bc.id
        WHERE bc.user_id = ${userId}
          AND sl.created_at >= ${rangeStart}
        GROUP BY DATE_TRUNC('hour', sl.created_at)
        ORDER BY ts ASC
      `;
      const map = new Map<string, number>();
      for (const r of rows) {
        const d = r.ts instanceof Date ? r.ts : new Date(String(r.ts));
        map.set(d.toISOString().substring(0, 13), Number(r.count));
      }
      // Anchor to the current full hour and walk back 23 more
      const baseHour = new Date(now);
      baseHour.setMinutes(0, 0, 0);
      return Array.from({ length: 24 }, (_, i) => {
        const d = new Date(baseHour.getTime() - (23 - i) * 60 * 60 * 1000);
        const key = d.toISOString().substring(0, 13);
        const label = d.toLocaleTimeString('en', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        return { label, count: map.get(key) ?? 0 };
      });
    }

    // 1h — 5-minute buckets (12 slots)
    const rows = await this.prisma.$queryRaw<Array<{ ts: Date; count: bigint }>>`
      SELECT
        TO_TIMESTAMP(FLOOR(EXTRACT(EPOCH FROM sl.created_at) / 300) * 300) AS ts,
        COUNT(*) AS count
      FROM signing_logs sl
      JOIN bunker_connections bc ON sl.connection_id = bc.id
      WHERE bc.user_id = ${userId}
        AND sl.created_at >= ${rangeStart}
      GROUP BY FLOOR(EXTRACT(EPOCH FROM sl.created_at) / 300)
      ORDER BY ts ASC
    `;
    const map = new Map<number, number>();
    for (const r of rows) {
      const d = r.ts instanceof Date ? r.ts : new Date(String(r.ts));
      map.set(Math.floor(d.getTime() / FIVE_MIN_MS) * FIVE_MIN_MS, Number(r.count));
    }
    const nowSlot = Math.floor(now.getTime() / FIVE_MIN_MS) * FIVE_MIN_MS;
    return Array.from({ length: 12 }, (_, i) => {
      const slotMs = nowSlot - (11 - i) * FIVE_MIN_MS;
      const d = new Date(slotMs);
      const label = d.toLocaleTimeString('en', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      return { label, count: map.get(slotMs) ?? 0 };
    });
  }
}
