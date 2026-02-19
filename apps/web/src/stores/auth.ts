import { atom } from 'nanostores';
import localforage from 'localforage';
import type { UserProfileDto } from '@bunker46/shared-types';

const authStorage = localforage.createInstance({ name: 'bunker46-auth' });

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserProfileDto | null;
  requiresTotp: boolean;
}

const $auth = atom<AuthState>({
  accessToken: null,
  refreshToken: null,
  user: null,
  requiresTotp: false,
});

async function fetchProfile(accessToken: string): Promise<UserProfileDto | null> {
  try {
    const res = await fetch('/api/users/me', {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function tryRefreshTokens(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export function useAuthStore() {
  return {
    get accessToken() {
      return $auth.get().accessToken;
    },
    get refreshToken() {
      return $auth.get().refreshToken;
    },
    get user() {
      return $auth.get().user;
    },
    get requiresTotp() {
      return $auth.get().requiresTotp;
    },
    get isAuthenticated() {
      return !!$auth.get().accessToken && !$auth.get().requiresTotp;
    },

    setTokens(accessToken: string, refreshToken?: string) {
      const rt = refreshToken ?? $auth.get().refreshToken;
      $auth.set({ ...$auth.get(), accessToken, refreshToken: rt, requiresTotp: false });
      authStorage.setItem('tokens', { accessToken, refreshToken: rt });
    },

    setRequiresTotp(partialToken: string) {
      $auth.set({ ...$auth.get(), accessToken: partialToken, requiresTotp: true });
    },

    setUser(user: UserProfileDto) {
      $auth.set({ ...$auth.get(), user });
    },

    logout() {
      $auth.set({ accessToken: null, refreshToken: null, user: null, requiresTotp: false });
      authStorage.removeItem('tokens');
    },

    async restore() {
      const tokens = await authStorage.getItem<{ accessToken: string; refreshToken: string }>(
        'tokens',
      );
      if (!tokens?.accessToken) return;

      $auth.set({
        ...$auth.get(),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });

      let profile = await fetchProfile(tokens.accessToken);

      if (!profile && tokens.refreshToken) {
        const refreshed = await tryRefreshTokens(tokens.refreshToken);
        if (refreshed) {
          $auth.set({
            ...$auth.get(),
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken,
          });
          await authStorage.setItem('tokens', {
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken,
          });
          profile = await fetchProfile(refreshed.accessToken);
        }
      }

      if (profile) {
        $auth.set({ ...$auth.get(), user: profile });
      } else {
        $auth.set({ accessToken: null, refreshToken: null, user: null, requiresTotp: false });
        await authStorage.removeItem('tokens');
      }
    },
  };
}

export { $auth };
