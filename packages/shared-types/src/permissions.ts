import { z } from 'zod';
import { Nip46Method } from './nip46.js';

export const PermissionDescriptorSchema = z.object({
  method: Nip46Method,
  kind: z.number().int().nonnegative().optional(),
});
export type PermissionDescriptor = z.infer<typeof PermissionDescriptorSchema>;

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
