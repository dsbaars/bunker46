<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/lib/api';
import { useFormatting } from '@/composables/useFormatting';
import Card from '@/components/ui/Card.vue';
import Badge from '@/components/ui/Badge.vue';
import Button from '@/components/ui/Button.vue';

const route = useRoute();
const router = useRouter();

interface Log {
  id: string;
  method: string;
  eventKind?: number;
  result: string;
  durationMs: number;
  errorMessage?: string;
  createdAt: string;
}

const logs = ref<Log[]>([]);
const total = ref(0);
const page = ref(1);
const loading = ref(true);
const { formatDateTime } = useFormatting();

async function loadLogs() {
  loading.value = true;
  try {
    const res = await api.get<{ data: Log[]; total: number }>(
      `/connections/${route.params.id}/logs?page=${page.value}&limit=20`,
    );
    logs.value = res.data;
    total.value = res.total;
  } catch {
    // empty
  } finally {
    loading.value = false;
  }
}

onMounted(loadLogs);

function resultVariant(result: string) {
  switch (result) {
    case 'APPROVED':
      return 'success' as const;
    case 'DENIED':
      return 'destructive' as const;
    default:
      return 'secondary' as const;
  }
}
</script>

<template>
  <div>
    <div class="flex items-center gap-3 mb-6">
      <button
        class="text-muted-foreground hover:text-foreground cursor-pointer"
        @click="router.push(`/connections/${route.params.id}`)"
      >
        ← Back to Connection
      </button>
    </div>

    <h1 class="text-2xl font-bold mb-6">Signing Logs</h1>

    <Card>
      <div v-if="loading" class="text-muted-foreground">Loading logs...</div>

      <div v-else-if="logs.length === 0" class="text-center py-8 text-muted-foreground">
        No logs yet. Enable logging on this connection to start recording.
      </div>

      <div v-else>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-border text-muted-foreground">
                <th class="text-left py-2 pr-4">Method</th>
                <th class="text-left py-2 pr-4">Kind</th>
                <th class="text-left py-2 pr-4">Result</th>
                <th class="text-left py-2 pr-4">Duration</th>
                <th class="text-left py-2">Time</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="log in logs" :key="log.id" class="border-b border-border/50">
                <td class="py-2.5 pr-4 font-mono text-xs">
                  {{ log.method }}
                </td>
                <td class="py-2.5 pr-4">
                  {{ log.eventKind ?? '-' }}
                </td>
                <td class="py-2.5 pr-4">
                  <Badge :variant="resultVariant(log.result)">
                    {{ log.result }}
                  </Badge>
                </td>
                <td class="py-2.5 pr-4 text-muted-foreground">{{ log.durationMs }}ms</td>
                <td class="py-2.5 text-muted-foreground">
                  {{ formatDateTime(log.createdAt) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="flex items-center justify-between mt-4 pt-4 border-t border-border">
          <span class="text-sm text-muted-foreground">{{ total }} total logs</span>
          <div class="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              :disabled="page <= 1"
              @click="
                page--;
                loadLogs();
              "
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              :disabled="logs.length < 20"
              @click="
                page++;
                loadLogs();
              "
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </Card>
  </div>
</template>
