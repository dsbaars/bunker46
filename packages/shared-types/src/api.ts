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
  activityBuckets: Array<{ label: string; count: number }>;
  chartRange: '1h' | '24h' | '7d';
  /** Distinct connection names the user has, for filter dropdowns. */
  connectionNames: string[];
  /** Distinct methods seen, for filter dropdowns. */
  methods: string[];
}

export interface ActivityLogEntry {
  id: string;
  method: string;
  eventKind?: number | null;
  connectionName: string;
  result: string;
  timestamp: string;
}

export const ApiErrorSchema = z.object({
  statusCode: z.number(),
  message: z.string(),
  error: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
