import { z } from 'zod';

export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export type Pagination = z.infer<typeof PaginationSchema>;

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DashboardStatsDto {
  activeSessions: number;
  totalConnections: number;
  activeConnections: number;
  signingActions24h: number;
  signingActions7d: number;
  signingByMethod: Record<string, number>;
  signingByKind: Record<string, number>;
  recentActivity: Array<{
    id: string;
    method: string;
    connectionName: string;
    result: string;
    timestamp: string;
  }>;
}

export const ApiErrorSchema = z.object({
  statusCode: z.number(),
  message: z.string(),
  error: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
