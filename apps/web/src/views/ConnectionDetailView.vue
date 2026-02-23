<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/lib/api';
import { useFormatting } from '@/composables/useFormatting';
import Button from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import Badge from '@/components/ui/Badge.vue';
import PubkeyDisplay from '@/components/PubkeyDisplay.vue';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

const route = useRoute();
const router = useRouter();
const connection = ref<any>(null);
const logs = ref<any[]>([]);
const loading = ref(true);
const logsLoading = ref(false);

const NIP46_METHODS = [
  'connect',
  'sign_event',
  'ping',
  'get_public_key',
  'nip04_encrypt',
  'nip04_decrypt',
  'nip44_encrypt',
  'nip44_decrypt',
];

onMounted(async () => {
  try {
    const [conn, logsRes] = await Promise.all([
      api.get(`/connections/${route.params.id}`),
      api.get<any>(`/connections/${route.params.id}/logs?limit=50`).catch(() => ({ data: [] })),
    ]);
    connection.value = conn;
    logs.value = logsRes.data || [];
  } catch {
    router.push('/connections');
  } finally {
    loading.value = false;
  }
});

const isUnrestricted = computed(() => {
  return !connection.value?.permissions?.length;
});

function isMethodExplicit(method: string) {
  return connection.value?.permissions?.some((p: any) => p.method === method) ?? false;
}

async function togglePermission(method: string) {
  if (!connection.value) return;
  const current = connection.value.permissions as Array<{ method: string; kind?: number }>;
  let updated: Array<{ method: string; kind?: number }>;

  if (isMethodExplicit(method)) {
    updated = current.filter((p: any) => p.method !== method);
  } else {
    updated = [...current, { method }];
  }

  await api.put(`/connections/${route.params.id}/permissions`, { permissions: updated });
  connection.value.permissions = updated;
}

async function setUnrestricted() {
  if (!connection.value) return;
  await api.put(`/connections/${route.params.id}/permissions`, { permissions: [] });
  connection.value.permissions = [];
}

async function setRestrictedDefaults() {
  if (!connection.value) return;
  const defaults = NIP46_METHODS.map((m) => ({ method: m }));
  await api.put(`/connections/${route.params.id}/permissions`, { permissions: defaults });
  connection.value.permissions = defaults;
}

async function toggleLogging() {
  if (!connection.value) return;
  const newVal = !connection.value.loggingEnabled;
  await api.patch(`/connections/${route.params.id}/logging`, { enabled: newVal });
  connection.value.loggingEnabled = newVal;
}

async function revokeConnection() {
  if (!connection.value) return;
  await api.patch(`/connections/${route.params.id}/status`, { status: 'REVOKED' });
  connection.value.status = 'REVOKED';
}

async function reactivateConnection() {
  if (!connection.value) return;
  await api.patch(`/connections/${route.params.id}/status`, { status: 'ACTIVE' });
  connection.value.status = 'ACTIVE';
}

const deleteConfirmOpen = ref(false);
const deleting = ref(false);

function promptDeleteConnection() {
  deleteConfirmOpen.value = true;
}

async function confirmDeleteConnection() {
  deleting.value = true;
  try {
    await api.delete(`/connections/${route.params.id}`);
    router.push('/connections');
  } finally {
    deleting.value = false;
    deleteConfirmOpen.value = false;
  }
}

async function refreshLogs() {
  logsLoading.value = true;
  try {
    const res = await api.get<any>(`/connections/${route.params.id}/logs?limit=50`);
    logs.value = res.data || [];
  } catch {
    /* ignore */
  } finally {
    logsLoading.value = false;
  }
}

const methodCounts = computed(() => {
  const counts: Record<string, number> = {};
  for (const log of logs.value) {
    const key = log.eventKind != null ? `${log.method}:${log.eventKind}` : log.method;
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
});

function statusVariant(status: string) {
  switch (status) {
    case 'ACTIVE':
      return 'success' as const;
    case 'REVOKED':
      return 'destructive' as const;
    default:
      return 'secondary' as const;
  }
}

function resultVariant(result: string) {
  switch (result) {
    case 'APPROVED':
      return 'success' as const;
    case 'ERROR':
      return 'destructive' as const;
    case 'DENIED':
      return 'destructive' as const;
    default:
      return 'secondary' as const;
  }
}

const { formatDateTime } = useFormatting();
function formatTime(ts: string) {
  return formatDateTime(ts);
}
</script>

<template>
  <div v-if="loading" class="text-muted-foreground">Loading...</div>

  <div v-else-if="connection">
    <div class="flex items-center gap-3 mb-6">
      <button
        class="text-muted-foreground hover:text-foreground cursor-pointer"
        @click="router.push('/connections')"
      >
        ← Back
      </button>
    </div>

    <div class="flex flex-col sm:flex-row items-start gap-4 mb-8">
      <div v-if="connection.logoUrl" class="w-16 h-16 rounded-xl bg-muted overflow-hidden shrink-0">
        <img :src="connection.logoUrl" :alt="connection.name" class="w-full h-full object-cover" />
      </div>
      <div
        v-else
        class="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"
      >
        <span class="text-primary font-bold text-2xl">{{
          connection.name.charAt(0).toUpperCase()
        }}</span>
      </div>

      <div class="flex-1">
        <div class="flex items-center gap-3 flex-wrap">
          <h1 class="text-2xl font-bold">
            {{ connection.name }}
          </h1>
          <Badge :variant="statusVariant(connection.status)">
            {{ connection.status }}
          </Badge>
        </div>
        <p class="text-sm text-muted-foreground mt-1">
          Client: <PubkeyDisplay :pubkey="connection.clientPubkey" />
        </p>
        <p class="text-sm text-muted-foreground">
          Key: {{ connection.nsecKey?.label }}
          <template v-if="connection.nsecKey?.publicKey">
            (<PubkeyDisplay :pubkey="connection.nsecKey.publicKey" :truncate="true" />)
          </template>
        </p>
        <p v-if="connection.lastActivity" class="text-xs text-muted-foreground mt-1">
          Last activity: {{ formatTime(connection.lastActivity) }}
        </p>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Permissions -->
      <Card>
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold">Permissions</h2>
          <div class="flex gap-2">
            <button
              v-if="!isUnrestricted"
              class="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              @click="setUnrestricted"
            >
              Allow all
            </button>
            <button
              v-if="isUnrestricted"
              class="text-xs text-primary hover:underline cursor-pointer"
              @click="setRestrictedDefaults"
            >
              Restrict to whitelist
            </button>
          </div>
        </div>

        <div
          v-if="isUnrestricted"
          class="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30"
        >
          <p class="text-sm font-medium text-amber-600 dark:text-amber-400">Unrestricted</p>
          <p class="text-xs text-muted-foreground mt-1">
            No permission whitelist configured. All NIP-46 methods are allowed. Click "Restrict to
            whitelist" to only allow specific methods.
          </p>
        </div>

        <div v-else class="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
          <p class="text-sm font-medium text-blue-600 dark:text-blue-400">Whitelist mode</p>
          <p class="text-xs text-muted-foreground mt-1">
            Only explicitly enabled methods are allowed. Toggle individual methods below.
          </p>
        </div>

        <div class="space-y-2">
          <div
            v-for="method in NIP46_METHODS"
            :key="method"
            class="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
          >
            <div class="flex items-center gap-2">
              <span class="text-sm font-mono">{{ method }}</span>
              <Badge v-if="isUnrestricted" variant="secondary" class="text-[10px]"> allowed </Badge>
            </div>
            <button
              v-if="!isUnrestricted"
              :class="[
                'w-12 h-6 rounded-full transition-colors cursor-pointer relative',
                isMethodExplicit(method) ? 'bg-primary' : 'bg-muted',
              ]"
              @click="togglePermission(method)"
            >
              <span
                :class="[
                  'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform',
                  isMethodExplicit(method) ? 'left-6' : 'left-0.5',
                ]"
              />
            </button>
          </div>
        </div>
      </Card>

      <div class="space-y-6">
        <!-- Activity summary -->
        <Card>
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold">Recent Activity</h2>
            <button
              class="text-xs text-primary hover:underline cursor-pointer"
              @click="refreshLogs"
            >
              {{ logsLoading ? 'Loading...' : 'Refresh' }}
            </button>
          </div>

          <div v-if="logs.length === 0" class="text-sm text-muted-foreground">
            No activity recorded yet.
          </div>

          <div v-else>
            <div v-if="methodCounts.length > 0" class="mb-4">
              <p class="text-xs text-muted-foreground mb-2">
                Methods used ({{ logs.length }} total requests):
              </p>
              <div class="flex flex-wrap gap-2">
                <Badge v-for="[method, count] in methodCounts" :key="method" variant="secondary">
                  {{ method }} × {{ count }}
                </Badge>
              </div>
            </div>

            <div class="max-h-64 overflow-y-auto space-y-1">
              <div
                v-for="log in logs.slice(0, 20)"
                :key="log.id"
                class="flex items-center justify-between text-xs py-1.5 border-b border-border/30 last:border-0"
              >
                <div class="flex items-center gap-2">
                  <Badge :variant="resultVariant(log.result)" class="text-[10px]">
                    {{ log.result }}
                  </Badge>
                  <span class="font-mono">
                    {{ log.method }}{{ log.eventKind != null ? `:${log.eventKind}` : '' }}
                  </span>
                </div>
                <span class="text-muted-foreground">
                  {{ formatTime(log.createdAt) }}
                </span>
              </div>
            </div>

            <router-link
              v-if="logs.length > 20"
              :to="`/connections/${connection.id}/logs`"
              class="block text-sm text-primary hover:underline mt-3"
            >
              View all {{ logs.length }}+ logs →
            </router-link>
          </div>
        </Card>

        <!-- Relays -->
        <Card>
          <h2 class="text-lg font-semibold mb-4">Relays</h2>
          <div v-if="connection.relays.length === 0" class="text-sm text-muted-foreground">
            Using default relays
          </div>
          <div v-else class="space-y-1">
            <div
              v-for="relay in connection.relays"
              :key="relay"
              class="text-sm font-mono text-muted-foreground"
            >
              {{ relay }}
            </div>
          </div>
        </Card>

        <!-- Options -->
        <Card>
          <h2 class="text-lg font-semibold mb-4">Options</h2>
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <div class="font-medium text-sm">Detailed Logging</div>
                <div class="text-xs text-muted-foreground">
                  Log all RPC calls for this connection
                </div>
              </div>
              <button
                :class="[
                  'w-12 h-6 rounded-full transition-colors cursor-pointer relative',
                  connection.loggingEnabled ? 'bg-primary' : 'bg-muted',
                ]"
                @click="toggleLogging"
              >
                <span
                  :class="[
                    'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform',
                    connection.loggingEnabled ? 'left-6' : 'left-0.5',
                  ]"
                />
              </button>
            </div>
          </div>
        </Card>

        <!-- Danger -->
        <Card>
          <h2 class="text-lg font-semibold mb-4">Danger Zone</h2>
          <div class="space-y-3">
            <Button
              v-if="connection.status === 'ACTIVE'"
              variant="outline"
              class="w-full"
              @click="revokeConnection"
            >
              Revoke Connection
            </Button>
            <Button
              v-if="connection.status === 'REVOKED'"
              variant="outline"
              class="w-full"
              @click="reactivateConnection"
            >
              Reactivate Connection
            </Button>
            <Button variant="destructive" class="w-full" @click="promptDeleteConnection">
              Delete Connection
            </Button>
          </div>
        </Card>
      </div>
    </div>
  </div>

  <!-- Delete connection confirmation dialog -->
  <AlertDialog v-model:open="deleteConfirmOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete connection?</AlertDialogTitle>
        <AlertDialogDescription>
          This action cannot be undone. The connection will be permanently deleted.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive" @click.prevent="confirmDeleteConnection">
          {{ deleting ? 'Deleting…' : 'Delete' }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
