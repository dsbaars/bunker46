<script setup lang="ts">
import { ref } from 'vue';
import { api } from '@/lib/api';
import { startRegistration } from '@simplewebauthn/browser';
import Button from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import Input from '@/components/ui/Input.vue';

const totpSetup = ref<{ secret: string; qrCodeDataUrl: string; otpauthUrl: string } | null>(null);
const totpCode = ref('');
const totpError = ref('');
const totpSuccess = ref(false);
const passkeyStatus = ref('');

async function initTotpSetup() {
  try {
    totpSetup.value = await api.post('/auth/totp/setup');
  } catch (err) {
    totpError.value = err instanceof Error ? err.message : 'Failed to setup TOTP';
  }
}

async function confirmTotp() {
  if (!totpSetup.value) return;
  totpError.value = '';
  try {
    const res = await api.post<{ success: boolean; message?: string }>('/auth/totp/enable', {
      secret: totpSetup.value.secret,
      code: totpCode.value,
    });
    if (res.success) {
      totpSuccess.value = true;
      totpSetup.value = null;
    } else {
      totpError.value = res.message || 'Invalid code';
    }
  } catch (err) {
    totpError.value = err instanceof Error ? err.message : 'Failed to enable TOTP';
  }
}

async function registerPasskey() {
  passkeyStatus.value = '';
  try {
    const options = await api.get<any>('/auth/passkey/register/options');
    const attResp = await startRegistration({ optionsJSON: options });
    const result = await api.post<{ verified: boolean }>('/auth/passkey/register/verify', attResp);
    passkeyStatus.value = result.verified
      ? 'Passkey registered successfully!'
      : 'Verification failed';
  } catch (err) {
    passkeyStatus.value = err instanceof Error ? err.message : 'Failed to register passkey';
  }
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold mb-6">
      Security Settings
    </h1>

    <div class="space-y-6 max-w-lg">
      <Card>
        <h2 class="text-lg font-semibold mb-4">
          Two-Factor Authentication (TOTP)
        </h2>

        <div
          v-if="totpSuccess"
          class="text-success text-sm mb-4"
        >
          TOTP has been enabled successfully!
        </div>

        <div v-if="totpSetup">
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
          <div class="flex gap-3">
            <Input
              v-model="totpCode"
              placeholder="Enter 6-digit code"
              class="flex-1"
              maxlength="6"
            />
            <Button @click="confirmTotp">
              Verify
            </Button>
          </div>
          <p
            v-if="totpError"
            class="text-sm text-destructive mt-2"
          >
            {{ totpError }}
          </p>
        </div>

        <Button
          v-else
          @click="initTotpSetup"
        >
          Setup TOTP
        </Button>
      </Card>

      <Card>
        <h2 class="text-lg font-semibold mb-4">
          Passkeys (WebAuthn)
        </h2>
        <p class="text-sm text-muted-foreground mb-4">
          Register a hardware security key or biometric authenticator
        </p>
        <Button @click="registerPasskey">
          Register Passkey
        </Button>
        <p
          v-if="passkeyStatus"
          class="text-sm mt-2"
          :class="passkeyStatus.includes('success') ? 'text-success' : 'text-destructive'"
        >
          {{ passkeyStatus }}
        </p>
      </Card>
    </div>
  </div>
</template>
