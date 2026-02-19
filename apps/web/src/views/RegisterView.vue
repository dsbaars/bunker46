<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { api } from '@/lib/api';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';
import Card from '@/components/ui/Card.vue';

const router = useRouter();
const auth = useAuthStore();
const settings = useSettingsStore();

const username = ref('');
const password = ref('');
const confirmPassword = ref('');
const error = ref('');
const loading = ref(false);

function tokensFrom(res: Record<string, unknown>): { accessToken?: string; refreshToken?: string } {
  const accessToken = (res.accessToken as string) ?? (res.access_token as string);
  const refreshToken = (res.refreshToken as string) ?? (res.refresh_token as string);
  return { accessToken, refreshToken };
}

async function handleRegister() {
  if (password.value !== confirmPassword.value) {
    error.value = 'Passwords do not match';
    return;
  }
  error.value = '';
  loading.value = true;
  try {
    const res = await api.post<Record<string, unknown>>('/auth/register', {
      username: username.value,
      password: password.value,
    });
    const { accessToken, refreshToken } = tokensFrom(res);
    if (accessToken) {
      auth.setTokens(accessToken, refreshToken);
      await settings.load(accessToken);
      router.push('/dashboard');
      return;
    }
    error.value = 'Invalid response from server. Please try again.';
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Registration failed';
    error.value = msg === 'Failed to fetch' ? 'Network error. Is the server running?' : msg;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="w-full max-w-md mx-auto">
    <div class="text-center mb-8">
      <h1 class="text-2xl font-bold">
        Create Account
      </h1>
      <p class="text-muted-foreground mt-2">
        Set up your Bunker46 account
      </p>
    </div>

    <Card>
      <form
        class="space-y-4"
        @submit.prevent="handleRegister"
      >
        <div>
          <label class="text-sm font-medium mb-1.5 block">Username</label>
          <Input
            v-model="username"
            placeholder="Choose a username"
            autocomplete="username"
          />
        </div>
        <div>
          <label class="text-sm font-medium mb-1.5 block">Password</label>
          <Input
            v-model="password"
            type="password"
            placeholder="At least 8 characters"
            autocomplete="new-password"
          />
        </div>
        <div>
          <label class="text-sm font-medium mb-1.5 block">Confirm Password</label>
          <Input
            v-model="confirmPassword"
            type="password"
            placeholder="Repeat password"
            autocomplete="new-password"
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
          Create Account
        </Button>
      </form>

      <div class="mt-4 text-center text-sm text-muted-foreground">
        Already have an account?
        <router-link
          to="/login"
          class="text-primary hover:underline"
        >
          Sign in
        </router-link>
      </div>
    </Card>
  </div>
</template>
