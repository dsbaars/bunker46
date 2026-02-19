import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSettingsStore, $settings } from './settings';

const settingsStorage = vi.hoisted(() => ({
  setItem: vi.fn(),
  getItem: vi.fn(),
  removeItem: vi.fn(),
}));

vi.mock('localforage', () => ({
  default: {
    createInstance: (opts: { name?: string }) =>
      opts?.name === 'bunker46-settings'
        ? settingsStorage
        : { setItem: vi.fn(), getItem: vi.fn(), removeItem: vi.fn() },
  },
}));

describe('SettingsStore', () => {
  beforeEach(() => {
    vi.mocked(settingsStorage.setItem).mockClear();
    vi.mocked(settingsStorage.getItem).mockClear();
    vi.mocked(settingsStorage.removeItem).mockClear();
    $settings.set({ dateFormat: 'MM/DD/YYYY', timeFormat: '12h' });
  });

  it('should return default date and time format', () => {
    const store = useSettingsStore();
    expect(store.dateFormat).toBe('MM/DD/YYYY');
    expect(store.timeFormat).toBe('12h');
  });

  it('should set and persist patch', () => {
    const store = useSettingsStore();
    store.set({ dateFormat: 'DD/MM/YYYY', timeFormat: '24h' });
    expect(store.dateFormat).toBe('DD/MM/YYYY');
    expect(store.timeFormat).toBe('24h');
    expect(settingsStorage.setItem).toHaveBeenCalledWith('settings', {
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
    });
  });

  it('should restore from storage', async () => {
    vi.mocked(settingsStorage.getItem).mockResolvedValue({
      dateFormat: 'YYYY-MM-DD',
      timeFormat: '24h',
    });
    const store = useSettingsStore();
    await store.restore();
    expect(store.dateFormat).toBe('YYYY-MM-DD');
    expect(store.timeFormat).toBe('24h');
  });

  it('should clear state and storage', () => {
    const store = useSettingsStore();
    store.set({ dateFormat: 'DD/MM/YYYY' });
    store.clear();
    expect(store.dateFormat).toBe('MM/DD/YYYY');
    expect(store.timeFormat).toBe('12h');
    expect(settingsStorage.removeItem).toHaveBeenCalledWith('settings');
  });

  it('should load from API and persist', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ dateFormat: 'DD/MM/YYYY', timeFormat: '24h' }),
    });
    const store = useSettingsStore();
    await store.load('token');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/users/me/settings', {
      headers: { Authorization: 'Bearer token' },
    });
    expect(store.dateFormat).toBe('DD/MM/YYYY');
    expect(settingsStorage.setItem).toHaveBeenCalled();
  });

  it('should not update state when load fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });
    const store = useSettingsStore();
    $settings.set({ dateFormat: 'YYYY-MM-DD', timeFormat: '24h' });
    await store.load('token');
    expect(store.dateFormat).toBe('YYYY-MM-DD');
  });
});
