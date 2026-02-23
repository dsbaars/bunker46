import { ref, type Ref } from 'vue';

export interface AuthConfig {
  registrationEnabled: boolean;
  /** Optional notice to show on login/register (e.g. testing server warning). */
  loginNotice?: string | null;
}

let cached: AuthConfig | null = null;
const configRef: Ref<AuthConfig | null> = ref(null);

/**
 * Fetches public auth config from the server (e.g. whether registration is enabled).
 * Result is cached for the session.
 */
export function useAuthConfig(): { config: Ref<AuthConfig | null>; load: () => Promise<void> } {
  async function load() {
    if (cached !== null) {
      configRef.value = cached;
      return;
    }
    try {
      const res = await fetch('/api/auth/config');
      if (res.ok) {
        const data = (await res.json()) as AuthConfig;
        cached = data;
        configRef.value = data;
      } else {
        configRef.value = { registrationEnabled: true };
      }
    } catch {
      configRef.value = { registrationEnabled: true };
    }
  }

  return { config: configRef, load };
}
