<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';
import Card from '@/components/ui/Card.vue';

const router = useRouter();
const auth = useAuthStore();

const username = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

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
      router.push('/dashboard');
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Login failed';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="w-full max-w-md mx-auto">
    <div class="text-center mb-8">
      <div
        class="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-2xl mx-auto mb-4"
      >
        B
      </div>
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
