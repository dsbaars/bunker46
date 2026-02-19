import { atom } from 'nanostores';
import localforage from 'localforage';

const settingsStorage = localforage.createInstance({ name: 'bunker46-settings' });

interface SettingsState {
  dateFormat: string;
  timeFormat: string;
}

const DEFAULTS: SettingsState = { dateFormat: 'MM/DD/YYYY', timeFormat: '12h' };

const $settings = atom<SettingsState>({ ...DEFAULTS });

export function useSettingsStore() {
  return {
    get dateFormat() {
      return $settings.get().dateFormat;
    },
    get timeFormat() {
      return $settings.get().timeFormat;
    },

    set(patch: Partial<SettingsState>) {
      const next = { ...$settings.get(), ...patch };
      $settings.set(next);
      settingsStorage.setItem('settings', next);
    },

    async restore() {
      const saved = await settingsStorage.getItem<SettingsState>('settings');
      if (saved) $settings.set(saved);
    },

    async load(accessToken: string) {
      try {
        const res = await fetch('/api/users/me/settings', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return;
        const data: SettingsState = await res.json();
        $settings.set(data);
        settingsStorage.setItem('settings', data);
      } catch {
        // keep local cache
      }
    },

    clear() {
      $settings.set({ ...DEFAULTS });
      settingsStorage.removeItem('settings');
    },
  };
}

export { $settings };
