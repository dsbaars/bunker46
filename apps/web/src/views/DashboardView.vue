<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Activity, Link2, PenLine, BarChart3 } from 'lucide-vue-next';
import { api } from '@/lib/api';
import { useFormatting } from '@/composables/useFormatting';
import { useActivityStream } from '@/composables/useActivityStream';
import type { DashboardStatsDto } from '@bunker46/shared-types';
import StatCard from '@/components/ui/StatCard.vue';
import Card from '@/components/ui/Card.vue';
import Badge from '@/components/ui/Badge.vue';

const stats = ref<DashboardStatsDto | null>(null);
const loading = ref(true);
const { formatDateTime } = useFormatting();

async function loadStats() {
  try {
    stats.value = await api.get<DashboardStatsDto>('/dashboard/stats');
  } catch {
    // stats will remain null
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadStats();
});

useActivityStream(() => {
  loadStats();
});

function resultBadgeVariant(result: string) {
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
    <h1 class="text-2xl font-bold mb-6">Dashboard</h1>

    <div v-if="loading" class="text-muted-foreground">Loading statistics...</div>

    <template v-else-if="stats">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Active Sessions"
          :value="stats.activeSessions"
          tooltip="Logged-in sessions (browsers or devices) that have not expired. Each login or token refresh can create a session; logging out removes it."
        >
          <template #icon>
            <Activity class="w-5 h-5 text-muted-foreground shrink-0" />
          </template>
        </StatCard>
        <StatCard
          title="Active Connections"
          :value="stats.activeConnections"
          :description="`${stats.totalConnections} total`"
          tooltip="NIP-46 clients (apps or bunkers) that have connected and are currently active. Total includes all connections (active, pending, or revoked)."
        >
          <template #icon>
            <Link2 class="w-5 h-5 text-muted-foreground shrink-0" />
          </template>
        </StatCard>
        <StatCard
          title="Actions (24h)"
          :value="stats.signingActions24h"
          tooltip="Number of signing actions (e.g. sign_event, encrypt) performed by your connections in the last 24 hours."
        >
          <template #icon>
            <PenLine class="w-5 h-5 text-muted-foreground shrink-0" />
          </template>
        </StatCard>
        <StatCard
          title="Actions (7d)"
          :value="stats.signingActions7d"
          tooltip="Number of signing actions performed by your connections in the last 7 days."
        >
          <template #icon>
            <BarChart3 class="w-5 h-5 text-muted-foreground shrink-0" />
          </template>
        </StatCard>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h2 class="text-lg font-semibold mb-4">Signing by Method</h2>
          <div
            v-if="Object.keys(stats.signingByMethod).length === 0"
            class="text-sm text-muted-foreground"
          >
            No signing activity yet
          </div>
          <div v-else class="space-y-3">
            <div
              v-for="(count, method) in stats.signingByMethod"
              :key="method"
              class="flex items-center justify-between"
            >
              <span class="text-sm font-mono">{{ method }}</span>
              <span class="text-sm font-semibold">{{ count }}</span>
            </div>
          </div>
        </Card>

        <Card>
          <h2 class="text-lg font-semibold mb-4">Signing by Event Kind</h2>
          <div
            v-if="Object.keys(stats.signingByKind).length === 0"
            class="text-sm text-muted-foreground"
          >
            No event signing yet
          </div>
          <div v-else class="space-y-3">
            <div
              v-for="(count, kind) in stats.signingByKind"
              :key="kind"
              class="flex items-center justify-between"
            >
              <span class="text-sm">Kind {{ kind }}</span>
              <span class="text-sm font-semibold">{{ count }}</span>
            </div>
          </div>
        </Card>
      </div>

      <Card class="mt-6">
        <h2 class="text-lg font-semibold mb-4">Recent Activity</h2>
        <div v-if="stats.recentActivity.length === 0" class="text-sm text-muted-foreground">
          No recent activity
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-border text-muted-foreground">
                <th class="text-left py-2 pr-4">Connection</th>
                <th class="text-left py-2 pr-4">Method</th>
                <th class="text-left py-2 pr-4">Result</th>
                <th class="text-left py-2">Time</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in stats.recentActivity"
                :key="item.id"
                class="border-b border-border/50"
              >
                <td class="py-2.5 pr-4 font-medium">
                  {{ item.connectionName }}
                </td>
                <td class="py-2.5 pr-4 font-mono text-xs">
                  {{ item.method }}
                </td>
                <td class="py-2.5 pr-4">
                  <Badge :variant="resultBadgeVariant(item.result)">
                    {{ item.result }}
                  </Badge>
                </td>
                <td class="py-2.5 text-muted-foreground">
                  {{ formatDateTime(item.timestamp) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </template>

    <Card v-else>
      <p class="text-muted-foreground">Failed to load dashboard statistics.</p>
    </Card>
  </div>
</template>
