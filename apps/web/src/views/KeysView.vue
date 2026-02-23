<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useStore } from '@nanostores/vue';
import { Key, Star, Trash2, Pencil, RefreshCw } from 'lucide-vue-next';
import { api } from '@/lib/api';
import { useUiStore, $ui } from '@/stores/ui';
import { useFormatting } from '@/composables/useFormatting';
import { deriveNip06Key, generateMnemonic } from '@/lib/nip06';
import Button from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import Badge from '@/components/ui/Badge.vue';
import Input from '@/components/ui/Input.vue';
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

interface NsecKey {
  id: string;
  publicKey: string;
  label: string;
  createdAt: string;
}

const keys = ref<NsecKey[]>([]);
const loading = ref(true);

type AddMode = 'none' | 'import' | 'mnemonic';
const addMode = ref<AddMode>('none');

// --- Import nsec form ---
const nsecInput = ref('');
const labelInput = ref('');
const addError = ref('');
const adding = ref(false);

// --- NIP-06 mnemonic form ---
const mnemonicInput = ref('');
const mnemonicAccountStr = ref('0');
const mnemonicLabel = ref('');
const mnemonicError = ref('');
const mnemonicDeriving = ref(false);
const mnemonicGenerating = ref(false);

// --- Rename ---
const renamingKeyId = ref<string | null>(null);
const renameLabel = ref('');
const renameError = ref('');
const renaming = ref(false);

// --- Delete confirmation ---
const deleteConfirmOpen = ref(false);
const deleteTargetId = ref<string | null>(null);
const deleteError = ref('');
const deleteErrorOpen = ref(false);
const deleting = ref(false);

const ui = useUiStore();
const uiState = useStore($ui);
const { formatDate } = useFormatting();

onMounted(async () => {
  await loadKeys();
});

async function loadKeys() {
  loading.value = true;
  try {
    keys.value = await api.get<NsecKey[]>('/connections/nsec-keys');
  } catch {
    // ignore
  } finally {
    loading.value = false;
  }
}

function openAddMode(mode: AddMode) {
  addMode.value = mode;
  nsecInput.value = '';
  labelInput.value = '';
  addError.value = '';
  mnemonicInput.value = '';
  mnemonicAccountStr.value = '0';
  mnemonicLabel.value = '';
  mnemonicError.value = '';
}

function closeAddMode() {
  addMode.value = 'none';
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

    closeAddMode();
    await loadKeys();
  } catch (err) {
    addError.value = err instanceof Error ? err.message : 'Failed to add key';
  } finally {
    adding.value = false;
  }
}

function handleGenerateMnemonic() {
  mnemonicGenerating.value = true;
  try {
    mnemonicInput.value = generateMnemonic();
    mnemonicError.value = '';
  } catch (err) {
    mnemonicError.value = err instanceof Error ? err.message : 'Failed to generate mnemonic';
  } finally {
    mnemonicGenerating.value = false;
  }
}

async function addKeyFromMnemonic() {
  mnemonicError.value = '';
  mnemonicDeriving.value = true;
  try {
    const account = Math.max(0, parseInt(mnemonicAccountStr.value, 10) || 0);
    const { nsecHex, publicKey } = await deriveNip06Key(mnemonicInput.value, account);
    await api.post('/connections/nsec-keys', {
      nsecHex,
      publicKey,
      label: mnemonicLabel.value.trim() || 'Mnemonic Key',
    });
    closeAddMode();
    await loadKeys();
  } catch (err) {
    mnemonicError.value = err instanceof Error ? err.message : 'Failed to derive key';
  } finally {
    mnemonicDeriving.value = false;
  }
}

function startRename(key: NsecKey) {
  renamingKeyId.value = key.id;
  renameLabel.value = key.label;
  renameError.value = '';
}

function cancelRename() {
  renamingKeyId.value = null;
  renameLabel.value = '';
  renameError.value = '';
}

async function saveRename(id: string) {
  const label = renameLabel.value.trim();
  if (!label) {
    renameError.value = 'Label cannot be empty.';
    return;
  }
  renaming.value = true;
  renameError.value = '';
  try {
    await api.patch(`/connections/nsec-keys/${id}`, { label });
    renamingKeyId.value = null;
    await loadKeys();
  } catch (err) {
    renameError.value = err instanceof Error ? err.message : 'Failed to rename key';
  } finally {
    renaming.value = false;
  }
}

function promptDeleteKey(id: string) {
  deleteTargetId.value = id;
  deleteConfirmOpen.value = true;
}

async function confirmDeleteKey() {
  if (!deleteTargetId.value) return;
  deleting.value = true;
  deleteError.value = '';
  const id = deleteTargetId.value;
  try {
    await api.delete(`/connections/nsec-keys/${id}`);
    if (ui.defaultKeyId === id) ui.setDefaultKey(null);
    deleteConfirmOpen.value = false;
    deleteTargetId.value = null;
    await loadKeys();
  } catch (err) {
    deleteError.value = err instanceof Error ? err.message : 'Failed to delete key';
    deleteConfirmOpen.value = false;
    deleteErrorOpen.value = true;
  } finally {
    deleting.value = false;
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
      <div v-if="addMode === 'none'" class="flex gap-2">
        <Button @click="openAddMode('import')"> Import Key </Button>
        <Button variant="outline" @click="openAddMode('mnemonic')"> From Mnemonic (NIP-06) </Button>
      </div>
      <Button v-else variant="ghost" @click="closeAddMode"> Cancel </Button>
    </div>

    <!-- Import nsec form -->
    <Card v-if="addMode === 'import'" class="mb-6">
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

    <!-- NIP-06 mnemonic form -->
    <Card v-if="addMode === 'mnemonic'" class="mb-6">
      <h2 class="text-lg font-semibold mb-2">Add Key from Mnemonic (NIP-06)</h2>
      <p class="text-sm text-muted-foreground mb-4">
        Derive a Nostr key from a BIP-39 mnemonic seed phrase using the
        <a
          href="https://nips.nostr.com/6"
          target="_blank"
          rel="noopener noreferrer"
          class="text-primary hover:underline"
          >NIP-06</a
        >
        path <code class="text-primary">m/44'/1237'/&lt;account&gt;'/0/0</code>. The mnemonic is
        never sent to the server — only the derived hex key is stored.
      </p>
      <div class="space-y-3">
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label class="text-sm font-medium">Mnemonic seed phrase</label>
            <button
              class="text-xs text-primary hover:underline flex items-center gap-1 cursor-pointer"
              type="button"
              @click="handleGenerateMnemonic"
            >
              <RefreshCw class="w-3 h-3" />
              Generate random
            </button>
          </div>
          <textarea
            v-model="mnemonicInput"
            rows="3"
            placeholder="Enter 12 or 24 BIP-39 words separated by spaces…"
            class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>
        <div>
          <label class="text-sm font-medium mb-1.5 block">Account index</label>
          <Input v-model="mnemonicAccountStr" type="number" min="0" placeholder="0" class="w-24" />
          <p class="text-xs text-muted-foreground mt-1">
            Use 0 for the default key. Increment to derive additional keys from the same mnemonic.
          </p>
        </div>
        <div>
          <label class="text-sm font-medium mb-1.5 block">Label</label>
          <Input v-model="mnemonicLabel" placeholder="e.g. Main Identity, Bot Key..." />
        </div>
        <p v-if="mnemonicError" class="text-sm text-destructive">
          {{ mnemonicError }}
        </p>
        <Button
          :loading="mnemonicDeriving"
          :disabled="!mnemonicInput.trim()"
          @click="addKeyFromMnemonic"
        >
          Derive & Import Key
        </Button>
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
      <div class="flex gap-2 justify-center">
        <Button @click="openAddMode('import')"> Import key </Button>
        <Button variant="outline" @click="openAddMode('mnemonic')"> From mnemonic (NIP-06) </Button>
      </div>
    </div>

    <div v-else class="space-y-3">
      <p class="text-xs text-muted-foreground mb-1">
        Star a key to pre-select it when creating connections.
      </p>
      <Card
        v-for="key in keys"
        :key="key.id"
        :class="uiState.defaultKeyId === key.id ? 'border-primary/50' : ''"
      >
        <div class="flex items-center justify-between gap-4">
          <div class="flex-1 min-w-0">
            <!-- Rename mode -->
            <div v-if="renamingKeyId === key.id" class="flex items-center gap-2 mb-1">
              <Input
                v-model="renameLabel"
                class="h-7 text-sm py-0"
                @keydown.enter="saveRename(key.id)"
                @keydown.esc="cancelRename"
              />
              <Button size="sm" :loading="renaming" @click="saveRename(key.id)"> Save </Button>
              <Button size="sm" variant="ghost" @click="cancelRename"> Cancel </Button>
            </div>
            <div v-else class="flex items-center gap-2 mb-1">
              <h3 class="font-semibold">
                {{ key.label }}
              </h3>
              <Badge v-if="uiState.defaultKeyId === key.id" variant="default"> Default </Badge>
            </div>
            <p v-if="renamingKeyId === key.id && renameError" class="text-xs text-destructive mb-1">
              {{ renameError }}
            </p>
            <p class="text-xs text-muted-foreground truncate">
              <PubkeyDisplay :pubkey="key.publicKey" />
            </p>
            <p class="text-xs text-muted-foreground mt-1">Added {{ formatDate(key.createdAt) }}</p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button
              :title="uiState.defaultKeyId === key.id ? 'Unset as default' : 'Set as default'"
              class="p-1 rounded transition-colors cursor-pointer"
              :class="
                uiState.defaultKeyId === key.id
                  ? 'text-yellow-500'
                  : 'text-muted-foreground hover:text-yellow-500'
              "
              @click="setDefault(key.id)"
            >
              <Star :class="['w-5 h-5', uiState.defaultKeyId === key.id ? 'fill-current' : '']" />
            </button>
            <Button
              v-if="renamingKeyId !== key.id"
              variant="ghost"
              size="sm"
              @click="startRename(key)"
            >
              <Pencil class="w-4 h-4 mr-1.5 shrink-0" />
              Rename
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="text-destructive hover:text-destructive"
              @click="promptDeleteKey(key.id)"
            >
              <Trash2 class="w-4 h-4 mr-1.5 shrink-0" />
              Delete
            </Button>
          </div>
        </div>
      </Card>
    </div>
  </div>

  <!-- Delete confirmation dialog -->
  <AlertDialog v-model:open="deleteConfirmOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete key?</AlertDialogTitle>
        <AlertDialogDescription>
          This action cannot be undone. The key will be permanently removed.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive" @click.prevent="confirmDeleteKey">
          {{ deleting ? 'Deleting…' : 'Delete' }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <!-- Delete error dialog -->
  <AlertDialog v-model:open="deleteErrorOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Could not delete key</AlertDialogTitle>
        <AlertDialogDescription>{{ deleteError }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogAction @click="deleteErrorOpen = false"> OK </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
