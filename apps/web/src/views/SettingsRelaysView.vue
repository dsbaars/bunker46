<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/lib/api';
import Button from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import Input from '@/components/ui/Input.vue';
import Badge from '@/components/ui/Badge.vue';

interface RelayInfo {
  id: string;
  url: string;
  isHealthy: boolean;
}

const relays = ref<string[]>([]);
const defaults = ref<string[]>([]);
const newRelay = ref('');
const loading = ref(true);
const saving = ref(false);
const saved = ref(false);
const error = ref('');

onMounted(async () => {
  try {
    const res = await api.get<{ relays: RelayInfo[]; defaults: string[] }>('/bunker/relays');
    relays.value = res.relays.map((r) => r.url);
    defaults.value = res.defaults;
    if (relays.value.length === 0) {
      relays.value = [...res.defaults];
    }
  } catch {
    // ignore
  } finally {
    loading.value = false;
  }
});

function addRelay() {
  const url = newRelay.value.trim();
  if (!url) return;
  if (!url.startsWith('wss://') && !url.startsWith('ws://')) {
    error.value = 'Relay URL must start with wss:// or ws://';
    return;
  }
  if (relays.value.includes(url)) {
    error.value = 'Relay already in list';
    return;
  }
  error.value = '';
  relays.value.push(url);
  newRelay.value = '';
}

function removeRelay(url: string) {
  relays.value = relays.value.filter((r) => r !== url);
}

function resetToDefaults() {
  relays.value = [...defaults.value];
}

async function saveRelays() {
  saving.value = true;
  error.value = '';
  try {
    await api.post('/bunker/relays', { relays: relays.value });
    saved.value = true;
    setTimeout(() => (saved.value = false), 2000);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold mb-6">Relay Configuration</h1>

    <div v-if="loading" class="text-muted-foreground">Loading...</div>

    <div v-else class="space-y-6 max-w-2xl">
      <Card>
        <h2 class="text-lg font-semibold mb-2">Active Relays</h2>
        <p class="text-sm text-muted-foreground mb-4">
          These relays are used when generating <code class="text-primary">bunker://</code> URIs and
          listening for NIP-46 signing requests. Changes take effect after saving.
        </p>

        <div
          v-if="relays.length === 0"
          class="text-sm text-muted-foreground mb-4 p-3 rounded-lg bg-muted/50"
        >
          No relays configured. Default relays will be used.
        </div>

        <div v-else class="space-y-2 mb-4">
          <div
            v-for="relay in relays"
            :key="relay"
            class="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30 border border-border/50"
          >
            <span class="text-sm font-mono truncate mr-3">{{ relay }}</span>
            <div class="flex items-center gap-2 shrink-0">
              <Badge v-if="defaults.includes(relay)" variant="secondary" class="text-xs">
                default
              </Badge>
              <button
                class="text-xs text-destructive hover:underline cursor-pointer"
                @click="removeRelay(relay)"
              >
                Remove
              </button>
            </div>
          </div>
        </div>

        <div class="flex gap-3 mb-4">
          <Input
            v-model="newRelay"
            placeholder="wss://relay.example.com"
            class="flex-1 font-mono text-sm"
            @keyup.enter="addRelay"
          />
          <Button :disabled="!newRelay.trim()" @click="addRelay"> Add </Button>
        </div>

        <p v-if="error" class="text-sm text-destructive mb-4">
          {{ error }}
        </p>

        <div class="flex items-center gap-3">
          <Button :loading="saving" @click="saveRelays">
            {{ saved ? 'Saved!' : 'Save Relays' }}
          </Button>
          <Button variant="ghost" @click="resetToDefaults"> Reset to Defaults </Button>
        </div>
      </Card>

      <Card>
        <h2 class="text-lg font-semibold mb-2">Default Relays</h2>
        <p class="text-sm text-muted-foreground mb-3">
          These are the built-in default relays used when no custom relays are configured.
        </p>
        <div class="space-y-1">
          <div
            v-for="relay in defaults"
            :key="relay"
            class="text-sm font-mono text-muted-foreground"
          >
            {{ relay }}
          </div>
        </div>
      </Card>
    </div>
  </div>
</template>
