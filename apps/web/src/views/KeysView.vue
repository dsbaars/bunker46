<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Key, Star, Trash2 } from 'lucide-vue-next';
import { api } from '@/lib/api';
import { useUiStore } from '@/stores/ui';
import { useFormatting } from '@/composables/useFormatting';
import Button from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import Badge from '@/components/ui/Badge.vue';
import Input from '@/components/ui/Input.vue';

interface NsecKey {
  id: string;
  publicKey: string;
  label: string;
  createdAt: string;
}

const keys = ref<NsecKey[]>([]);
const npubs = ref<Record<string, string>>({});
const loading = ref(true);
const showAddKey = ref(false);

const nsecInput = ref('');
const labelInput = ref('');
const addError = ref('');
const adding = ref(false);

const ui = useUiStore();
const { formatDate } = useFormatting();

onMounted(async () => {
  await loadKeys();
});

async function loadKeys() {
  loading.value = true;
  try {
    keys.value = await api.get<NsecKey[]>('/connections/nsec-keys');
    await resolveNpubs();
  } catch {
    // ignore
  } finally {
    loading.value = false;
  }
}

async function resolveNpubs() {
  const { nip19 } = await import('nostr-tools');
  const map: Record<string, string> = {};
  for (const key of keys.value) {
    try {
      map[key.id] = nip19.npubEncode(key.publicKey);
    } catch {
      map[key.id] = key.publicKey;
    }
  }
  npubs.value = map;
}

async function addKey() {
  addError.value = '';
  adding.value = true;
  try {
    const raw = nsecInput.value.trim();
    let nsecHex: string;
    let publicKey: string;

    const toHex = (bytes: Uint8Array) =>
      Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    const fromHex = (hex: string) =>
      new Uint8Array(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));

    if (raw.startsWith('nsec1')) {
      const { nip19 } = await import('nostr-tools');
      const { getPublicKey } = await import('nostr-tools/pure');
      const decoded = nip19.decode(raw);
      if (decoded.type !== 'nsec') throw new Error('Invalid nsec');
      nsecHex = toHex(decoded.data);
      publicKey = getPublicKey(decoded.data);
    } else if (/^[0-9a-f]{64}$/i.test(raw)) {
      nsecHex = raw.toLowerCase();
      const { getPublicKey } = await import('nostr-tools/pure');
      publicKey = getPublicKey(fromHex(raw));
    } else {
      throw new Error('Enter a valid nsec (nsec1... or 64-char hex)');
    }

    await api.post('/connections/nsec-keys', {
      nsecHex,
      publicKey,
      label: labelInput.value.trim() || 'Default Key',
    });

    nsecInput.value = '';
    labelInput.value = '';
    showAddKey.value = false;
    await loadKeys();
  } catch (err) {
    addError.value = err instanceof Error ? err.message : 'Failed to add key';
  } finally {
    adding.value = false;
  }
}

async function deleteKey(id: string) {
  if (!confirm('Delete this key? This cannot be undone.')) return;
  try {
    await api.delete(`/connections/nsec-keys/${id}`);
    if (ui.defaultKeyId === id) ui.setDefaultKey(null);
    await loadKeys();
  } catch (err) {
    alert(err instanceof Error ? err.message : 'Failed to delete key');
  }
}

function setDefault(id: string) {
  ui.setDefaultKey(ui.defaultKeyId === id ? null : id);
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">Nsec Keys</h1>
      <Button @click="showAddKey = !showAddKey">
        {{ showAddKey ? 'Cancel' : 'Add Key' }}
      </Button>
    </div>

    <Card v-if="showAddKey" class="mb-6">
      <h2 class="text-lg font-semibold mb-2">Import Nsec Key</h2>
      <p class="text-sm text-muted-foreground mb-4">
        Enter your nsec (bech32 <code class="text-primary">nsec1...</code> or 64-character hex). The
        key is encrypted at rest and never leaves the server.
      </p>
      <div class="space-y-3">
        <div>
          <label class="text-sm font-medium mb-1.5 block">Nsec</label>
          <Input
            v-model="nsecInput"
            type="password"
            placeholder="nsec1... or hex private key"
            class="font-mono"
          />
        </div>
        <div>
          <label class="text-sm font-medium mb-1.5 block">Label</label>
          <Input v-model="labelInput" placeholder="e.g. Main Identity, Bot Key..." />
        </div>
        <p v-if="addError" class="text-sm text-destructive">
          {{ addError }}
        </p>
        <Button :loading="adding" @click="addKey"> Import Key </Button>
      </div>
    </Card>

    <div v-if="loading" class="text-muted-foreground">Loading keys...</div>

    <div v-else-if="keys.length === 0" class="text-center py-12">
      <div class="flex justify-center mb-4">
        <Key class="w-12 h-12 text-muted-foreground" />
      </div>
      <p class="text-muted-foreground mb-4">
        No nsec keys yet. Add one to start managing connections.
      </p>
      <Button @click="showAddKey = true"> Add your first key </Button>
    </div>

    <div v-else class="space-y-3">
      <p v-if="keys.length > 0" class="text-xs text-muted-foreground mb-1">
        Star a key to pre-select it when creating connections.
      </p>
      <Card
        v-for="key in keys"
        :key="key.id"
        :class="ui.defaultKeyId === key.id ? 'border-primary/50' : ''"
      >
        <div class="flex items-center justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <h3 class="font-semibold">
                {{ key.label }}
              </h3>
              <Badge v-if="ui.defaultKeyId === key.id" variant="default"> Default </Badge>
            </div>
            <p class="text-xs text-muted-foreground font-mono truncate">
              {{ npubs[key.id] || key.publicKey }}
            </p>
            <p class="text-xs text-muted-foreground mt-1">Added {{ formatDate(key.createdAt) }}</p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button
              :title="ui.defaultKeyId === key.id ? 'Unset as default' : 'Set as default'"
              class="p-1 rounded transition-colors cursor-pointer"
              :class="
                ui.defaultKeyId === key.id
                  ? 'text-yellow-500'
                  : 'text-muted-foreground hover:text-yellow-500'
              "
              @click="setDefault(key.id)"
            >
              <Star :class="['w-5 h-5', ui.defaultKeyId === key.id ? 'fill-current' : '']" />
            </button>
            <Button
              variant="ghost"
              size="sm"
              class="text-destructive hover:text-destructive"
              @click="deleteKey(key.id)"
            >
              <Trash2 class="w-4 h-4 mr-1.5 shrink-0" />
              Delete
            </Button>
          </div>
        </div>
      </Card>
    </div>
  </div>
</template>
