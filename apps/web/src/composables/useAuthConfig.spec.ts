import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('useAuthConfig', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  it('fetches /api/auth/config and sets config when response is ok', async () => {
    const data = { registrationEnabled: false };
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(data) });
    const { useAuthConfig } = await import('./useAuthConfig.js');
    const { config, load } = useAuthConfig();
    expect(config.value).toBeNull();
    await load();
    expect(mockFetch).toHaveBeenCalledWith('/api/auth/config');
    expect(config.value).toEqual(data);
  });

  it('sets registrationEnabled: true when response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const { useAuthConfig } = await import('./useAuthConfig.js');
    const { config, load } = useAuthConfig();
    await load();
    expect(config.value).toEqual({ registrationEnabled: true });
  });

  it('sets registrationEnabled: true when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const { useAuthConfig } = await import('./useAuthConfig.js');
    const { config, load } = useAuthConfig();
    await load();
    expect(config.value).toEqual({ registrationEnabled: true });
  });

  it('uses cached config on second load', async () => {
    const data = { registrationEnabled: true };
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(data) });
    const { useAuthConfig } = await import('./useAuthConfig.js');
    const { config, load } = useAuthConfig();
    await load();
    await load();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(config.value).toEqual(data);
  });
});
