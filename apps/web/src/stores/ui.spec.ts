import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useUiStore, $ui } from './ui';

const uiStorage = vi.hoisted(() => ({
  setItem: vi.fn(),
  getItem: vi.fn(),
}));

vi.mock('localforage', () => ({
  default: {
    createInstance: (opts: { name?: string }) =>
      opts?.name === 'bunker46-ui' ? uiStorage : { setItem: vi.fn(), getItem: vi.fn() },
  },
}));

describe('UiStore', () => {
  beforeEach(() => {
    vi.mocked(uiStorage.setItem).mockClear();
    vi.mocked(uiStorage.getItem).mockClear();
    $ui.set({ sidebarCollapsed: false, theme: 'dark', defaultKeyId: null });
  });

  it('should return initial state', () => {
    const store = useUiStore();
    expect(store.sidebarCollapsed).toBe(false);
    expect(store.theme).toBe('dark');
    expect(store.defaultKeyId).toBeNull();
  });

  it('should toggle sidebar and persist', () => {
    const store = useUiStore();
    store.toggleSidebar();
    expect(store.sidebarCollapsed).toBe(true);
    expect(uiStorage.setItem).toHaveBeenCalledWith(
      'ui',
      expect.objectContaining({ sidebarCollapsed: true }),
    );
    store.toggleSidebar();
    expect(store.sidebarCollapsed).toBe(false);
  });

  it('should set theme and persist', () => {
    const store = useUiStore();
    const classList = document.documentElement.classList;
    store.setTheme('light');
    expect(store.theme).toBe('light');
    expect(classList.contains('dark')).toBe(false);
    expect(uiStorage.setItem).toHaveBeenCalledWith(
      'ui',
      expect.objectContaining({ theme: 'light' }),
    );
  });

  it('should set defaultKeyId and persist', () => {
    const store = useUiStore();
    store.setDefaultKey('key-1');
    expect(store.defaultKeyId).toBe('key-1');
    expect(uiStorage.setItem).toHaveBeenCalledWith(
      'ui',
      expect.objectContaining({ defaultKeyId: 'key-1' }),
    );
    store.setDefaultKey(null);
    expect(store.defaultKeyId).toBeNull();
  });

  it('should restore from storage', async () => {
    vi.mocked(uiStorage.getItem).mockResolvedValue({
      sidebarCollapsed: true,
      theme: 'light',
      defaultKeyId: 'k1',
    });
    const store = useUiStore();
    await store.restore();
    expect(store.sidebarCollapsed).toBe(true);
    expect(store.theme).toBe('light');
    expect(store.defaultKeyId).toBe('k1');
  });
});
