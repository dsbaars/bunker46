import { z } from 'zod';

export const Nip46Method = z.enum([
  'connect',
  'sign_event',
  'ping',
  'get_public_key',
  'nip04_encrypt',
  'nip04_decrypt',
  'nip44_encrypt',
  'nip44_decrypt',
  'switch_relays',
]);
export type Nip46Method = z.infer<typeof Nip46Method>;

export const Nip46RequestSchema = z.object({
  id: z.string(),
  method: Nip46Method,
  params: z.array(z.string()),
});
export type Nip46Request = z.infer<typeof Nip46RequestSchema>;

export const Nip46ResponseSchema = z.object({
  id: z.string(),
  result: z.string().optional(),
  error: z.string().optional(),
});
export type Nip46Response = z.infer<typeof Nip46ResponseSchema>;

export const BunkerPointerSchema = z.object({
  pubkey: z.string().regex(/^[0-9a-f]{64}$/),
  relays: z.array(z.string().url()),
  secret: z.string().optional(),
});
export type BunkerPointer = z.infer<typeof BunkerPointerSchema>;

export const NostrConnectParamsSchema = z.object({
  clientPubkey: z.string().regex(/^[0-9a-f]{64}$/),
  relays: z.array(z.string().url()),
  secret: z.string(),
  perms: z.string().optional(),
  name: z.string().optional(),
  url: z.string().url().optional(),
  image: z.string().url().optional(),
});
export type NostrConnectParams = z.infer<typeof NostrConnectParamsSchema>;

export const ConnectionStatus = z.enum(['active', 'pending', 'revoked', 'expired']);
export type ConnectionStatus = z.infer<typeof ConnectionStatus>;

export interface BunkerConnectionDto {
  id: string;
  name: string;
  logoUrl?: string;
  clientPubkey: string;
  bunkerPubkey: string;
  userPubkey: string;
  status: ConnectionStatus;
  relays: string[];
  permissionsSummary: string[];
  loggingEnabled: boolean;
  lastActivity?: string;
  createdAt: string;
}

export interface SigningLogEntryDto {
  id: string;
  connectionId: string;
  connectionName: string;
  method: Nip46Method;
  eventKind?: number;
  result: 'approved' | 'denied' | 'error';
  durationMs: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
}
