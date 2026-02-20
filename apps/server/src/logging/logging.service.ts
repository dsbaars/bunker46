import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { LogResult } from '@/generated/prisma/client.js';
import type { Prisma } from '@/generated/prisma/client.js';

interface LogEntry {
  connectionId: string;
  method: string;
  eventKind?: number;
  result: 'APPROVED' | 'DENIED' | 'ERROR';
  durationMs: number;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class LoggingService {
  private readonly logger = new Logger(LoggingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logSigningAction(entry: LogEntry) {
    try {
      await this.prisma.signingLog.create({
        data: {
          connectionId: entry.connectionId,
          method: entry.method,
          eventKind: entry.eventKind,
          result: entry.result as LogResult,
          durationMs: entry.durationMs,
          errorMessage: entry.errorMessage,
          metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to log signing action: ${err}`);
    }
  }

  async getLogsForConnection(connectionId: string, userId: string, page = 1, limit = 20) {
    const connection = await this.prisma.bunkerConnection.findUnique({
      where: { id: connectionId },
      select: { userId: true },
    });
    if (!connection || connection.userId !== userId) {
      throw new NotFoundException('Connection not found');
    }

    const [data, total] = await Promise.all([
      this.prisma.signingLog.findMany({
        where: { connectionId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.signingLog.count({ where: { connectionId } }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
