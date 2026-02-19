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

const code = ref('');
const error = ref('');
const loading = ref(false);

async function handleVerify() {
  error.value = '';
  loading.value = true;
  try {
    const res = await api.post<{ accessToken: string; refreshToken: string }>('/auth/totp/verify', {
      code: code.value,
    });
    auth.setTokens(res.accessToken, res.refreshToken);
    const profile = await api.get<any>('/users/me');
    auth.setUser(profile);
    router.push('/dashboard');
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Invalid code';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="w-full max-w-md mx-auto">
    <div class="text-center mb-8">
      <h1 class="text-2xl font-bold">
        Two-Factor Authentication
      </h1>
      <p class="text-muted-foreground mt-2">
        Enter the 6-digit code from your authenticator app
      </p>
    </div>

    <Card>
      <form
        class="space-y-4"
        @submit.prevent="handleVerify"
      >
        <div>
          <label class="text-sm font-medium mb-1.5 block">TOTP Code</label>
          <Input
            v-model="code"
            placeholder="000000"
            class="text-center text-2xl tracking-widest"
            maxlength="6"
            autocomplete="one-time-code"
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
          Verify
        </Button>
      </form>
    </Card>
  </div>
</template>
