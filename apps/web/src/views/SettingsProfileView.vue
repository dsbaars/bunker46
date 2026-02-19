<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import { useFormatting } from '@/composables/useFormatting';
import Card from '@/components/ui/Card.vue';
import type { UserProfileDto } from '@bunker46/shared-types';

const auth = useAuthStore();
const profile = ref<UserProfileDto | null>(null);
const { formatDate } = useFormatting();

onMounted(async () => {
  try {
    profile.value = await api.get<UserProfileDto>('/users/me');
    auth.setUser(profile.value);
  } catch {
    // empty
  }
});
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold mb-6">Profile Settings</h1>

    <Card v-if="profile" class="max-w-lg">
      <div class="space-y-4">
        <div>
          <label class="text-sm font-medium text-muted-foreground">Username</label>
          <p class="text-lg font-medium">
            {{ profile.username }}
          </p>
        </div>
        <div>
          <label class="text-sm font-medium text-muted-foreground">2FA Status</label>
          <p>{{ profile.totpEnabled ? 'Enabled' : 'Disabled' }}</p>
        </div>
        <div>
          <label class="text-sm font-medium text-muted-foreground">Passkeys</label>
          <p>{{ profile.passkeysCount }} registered</p>
        </div>
        <div>
          <label class="text-sm font-medium text-muted-foreground">Member Since</label>
          <p>{{ formatDate(profile.createdAt) }}</p>
        </div>
      </div>
    </Card>
  </div>
</template>
