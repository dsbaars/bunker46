<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { QrCode } from 'lucide-vue-next';
import { hexToNpub } from '@/lib/pubkey';

const props = withDefaults(
  defineProps<{
    /** Hex public key (64 chars). */
    pubkey: string;
    /** Truncate for compact display (e.g. in lists). */
    truncate?: boolean;
  }>(),
  { truncate: false },
);

const showHex = ref(false);
const npub = ref('');
const npubError = ref(false);
const showQr = ref(false);
const qrDataUrl = ref('');

// Resolve npub when pubkey is set
async function resolveNpub() {
  if (!props.pubkey || !/^[0-9a-f]{64}$/i.test(props.pubkey)) {
    npub.value = '';
    npubError.value = true;
    return;
  }
  npubError.value = false;
  try {
    npub.value = await hexToNpub(props.pubkey.toLowerCase());
  } catch {
    npub.value = '';
    npubError.value = true;
  }
}
watch(() => props.pubkey, resolveNpub, { immediate: true });

const displayValue = computed(() => {
  if (showHex.value) {
    const h = props.pubkey;
    if (props.truncate && h.length === 64) return `${h.slice(0, 8)}...${h.slice(-8)}`;
    return h;
  }
  const n = npub.value;
  if (props.truncate && n.length > 20) return `${n.slice(0, 12)}...${n.slice(-8)}`;
  return n;
});

const fullValue = computed(() => (showHex.value ? props.pubkey : npub.value));

const copyTitle = computed(() => (showHex.value ? 'Click to show npub' : 'Click to show hex'));

// QR code for current full value
watch(
  [showQr, fullValue],
  async ([visible, value]) => {
    if (!visible || !value) {
      qrDataUrl.value = '';
      return;
    }
    try {
      const qrcode = await import('qrcode');
      qrDataUrl.value = await qrcode.toDataURL(value, {
        width: 256,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
    } catch {
      qrDataUrl.value = '';
    }
  },
  { immediate: true },
);

function toggleDisplay() {
  if (npubError.value) return;
  showHex.value = !showHex.value;
}

function openQr() {
  showQr.value = true;
}
function closeQr() {
  showQr.value = false;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && showQr.value) closeQr();
}
watch(showQr, (open) => {
  if (open) window.addEventListener('keydown', onKeydown);
  else window.removeEventListener('keydown', onKeydown);
});
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <span class="inline-flex items-center gap-1.5">
    <button
      type="button"
      class="font-mono text-left cursor-pointer hover:underline focus:outline-none focus:underline rounded"
      :title="copyTitle"
      :class="npubError ? 'cursor-default' : ''"
      :disabled="npubError"
      @click="toggleDisplay"
    >
      {{ npubError ? pubkey : displayValue }}
    </button>
    <button
      type="button"
      class="p-0.5 rounded text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      title="Show QR code"
      @click="openQr"
    >
      <QrCode class="w-4 h-4" />
    </button>
  </span>

  <!-- QR modal -->
  <Teleport to="body">
    <div
      v-if="showQr"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="QR code"
      @click.self="closeQr"
      @keydown.escape="closeQr"
    >
      <div
        class="bg-card border border-border rounded-lg shadow-lg p-4 flex flex-col items-center gap-3"
        @keydown.escape="closeQr"
      >
        <p class="text-sm text-muted-foreground font-mono break-all text-center max-w-[280px]">
          {{ showHex ? 'Hex pubkey' : 'npub' }}
        </p>
        <img
          v-if="qrDataUrl"
          :src="qrDataUrl"
          alt="QR code"
          class="w-64 h-64 rounded border border-border bg-white"
        />
        <p class="text-xs text-muted-foreground font-mono break-all text-center max-w-[280px]">
          {{ fullValue }}
        </p>
        <button
          type="button"
          class="text-sm text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring rounded px-2 py-1"
          @click="closeQr"
        >
          Close
        </button>
      </div>
    </div>
  </Teleport>
</template>
