import { z } from 'zod';
import { Nip46Method } from './nip46.js';

export const PermissionDescriptorSchema = z.object({
  method: Nip46Method,
  kind: z.number().int().nonnegative().optional(),
});
export type PermissionDescriptor = z.infer<typeof PermissionDescriptorSchema>;

/**
 * Conservative default permissions seeded on a newly created connection when neither the client
 * (via the connect request) nor the operator (via the dashboard) supplies an explicit set.
 *
 * Bounded to common signing kinds (profile, note, contacts, DM, reaction). It deliberately grants
 * NO nip04/nip44 decrypt (nor encrypt), so a fresh connection can never act as a blanket decryption
 * oracle on the user's key. The RPC handler is default-deny, so a connection with zero permissions
 * can perform no signing/encryption until these — or explicit permissions — are granted.
 */
export const DEFAULT_CONNECTION_PERMISSIONS: readonly PermissionDescriptor[] = [
  { method: 'sign_event', kind: 0 }, // profile metadata
  { method: 'sign_event', kind: 1 }, // short text note
  { method: 'sign_event', kind: 3 }, // contacts / follow list
  { method: 'sign_event', kind: 4 }, // encrypted direct message
  { method: 'sign_event', kind: 7 }, // reaction
];

export function parsePermissionString(perm: string): PermissionDescriptor {
  const [method, kindStr] = perm.split(':');
  const parsed = Nip46Method.parse(method);
  return {
    method: parsed,
    kind: kindStr ? parseInt(kindStr, 10) : undefined,
  };
}

export function formatPermission(perm: PermissionDescriptor): string {
  return perm.kind !== undefined ? `${perm.method}:${perm.kind}` : perm.method;
}

export function parsePermissionList(perms: string): PermissionDescriptor[] {
  const results: PermissionDescriptor[] = [];
  for (const s of perms.split(',')) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    try {
      results.push(parsePermissionString(trimmed));
    } catch {
      // skip unknown methods
    }
  }
  return results;
}

export function checkPermission(
  granted: PermissionDescriptor[],
  required: PermissionDescriptor,
): boolean {
  return granted.some(
    (g) => g.method === required.method && (g.kind === undefined || g.kind === required.kind),
  );
}
