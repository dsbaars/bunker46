<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useActivityStream } from '@/composables/useActivityStream';
import { useRouter } from 'vue-router';
import { Link2, KeyRound, Plug, Lock, Unlock } from 'lucide-vue-next';
import { api } from '@/lib/api';
import { useUiStore } from '@/stores/ui';
import { useFormatting } from '@/composables/useFormatting';
import Button from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import Badge from '@/components/ui/Badge.vue';
import Input from '@/components/ui/Input.vue';

const router = useRouter();
const ui = useUiStore();
const { formatDateTime } = useFormatting();

interface Connection {
  id: string;
  name: string;
  logoUrl?: string;
  status: string;
  clientPubkey: string;
  relays: string[];
  loggingEnabled: boolean;
  lastActivity?: string;
  nsecKey: { publicKey: string; label: string };
  permissions: Array<{ method: string; kind?: number }>;
  _count: { logs: number };
}

interface NsecKey {
  id: string;
  publicKey: string;
  label: string;
  createdAt: string;
}

const connections = ref<Connection[]>([]);
const nsecKeys = ref<NsecKey[]>([]);
const loading = ref(true);

const mode = ref<'idle' | 'generate' | 'import'>('idle');
const selectedKeyId = ref('');
const connectionName = ref('');
const generatedUri = ref('');
const generating = ref(false);
const copied = ref(false);
const error = ref('');

const bunkerUri = ref('');
const uriPreviewImage = ref('');
const creating = ref(false);

async function loadConnectionsAndKeys() {
  try {
    const [conns, keys] = await Promise.all([
      api.get<Connection[]>('/connections'),
      api.get<NsecKey[]>('/connections/nsec-keys'),
    ]);
    connections.value = conns;
    nsecKeys.value = keys;
    if (ui.defaultKeyId && keys.some((k) => k.id === ui.defaultKeyId)) {
      selectedKeyId.value = ui.defaultKeyId;
    }
  } catch {
    // ignore
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadConnectionsAndKeys();
});

useActivityStream(() => {
  loadConnectionsAndKeys();
});

// Parse nostrconnect:// URI reactively to extract name + image
watch(bunkerUri, (uri) => {
  uriPreviewImage.value = '';
  if (!uri.trim().startsWith('nostrconnect://')) return;
  try {
    const withoutScheme = uri.replace(/^nostrconnect:\/\//, 'http://x/');
    const url = new URL(withoutScheme);
    const name = url.searchParams.get('name');
    const image = url.searchParams.get('image');
    if (name && !connectionName.value) connectionName.value = name;
    if (image) uriPreviewImage.value = image;
  } catch {
    // invalid URL, ignore
  }
});

// Also reset image preview when URI is cleared
watch(mode, () => {
  uriPreviewImage.value = '';
});

function reset() {
  mode.value = 'idle';
  // keep selectedKeyId so the default key stays selected
  connectionName.value = '';
  generatedUri.value = '';
  generating.value = false;
  copied.value = false;
  error.value = '';
  bunkerUri.value = '';
  uriPreviewImage.value = '';
  creating.value = false;
}

function enterMode(m: 'generate' | 'import') {
  mode.value = m;
  // pre-select default key when entering a mode
  if (
    !selectedKeyId.value &&
    ui.defaultKeyId &&
    nsecKeys.value.some((k) => k.id === ui.defaultKeyId)
  ) {
    selectedKeyId.value = ui.defaultKeyId;
  }
}

async function generateBunkerUri() {
  if (!selectedKeyId.value) return;
  generating.value = true;
  error.value = '';
  try {
    const res = await api.post<{ uri: string }>('/bunker/generate-bunker-uri', {
      nsecKeyId: selectedKeyId.value,
      name: connectionName.value || undefined,
    });
    generatedUri.value = res.uri;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to generate URI';
  } finally {
    generating.value = false;
  }
}

async function copyUri() {
  await navigator.clipboard.writeText(generatedUri.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}

async function importConnection() {
  if (!bunkerUri.value.trim() || !selectedKeyId.value) return;
  creating.value = true;
  error.value = '';

  try {
    const parsed = await api.post<any>('/bunker/parse-uri', { uri: bunkerUri.value });
    if (parsed.type === 'invalid') {
      error.value = parsed.error || 'Invalid URI';
      return;
    }

    const clientPubkey =
      parsed.type === 'nostrconnect'
        ? parsed.clientPubkey || parsed.pubkey || ''
        : parsed.pubkey || '';

    await api.post('/connections', {
      nsecKeyId: selectedKeyId.value,
      clientPubkey,
      name: connectionName.value || parsed.name || 'Unnamed Connection',
      logoUrl: uriPreviewImage.value || parsed.image || undefined,
      relays: parsed.relays || [],
      secret: parsed.secret,
      remotePubkey: parsed.type === 'bunker' ? parsed.pubkey : undefined,
      perms: parsed.perms,
      type: parsed.type,
    });

    connections.value = await api.get<Connection[]>('/connections');
    reset();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to create connection';
  } finally {
    creating.value = false;
  }
}

async function refreshConnections() {
  connections.value = await api.get<Connection[]>('/connections');
}

function statusVariant(status: string) {
  switch (status) {
    case 'ACTIVE':
      return 'success' as const;
    case 'PENDING':
      return 'default' as const;
    case 'REVOKED':
      return 'destructive' as const;
    default:
      return 'secondary' as const;
  }
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">Connections</h1>
      <div v-if="mode === 'idle'" class="flex gap-2">
        <Button @click="enterMode('generate')">
          <KeyRound class="w-4 h-4 mr-2 shrink-0" />
          Generate bunker:// URI
        </Button>
        <Button variant="ghost" @click="enterMode('import')">
          <Link2 class="w-4 h-4 mr-2 shrink-0" />
          Use Nostrconnect URI
        </Button>
      </div>
      <Button v-else variant="ghost" @click="reset"> Cancel </Button>
    </div>

    <!-- Generate bunker:// URI -->
    <Card v-if="mode === 'generate'" class="mb-6">
      <h2 class="text-lg font-semibold mb-2">Generate bunker:// URI</h2>
      <p class="text-sm text-muted-foreground mb-4">
        Generate a URI and paste it into any NIP-46 compatible app (Primal, Amethyst, etc.) to allow
        it to use your key for signing.
      </p>

      <div v-if="!generatedUri" class="space-y-4">
        <div>
          <label class="text-sm font-medium mb-1.5 block">Nsec Key</label>
          <select
            v-model="selectedKeyId"
            class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="" disabled>Select a key...</option>
            <option v-for="key in nsecKeys" :key="key.id" :value="key.id">
              {{ key.label }}{{ ui.defaultKeyId === key.id ? ' ★' : '' }}
            </option>
          </select>
        </div>
        <div>
          <label class="text-sm font-medium mb-1.5 block">Connection Name (optional)</label>
          <Input v-model="connectionName" placeholder="e.g. Primal, Coracle..." />
        </div>
        <p v-if="nsecKeys.length === 0" class="text-sm text-muted-foreground">
          <router-link to="/keys" class="text-primary hover:underline">
            Add an nsec key
          </router-link>
          first.
        </p>
        <p v-if="error" class="text-sm text-destructive">
          {{ error }}
        </p>
        <Button :loading="generating" :disabled="!selectedKeyId" @click="generateBunkerUri">
          Generate URI
        </Button>
      </div>

      <div v-else class="space-y-4">
        <div class="p-4 rounded-lg bg-muted/50 border border-border">
          <p class="text-xs text-muted-foreground mb-2">Copy this URI into your Nostr client:</p>
          <div
            class="font-mono text-sm break-all select-all bg-background rounded p-3 border border-border"
          >
            {{ generatedUri }}
          </div>
        </div>
        <div class="flex gap-3">
          <Button @click="copyUri">
            {{ copied ? 'Copied!' : 'Copy to Clipboard' }}
          </Button>
          <Button variant="ghost" @click="generatedUri = ''"> Generate Another </Button>
        </div>
        <p class="text-xs text-muted-foreground">
          Waiting for client to connect... The connection will appear automatically once the client
          sends a connect request.
          <button
            class="text-primary hover:underline ml-1 cursor-pointer"
            @click="refreshConnections"
          >
            Refresh
          </button>
        </p>
      </div>
    </Card>

    <!-- Use Nostrconnect URI -->
    <Card v-if="mode === 'import'" class="mb-6">
      <h2 class="text-lg font-semibold mb-2">Use Nostrconnect URI</h2>
      <p class="text-sm text-muted-foreground mb-4">
        Paste a <code class="text-primary">nostrconnect://</code> URI from a client app.
      </p>
      <div class="space-y-4">
        <div>
          <label class="text-sm font-medium mb-1.5 block">Nostrconnect URI</label>
          <Input v-model="bunkerUri" placeholder="nostrconnect://..." class="font-mono text-sm" />
        </div>

        <!-- Image preview extracted from URI -->
        <div
          v-if="uriPreviewImage"
          class="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border"
        >
          <img
            :src="uriPreviewImage"
            alt="App icon"
            class="w-12 h-12 rounded-lg object-contain bg-white"
            @error="uriPreviewImage = ''"
          />
          <div>
            <p class="text-sm font-medium">
              {{ connectionName || 'Unknown App' }}
            </p>
            <p class="text-xs text-muted-foreground">Extracted from URI</p>
          </div>
        </div>

        <div>
          <label class="text-sm font-medium mb-1.5 block">Nsec Key</label>
          <select
            v-model="selectedKeyId"
            class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="" disabled>Select a key...</option>
            <option v-for="key in nsecKeys" :key="key.id" :value="key.id">
              {{ key.label }}{{ ui.defaultKeyId === key.id ? ' ★' : '' }}
            </option>
          </select>
        </div>
        <div>
          <label class="text-sm font-medium mb-1.5 block">Connection Name</label>
          <Input v-model="connectionName" placeholder="e.g. My App" />
        </div>
        <p v-if="error" class="text-sm text-destructive">
          {{ error }}
        </p>
        <Button
          :loading="creating"
          :disabled="!bunkerUri.trim() || !selectedKeyId"
          @click="importConnection"
        >
          Create Connection
        </Button>
      </div>
    </Card>

    <!-- Loading -->
    <div v-if="loading" class="text-muted-foreground">Loading connections...</div>

    <!-- Empty state -->
    <div v-else-if="connections.length === 0 && mode === 'idle'" class="text-center py-12">
      <div class="flex justify-center mb-4">
        <Plug class="w-12 h-12 text-muted-foreground" />
      </div>
      <p class="text-muted-foreground mb-2">No connections yet</p>
      <p class="text-sm text-muted-foreground mb-4">
        Generate a <code class="text-primary">bunker://</code> URI and paste it into a Nostr client
        to get started.
      </p>
      <div class="flex gap-3 justify-center">
        <Button @click="enterMode('generate')">
          <KeyRound class="w-4 h-4 mr-2 shrink-0" />
          Generate bunker:// URI
        </Button>
      </div>
    </div>

    <!-- Connection list -->
    <div
      v-else-if="connections.length > 0"
      class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
    >
      <Card
        v-for="conn in connections"
        :key="conn.id"
        class="cursor-pointer hover:border-primary/50 transition-colors"
        @click="router.push(`/connections/${conn.id}`)"
      >
        <div class="flex items-start gap-3">
          <div v-if="conn.logoUrl" class="w-10 h-10 rounded-lg bg-muted shrink-0 overflow-hidden">
            <img :src="conn.logoUrl" :alt="conn.name" class="w-full h-full object-cover" />
          </div>
          <div
            v-else
            class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"
          >
            <span class="text-primary font-bold">{{ conn.name.charAt(0).toUpperCase() }}</span>
          </div>

          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <h3 class="font-semibold truncate">
                {{ conn.name }}
              </h3>
              <Badge :variant="statusVariant(conn.status)">
                {{ conn.status }}
              </Badge>
            </div>
            <p class="text-xs text-muted-foreground mt-1 font-mono truncate">
              {{ conn.nsecKey.label }} · {{ conn.clientPubkey.slice(0, 12) }}...
            </p>
            <div class="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
              <span
                class="flex items-center gap-1"
                :class="
                  conn.permissions.length === 0
                    ? 'text-amber-600 dark:text-amber-400 font-medium'
                    : ''
                "
              >
                <Unlock v-if="conn.permissions.length === 0" class="w-3.5 h-3.5 shrink-0" />
                <Lock v-else class="w-3.5 h-3.5 shrink-0" />
                {{
                  conn.permissions.length === 0
                    ? 'Unrestricted'
                    : `${conn.permissions.length} permissions`
                }}
              </span>
              <span>{{ conn._count.logs }} logs</span>
              <span v-if="conn.lastActivity"> Last: {{ formatDateTime(conn.lastActivity) }} </span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  </div>
</template>
