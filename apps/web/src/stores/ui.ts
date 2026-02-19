import { atom } from 'nanostores';
import localforage from 'localforage';

const uiStorage = localforage.createInstance({ name: 'bunker46-ui' });

interface UiState {
  sidebarCollapsed: boolean;
  theme: 'dark' | 'light';
  defaultKeyId: string | null;
}

const $ui = atom<UiState>({ sidebarCollapsed: false, theme: 'dark', defaultKeyId: null });

export function useUiStore() {
  return {
    get sidebarCollapsed() {
      return $ui.get().sidebarCollapsed;
    },
    get theme() {
      return $ui.get().theme;
    },

    toggleSidebar() {
      const next = { ...$ui.get(), sidebarCollapsed: !$ui.get().sidebarCollapsed };
      $ui.set(next);
      uiStorage.setItem('ui', next);
    },

    setTheme(theme: 'dark' | 'light') {
      const next = { ...$ui.get(), theme };
      $ui.set(next);
      uiStorage.setItem('ui', next);
      document.documentElement.classList.toggle('dark', theme === 'dark');
    },

    setDefaultKey(id: string | null) {
      const next = { ...$ui.get(), defaultKeyId: id };
      $ui.set(next);
      uiStorage.setItem('ui', next);
    },

    get defaultKeyId() {
      return $ui.get().defaultKeyId;
    },

    async restore() {
      const saved = await uiStorage.getItem<UiState>('ui');
      if (saved) {
        $ui.set(saved);
        document.documentElement.classList.toggle('dark', saved.theme === 'dark');
      }
    },
  };
}

export { $ui };
