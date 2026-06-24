import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAuthStore, $auth } from './auth';

describe('AuthStore', () => {
  beforeEach(() => {
    $auth.set({ accessToken: null, user: null, requiresTotp: false });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should start unauthenticated', () => {
    const store = useAuthStore();
    expect(store.isAuthenticated).toBe(false);
    expect(store.accessToken).toBeNull();
  });

  it('should set the access token and become authenticated', () => {
    const store = useAuthStore();
    store.setTokens('test-access');
    expect(store.isAuthenticated).toBe(true);
    expect(store.accessToken).toBe('test-access');
  });

  it('should handle TOTP requirement', () => {
    const store = useAuthStore();
    store.setRequiresTotp('partial-token');
    expect(store.requiresTotp).toBe(true);
    expect(store.isAuthenticated).toBe(false);
  });

  it('should clear state on logout and call the server to clear the cookie', async () => {
    const store = useAuthStore();
    store.setTokens('test');
    await store.logout();
    expect(store.isAuthenticated).toBe(false);
    expect(store.accessToken).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('restore() recovers a session from the refresh cookie', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        // POST /api/auth/refresh -> access token
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ accessToken: 'fresh' }) })
        // GET /api/users/me -> profile
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'u1', username: 'bob' }),
        }),
    );
    const store = useAuthStore();
    await store.restore();
    expect(store.accessToken).toBe('fresh');
    expect(store.isAuthenticated).toBe(true);
  });

  it('restore() stays logged out when there is no valid refresh cookie', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    const store = useAuthStore();
    await store.restore();
    expect(store.isAuthenticated).toBe(false);
    expect(store.accessToken).toBeNull();
  });
});
