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
const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const error = ref('');
const loading = ref(false);

async function handleRegister() {
  if (password.value !== confirmPassword.value) {
    error.value = 'Passwords do not match';
    return;
  }
  error.value = '';
  loading.value = true;
  try {
    const res = await api.post<{ accessToken: string; refreshToken: string }>('/auth/register', {
      username: username.value,
      password: password.value,
      email: email.value || undefined,
    });
    auth.setTokens(res.accessToken, res.refreshToken);
    router.push('/dashboard');
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Registration failed';
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
          <label class="text-sm font-medium mb-1.5 block">Email (optional)</label>
          <Input
            v-model="email"
            type="email"
            placeholder="your@email.com"
            autocomplete="email"
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
