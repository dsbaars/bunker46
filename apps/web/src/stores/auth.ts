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

type ProfileOk = { profile: UserProfileDto };
type ProfileUnauthorized = { unauthorized: true };
type ProfileResult = ProfileOk | ProfileUnauthorized | null;

function isProfileOk(r: ProfileResult): r is ProfileOk {
  return r !== null && 'profile' in r;
}
function isProfileUnauthorized(r: ProfileResult): r is ProfileUnauthorized {
  return r !== null && 'unauthorized' in r;
}

async function fetchProfile(accessToken: string): Promise<ProfileResult> {
  try {
    const res = await fetch('/api/users/me', {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    });
    if (res.status === 401) return { unauthorized: true };
    if (!res.ok) return null;
    const profile = (await res.json()) as UserProfileDto;
    return { profile };
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

    /** Call when we have a token but no user (e.g. after transient restore failure). */
    async refetchProfileIfMissing() {
      const { accessToken, user } = $auth.get();
      if (!accessToken || user) return;
      const result = await fetchProfile(accessToken);
      if (isProfileOk(result)) {
        $auth.set({ ...$auth.get(), user: result.profile });
      } else if (isProfileUnauthorized(result)) {
        $auth.set({ accessToken: null, refreshToken: null, user: null, requiresTotp: false });
        await authStorage.removeItem('tokens');
      }
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

      let result = await fetchProfile(tokens.accessToken);

      if (isProfileOk(result)) {
        $auth.set({ ...$auth.get(), user: result.profile });
        return;
      }
      if (isProfileUnauthorized(result) && tokens.refreshToken) {
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
          result = await fetchProfile(refreshed.accessToken);
          if (isProfileOk(result)) {
            $auth.set({ ...$auth.get(), user: result.profile });
            return;
          }
        }
      }
      // 401 and refresh failed or no refresh: clear tokens so user gets login, not dashboard with no data
      if (isProfileUnauthorized(result)) {
        $auth.set({ accessToken: null, refreshToken: null, user: null, requiresTotp: false });
        await authStorage.removeItem('tokens');
      }
      // result === null: network error; keep tokens so guard still redirects, profile may load later
    },
  };
}

export { $auth };
