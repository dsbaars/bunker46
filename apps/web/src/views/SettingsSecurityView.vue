<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { useFormatting } from '@/composables/useFormatting';
import { startRegistration } from '@simplewebauthn/browser';
import Button from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import Input from '@/components/ui/Input.vue';
import Badge from '@/components/ui/Badge.vue';

const router = useRouter();
const auth = useAuthStore();
const settingsStore = useSettingsStore();
const { formatDate } = useFormatting();

// TOTP state
const totpEnabled = ref(false);
const totpSetup = ref<{ secret: string; qrCodeDataUrl: string; otpauthUrl: string } | null>(null);
const totpCode = ref('');
const totpError = ref('');
const totpSuccess = ref('');
const totpLoading = ref(false);

// Passkey state
interface Passkey {
  id: string;
  name: string;
  createdAt: string;
}
const passkeys = ref<Passkey[]>([]);
const passkeyStatus = ref('');
const passkeyLoading = ref(false);

// Change password state
const currentPassword = ref('');
const newPassword = ref('');
const confirmNewPassword = ref('');
const passwordError = ref('');
const passwordSuccess = ref('');
const passwordLoading = ref(false);

// Session manager state
interface SessionItem {
  id: string;
  userAgent?: string;
  ipAddress?: string;
  createdAt: string;
  expiresAt: string;
  current: boolean;
}
const sessions = ref<SessionItem[]>([]);
const sessionsLoading = ref(false);
const sessionsError = ref('');
const revokeOthersLoading = ref(false);

onMounted(async () => {
  if (auth.user) totpEnabled.value = auth.user.totpEnabled;
  await loadPasskeys();
  await loadSessions();
});

async function loadPasskeys() {
  try {
    passkeys.value = await api.get<Passkey[]>('/auth/passkey');
  } catch {
    // silent
  }
}

// TOTP
async function initTotpSetup() {
  totpError.value = '';
  totpSuccess.value = '';
  try {
    totpSetup.value = await api.post('/auth/totp/setup');
  } catch (err) {
    totpError.value = err instanceof Error ? err.message : 'Failed to start TOTP setup';
  }
}

async function confirmTotp() {
  if (!totpSetup.value) return;
  totpError.value = '';
  totpLoading.value = true;
  try {
    const res = await api.post<{ success: boolean; message?: string }>('/auth/totp/enable', {
      secret: totpSetup.value.secret,
      code: totpCode.value,
    });
    if (res.success) {
      totpEnabled.value = true;
      totpSuccess.value = 'Two-factor authentication has been enabled.';
      totpSetup.value = null;
      totpCode.value = '';
      if (auth.user) auth.setUser({ ...auth.user, totpEnabled: true });
    } else {
      totpError.value = res.message || 'Invalid code';
    }
  } catch (err) {
    totpError.value = err instanceof Error ? err.message : 'Failed to enable TOTP';
  } finally {
    totpLoading.value = false;
  }
}

async function disableTotp() {
  totpError.value = '';
  totpSuccess.value = '';
  totpLoading.value = true;
  try {
    await api.delete('/auth/totp');
    totpEnabled.value = false;
    totpSuccess.value = 'Two-factor authentication has been disabled.';
    if (auth.user) auth.setUser({ ...auth.user, totpEnabled: false });
  } catch (err) {
    totpError.value = err instanceof Error ? err.message : 'Failed to disable TOTP';
  } finally {
    totpLoading.value = false;
  }
}

function cancelTotpSetup() {
  totpSetup.value = null;
  totpCode.value = '';
  totpError.value = '';
}

// Passkeys
async function registerPasskey() {
  passkeyStatus.value = '';
  passkeyLoading.value = true;
  try {
    const options = await api.get<any>('/auth/passkey/register/options');
    const attResp = await startRegistration({ optionsJSON: options });
    const result = await api.post<{ verified: boolean }>('/auth/passkey/register/verify', attResp);
    if (result.verified) {
      passkeyStatus.value = 'Passkey registered successfully!';
      await loadPasskeys();
    } else {
      passkeyStatus.value = 'Verification failed';
    }
  } catch (err) {
    passkeyStatus.value = err instanceof Error ? err.message : 'Failed to register passkey';
  } finally {
    passkeyLoading.value = false;
  }
}

async function deletePasskey(id: string) {
  try {
    await api.delete(`/auth/passkey/${id}`);
    await loadPasskeys();
  } catch (err) {
    passkeyStatus.value = err instanceof Error ? err.message : 'Failed to delete passkey';
  }
}

// Session manager
async function loadSessions() {
  sessionsError.value = '';
  sessionsLoading.value = true;
  try {
    sessions.value = await api.get<SessionItem[]>('/auth/sessions');
  } catch (err) {
    sessionsError.value = err instanceof Error ? err.message : 'Failed to load sessions';
  } finally {
    sessionsLoading.value = false;
  }
}

function sessionLabel(session: SessionItem) {
  if (session.userAgent) {
    // Simple heuristic: try to show browser/device
    const ua = session.userAgent;
    if (ua.includes('Mobile')) return 'Mobile device';
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return 'Other browser';
  }
  return 'Unknown device';
}

async function revokeSession(session: SessionItem) {
  sessionsError.value = '';
  try {
    await api.delete(`/auth/sessions/${session.id}`);
    if (session.current) {
      auth.logout();
      settingsStore.clear();
      router.push('/login');
      return;
    }
    await loadSessions();
  } catch (err) {
    sessionsError.value = err instanceof Error ? err.message : 'Failed to revoke session';
  }
}

async function revokeAllOtherSessions() {
  sessionsError.value = '';
  revokeOthersLoading.value = true;
  try {
    await api.delete('/auth/sessions/others');
    await loadSessions();
    // If no sessions left (e.g. JWT had no sessionId so backend revoked all), log out
    if (sessions.value.length === 0) {
      auth.logout();
      settingsStore.clear();
      router.push('/login');
    }
  } catch (err) {
    sessionsError.value = err instanceof Error ? err.message : 'Failed to revoke sessions';
  } finally {
    revokeOthersLoading.value = false;
  }
}

const otherSessionsCount = () => sessions.value.filter((s) => !s.current).length;

// Change password
async function handleChangePassword() {
  passwordError.value = '';
  passwordSuccess.value = '';
  if (newPassword.value !== confirmNewPassword.value) {
    passwordError.value = 'New passwords do not match';
    return;
  }
  if (newPassword.value.length < 8) {
    passwordError.value = 'Password must be at least 8 characters';
    return;
  }
  passwordLoading.value = true;
  try {
    await api.patch('/users/me/password', {
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
    });
    passwordSuccess.value = 'Password changed successfully.';
    currentPassword.value = '';
    newPassword.value = '';
    confirmNewPassword.value = '';
  } catch (err) {
    passwordError.value = err instanceof Error ? err.message : 'Failed to change password';
  } finally {
    passwordLoading.value = false;
  }
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold mb-6">
      Security Settings
    </h1>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
      <div class="space-y-6 max-w-lg">
        <!-- TOTP -->
        <Card>
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold">
              Two-Factor Authentication
            </h2>
            <Badge :variant="totpEnabled ? 'default' : 'secondary'">
              {{ totpEnabled ? 'Enabled' : 'Disabled' }}
            </Badge>
          </div>

          <p class="text-sm text-muted-foreground mb-4">
            Use an authenticator app to generate time-based one-time passwords.
          </p>

          <div
            v-if="totpSuccess"
            class="text-sm text-green-600 dark:text-green-400 mb-4"
          >
            {{ totpSuccess }}
          </div>

          <!-- Setup flow -->
          <div v-if="totpSetup">
            <p class="text-sm text-muted-foreground mb-3">
              Scan this QR code with your authenticator app, then enter the 6-digit code to confirm.
            </p>
            <div class="flex justify-center mb-4">
              <img
                :src="totpSetup.qrCodeDataUrl"
                alt="TOTP QR Code"
                class="rounded-lg"
              >
            </div>
            <p class="text-xs text-muted-foreground text-center mb-4 font-mono break-all">
              {{ totpSetup.secret }}
            </p>
            <div class="flex gap-3 mb-2">
              <Input
                v-model="totpCode"
                placeholder="Enter 6-digit code"
                class="flex-1"
                maxlength="6"
              />
              <Button
                :loading="totpLoading"
                @click="confirmTotp"
              >
                Verify
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              @click="cancelTotpSetup"
            >
              Cancel
            </Button>
            <p
              v-if="totpError"
              class="text-sm text-destructive mt-2"
            >
              {{ totpError }}
            </p>
          </div>

          <!-- Enabled state -->
          <div
            v-else-if="totpEnabled"
            class="flex gap-3"
          >
            <Button
              variant="destructive"
              :loading="totpLoading"
              @click="disableTotp"
            >
              Disable TOTP
            </Button>
          </div>

          <!-- Disabled state -->
          <div v-else>
            <Button @click="initTotpSetup">
              Set Up TOTP
            </Button>
            <p
              v-if="totpError"
              class="text-sm text-destructive mt-2"
            >
              {{ totpError }}
            </p>
          </div>
        </Card>

        <!-- Passkeys -->
        <Card>
          <h2 class="text-lg font-semibold mb-4">
            Passkeys
          </h2>
          <p class="text-sm text-muted-foreground mb-4">
            Register a hardware security key or biometric authenticator to sign in without a
            password.
          </p>

          <div
            v-if="passkeys.length > 0"
            class="space-y-2 mb-4"
          >
            <div
              v-for="pk in passkeys"
              :key="pk.id"
              class="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30"
            >
              <div>
                <p class="text-sm font-medium">
                  {{ pk.name }}
                </p>
                <p class="text-xs text-muted-foreground">
                  Added {{ formatDate(pk.createdAt) }}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                class="text-destructive hover:text-destructive hover:bg-destructive/10"
                @click="deletePasskey(pk.id)"
              >
                Remove
              </Button>
            </div>
          </div>

          <Button
            :loading="passkeyLoading"
            @click="registerPasskey"
          >
            Register Passkey
          </Button>
          <p
            v-if="passkeyStatus"
            class="text-sm mt-2"
            :class="
              passkeyStatus.includes('success')
                ? 'text-green-600 dark:text-green-400'
                : 'text-destructive'
            "
          >
            {{ passkeyStatus }}
          </p>
        </Card>

        <!-- Change Password -->
        <Card>
          <h2 class="text-lg font-semibold mb-4">
            Change Password
          </h2>

          <div
            v-if="passwordSuccess"
            class="text-sm text-green-600 dark:text-green-400 mb-4"
          >
            {{ passwordSuccess }}
          </div>

          <form
            class="space-y-4"
            @submit.prevent="handleChangePassword"
          >
            <div>
              <label class="text-sm font-medium mb-1.5 block">Current Password</label>
              <Input
                v-model="currentPassword"
                type="password"
                placeholder="Enter current password"
                autocomplete="current-password"
              />
            </div>
            <div>
              <label class="text-sm font-medium mb-1.5 block">New Password</label>
              <Input
                v-model="newPassword"
                type="password"
                placeholder="At least 8 characters"
                autocomplete="new-password"
              />
            </div>
            <div>
              <label class="text-sm font-medium mb-1.5 block">Confirm New Password</label>
              <Input
                v-model="confirmNewPassword"
                type="password"
                placeholder="Repeat new password"
                autocomplete="new-password"
              />
            </div>
            <p
              v-if="passwordError"
              class="text-sm text-destructive"
            >
              {{ passwordError }}
            </p>
            <Button
              :loading="passwordLoading"
              class="w-full"
            >
              Update Password
            </Button>
          </form>
        </Card>
      </div>

      <!-- Session manager (second column on large screens) -->
      <div class="lg:max-w-md">
        <Card>
          <h2 class="text-lg font-semibold mb-4">
            Active Sessions
          </h2>
          <p class="text-sm text-muted-foreground mb-4">
            Devices or browsers where you are logged in. Revoke any session to log it out. Your
            current session is marked.
          </p>

          <p
            v-if="sessionsError"
            class="text-sm text-destructive mb-4"
          >
            {{ sessionsError }}
          </p>

          <div
            v-if="sessionsLoading"
            class="text-sm text-muted-foreground"
          >
            Loading…
          </div>
          <div
            v-else-if="sessions.length === 0"
            class="text-sm text-muted-foreground"
          >
            No sessions found.
          </div>
          <div
            v-else
            class="space-y-3 mb-4"
          >
            <div
              v-for="session in sessions"
              :key="session.id"
              class="flex items-start justify-between gap-3 p-3 rounded-lg border border-border bg-muted/30"
            >
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium flex items-center gap-2">
                  {{ sessionLabel(session) }}
                  <Badge
                    v-if="session.current"
                    variant="secondary"
                    class="shrink-0"
                  >
                    This device
                  </Badge>
                </p>
                <p class="text-xs text-muted-foreground mt-0.5">
                  {{ formatDate(session.createdAt) }}
                  <span v-if="session.ipAddress"> · {{ session.ipAddress }}</span>
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                class="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                @click="revokeSession(session)"
              >
                Revoke
              </Button>
            </div>
          </div>

          <Button
            v-if="otherSessionsCount() > 0"
            variant="outline"
            :loading="revokeOthersLoading"
            class="w-full"
            @click="revokeAllOtherSessions"
          >
            Log out all other sessions
          </Button>
        </Card>
      </div>
    </div>
  </div>
</template>
