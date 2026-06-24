import { atom } from 'nanostores';
import type { UserProfileDto } from '@bunker46/shared-types';

interface AuthState {
  /** Short-lived access token, kept in memory only (never persisted). */
  accessToken: string | null;
  user: UserProfileDto | null;
  requiresTotp: boolean;
}

const $auth = atom<AuthState>({
  accessToken: null,
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
      credentials: 'include',
    });
    if (res.status === 401) return { unauthorized: true };
    if (!res.ok) return null;
    const profile = (await res.json()) as UserProfileDto;
    return { profile };
  } catch {
    return null;
  }
}

/**
 * Exchange the httpOnly refresh cookie for a fresh access token. The refresh token itself is never
 * accessible to JavaScript; the browser sends the cookie automatically with `credentials: 'include'`.
 */
async function tryRefreshTokens(): Promise<{ accessToken: string } | null> {
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return null;
    return (await res.json()) as { accessToken: string };
  } catch {
    return null;
  }
}

export function useAuthStore() {
  return {
    get accessToken() {
      return $auth.get().accessToken;
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

    setTokens(accessToken: string) {
      $auth.set({ ...$auth.get(), accessToken, requiresTotp: false });
    },

    setRequiresTotp(partialToken: string) {
      $auth.set({ ...$auth.get(), accessToken: partialToken, requiresTotp: true });
    },

    setUser(user: UserProfileDto) {
      $auth.set({ ...$auth.get(), user });
    },

    async logout() {
      // Clear local state immediately so the UI logs out at once; the server call clears the
      // httpOnly refresh cookie and revokes the session.
      $auth.set({ accessToken: null, user: null, requiresTotp: false });
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      } catch {
        // ignore network errors on logout
      }
    },

    /** Call when we have a token but no user (e.g. after transient restore failure). */
    async refetchProfileIfMissing() {
      const { accessToken, user } = $auth.get();
      if (!accessToken || user) return;
      const result = await fetchProfile(accessToken);
      if (isProfileOk(result)) {
        $auth.set({ ...$auth.get(), user: result.profile });
      } else if (isProfileUnauthorized(result)) {
        $auth.set({ accessToken: null, user: null, requiresTotp: false });
      }
    },

    /**
     * Recover a session on app load from the httpOnly refresh cookie. No tokens are persisted in the
     * browser, so this is the only restore path: refresh -> access token -> profile.
     */
    async restore() {
      const refreshed = await tryRefreshTokens();
      if (!refreshed?.accessToken) return;
      $auth.set({ ...$auth.get(), accessToken: refreshed.accessToken, requiresTotp: false });
      const result = await fetchProfile(refreshed.accessToken);
      if (isProfileOk(result)) {
        $auth.set({ ...$auth.get(), user: result.profile });
      }
    },
  };
}

export { $auth };
