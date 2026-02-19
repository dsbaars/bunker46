import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore, $auth } from './auth';

describe('AuthStore', () => {
  beforeEach(() => {
    $auth.set({ accessToken: null, refreshToken: null, user: null, requiresTotp: false });
  });

  it('should start unauthenticated', () => {
    const store = useAuthStore();
    expect(store.isAuthenticated).toBe(false);
    expect(store.accessToken).toBeNull();
  });

  it('should set tokens and become authenticated', () => {
    const store = useAuthStore();
    store.setTokens('test-access', 'test-refresh');
    expect(store.isAuthenticated).toBe(true);
    expect(store.accessToken).toBe('test-access');
  });

  it('should handle TOTP requirement', () => {
    const store = useAuthStore();
    store.setRequiresTotp('partial-token');
    expect(store.requiresTotp).toBe(true);
    expect(store.isAuthenticated).toBe(false);
  });

  it('should clear state on logout', () => {
    const store = useAuthStore();
    store.setTokens('test', 'test');
    store.logout();
    expect(store.isAuthenticated).toBe(false);
    expect(store.accessToken).toBeNull();
  });
});
