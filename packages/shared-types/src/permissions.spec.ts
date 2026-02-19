import { describe, it, expect } from 'vitest';
import {
  parsePermissionString,
  formatPermission,
  parsePermissionList,
  checkPermission,
} from './permissions';

describe('permissions', () => {
  it('should parse a simple permission string', () => {
    const perm = parsePermissionString('sign_event');
    expect(perm.method).toBe('sign_event');
    expect(perm.kind).toBeUndefined();
  });

  it('should parse a permission with kind', () => {
    const perm = parsePermissionString('sign_event:1');
    expect(perm.method).toBe('sign_event');
    expect(perm.kind).toBe(1);
  });

  it('should format permission without kind', () => {
    expect(formatPermission({ method: 'nip44_encrypt' })).toBe('nip44_encrypt');
  });

  it('should format permission with kind', () => {
    expect(formatPermission({ method: 'sign_event', kind: 13 })).toBe('sign_event:13');
  });

  it('should parse a permission list', () => {
    const perms = parsePermissionList('nip44_encrypt,sign_event:4,ping');
    expect(perms).toHaveLength(3);
    expect(perms[1]?.method).toBe('sign_event');
    expect(perms[1]?.kind).toBe(4);
  });

  it('should check wildcard permission (no kind restriction)', () => {
    const granted = [{ method: 'sign_event' as const }];
    expect(checkPermission(granted, { method: 'sign_event', kind: 1 })).toBe(true);
    expect(checkPermission(granted, { method: 'sign_event', kind: 42 })).toBe(true);
  });

  it('should reject ungranted permissions', () => {
    const granted = [{ method: 'sign_event' as const, kind: 1 }];
    expect(checkPermission(granted, { method: 'sign_event', kind: 2 })).toBe(false);
  });
});
