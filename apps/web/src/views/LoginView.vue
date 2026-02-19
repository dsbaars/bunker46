<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { api } from '@/lib/api';
import { startAuthentication } from '@simplewebauthn/browser';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';
import Card from '@/components/ui/Card.vue';

const router = useRouter();
const auth = useAuthStore();
const settings = useSettingsStore();

const username = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

const passkeyUsername = ref('');
const passkeyError = ref('');
const passkeyLoading = ref(false);
const showPasskeyForm = ref(false);

async function handleLogin() {
  error.value = '';
  loading.value = true;
  try {
    const res = await api.post<{
      accessToken?: string;
      refreshToken?: string;
      requiresTotp?: boolean;
      partialToken?: string;
    }>('/auth/login', { username: username.value, password: password.value });

    if (res.requiresTotp && res.partialToken) {
      auth.setRequiresTotp(res.partialToken);
      router.push('/2fa/verify');
    } else if (res.accessToken) {
      auth.setTokens(res.accessToken, res.refreshToken);
      const profile = await api.get<any>('/users/me');
      auth.setUser(profile);
      await settings.load(res.accessToken);
      router.push('/dashboard');
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Login failed';
  } finally {
    loading.value = false;
  }
}

/** Usernameless: no username, browser shows passkey picker. */
async function handlePasskeyLogin() {
  passkeyError.value = '';
  passkeyLoading.value = true;
  try {
    const payload =
      showPasskeyForm.value && passkeyUsername.value.trim()
        ? { username: passkeyUsername.value.trim() }
        : {};
    const { options, userId } = await api.post<{ options: any; userId?: string }>(
      '/auth/passkey/login/options',
      payload,
    );
    const authResp = await startAuthentication({ optionsJSON: options });
    const verifyPayload = userId ? { userId, response: authResp } : { response: authResp };
    const res = await api.post<{
      verified: boolean;
      accessToken?: string;
      refreshToken?: string;
    }>('/auth/passkey/login/verify', verifyPayload);

    if (res.verified && res.accessToken) {
      auth.setTokens(res.accessToken, res.refreshToken);
      const profile = await api.get<any>('/users/me');
      auth.setUser(profile);
      await settings.load(res.accessToken);
      router.push('/dashboard');
    } else {
      passkeyError.value = 'Passkey verification failed';
    }
  } catch (err) {
    passkeyError.value = err instanceof Error ? err.message : 'Passkey login failed';
  } finally {
    passkeyLoading.value = false;
  }
}
</script>

<template>
  <div class="w-full max-w-md mx-auto">
    <div class="text-center mb-8">
      <img
        src="/logo.png"
        alt="Bunker46"
        class="w-16 h-16 rounded-2xl object-contain mx-auto mb-4"
      >
      <h1 class="text-2xl font-bold">
        Welcome to Bunker46
      </h1>
      <p class="text-muted-foreground mt-2">
        Sign in to manage your NIP-46 bunker
      </p>
    </div>

    <Card>
      <form
        class="space-y-4"
        @submit.prevent="handleLogin"
      >
        <div>
          <label class="text-sm font-medium mb-1.5 block">Username</label>
          <Input
            v-model="username"
            placeholder="Enter username"
            autocomplete="username"
          />
        </div>
        <div>
          <label class="text-sm font-medium mb-1.5 block">Password</label>
          <Input
            v-model="password"
            type="password"
            placeholder="Enter password"
            autocomplete="current-password"
          />
        </div>
        <p
          v-if="error"
          class="text-sm text-destructive"
        >
          {{ error }}
        </p>
        <Button
          :loading="loading"
          class="w-full"
        >
          Sign In
        </Button>
      </form>

      <div class="relative my-4">
        <div class="absolute inset-0 flex items-center">
          <div class="w-full border-t border-border" />
        </div>
        <div class="relative flex justify-center text-xs text-muted-foreground">
          <span class="bg-card px-2">or</span>
        </div>
      </div>

      <div class="space-y-3">
        <Button
          variant="outline"
          class="w-full"
          :loading="passkeyLoading"
          @click="handlePasskeyLogin"
        >
          Sign in with Passkey
        </Button>
        <button
          type="button"
          class="text-xs text-muted-foreground hover:text-foreground"
          @click="showPasskeyForm = !showPasskeyForm"
        >
          {{ showPasskeyForm ? 'Hide' : 'Use username instead' }}
        </button>
        <div
          v-if="showPasskeyForm"
          class="flex gap-2 items-end"
        >
          <Input
            v-model="passkeyUsername"
            placeholder="Username (for older passkeys)"
            autocomplete="username"
            class="flex-1"
          />
          <Button
            variant="outline"
            :loading="passkeyLoading"
            @click="handlePasskeyLogin"
          >
            Continue
          </Button>
        </div>
        <p
          v-if="passkeyError"
          class="text-sm text-destructive"
        >
          {{ passkeyError }}
        </p>
      </div>

      <div class="mt-4 text-center text-sm text-muted-foreground">
        Don't have an account?
        <router-link
          to="/register"
          class="text-primary hover:underline"
        >
          Register
        </router-link>
      </div>
    </Card>
  </div>
</template>
