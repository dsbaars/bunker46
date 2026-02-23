<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Activity, Link2, PenLine, BarChart3, ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { api } from '@/lib/api';
import { useFormatting } from '@/composables/useFormatting';
import { useActivityStream } from '@/composables/useActivityStream';
import type {
  DashboardStatsDto,
  ActivityLogEntry,
  PaginatedResponse,
} from '@bunker46/shared-types';
import StatCard from '@/components/ui/StatCard.vue';
import Card from '@/components/ui/Card.vue';
import Badge from '@/components/ui/Badge.vue';
import Button from '@/components/ui/Button.vue';
import ActivityLineChart from '@/components/charts/ActivityLineChart.vue';
import MethodBarChart from '@/components/charts/MethodBarChart.vue';
import KindDoughnutChart from '@/components/charts/KindDoughnutChart.vue';

type ChartRange = '1h' | '24h' | '7d';
const RANGES: ChartRange[] = ['1h', '24h', '7d'];

const stats = ref<DashboardStatsDto | null>(null);
const loading = ref(true);
const chartLoading = ref(false);
const chartRange = ref<ChartRange>('7d');
const { formatDateTime } = useFormatting();

// --- Activity feed state ---
const activityData = ref<ActivityLogEntry[]>([]);
const activityPage = ref(1);
const activityTotalPages = ref(1);
const activityTotal = ref(0);
const activityLoading = ref(false);
const filterConnection = ref('');
const filterMethod = ref('');

async function loadStats(range: ChartRange = chartRange.value, isRangeSwitch = false) {
  if (isRangeSwitch) chartLoading.value = true;
  else loading.value = true;
  try {
    stats.value = await api.get<DashboardStatsDto>(`/dashboard/stats?range=${range}`);
  } catch {
    /* stats stays null */
  } finally {
    loading.value = false;
    chartLoading.value = false;
  }
}

async function loadActivity() {
  activityLoading.value = true;
  try {
    const params = new URLSearchParams({ page: String(activityPage.value), limit: '15' });
    if (filterConnection.value) params.set('connection', filterConnection.value);
    if (filterMethod.value) params.set('method', filterMethod.value);
    const res = await api.get<PaginatedResponse<ActivityLogEntry>>(`/dashboard/activity?${params}`);
    activityData.value = res.data;
    activityTotalPages.value = res.totalPages;
    activityTotal.value = res.total;
  } catch {
    activityData.value = [];
  } finally {
    activityLoading.value = false;
  }
}

async function selectRange(range: ChartRange) {
  chartRange.value = range;
  await loadStats(range, true);
}

function applyFilters() {
  activityPage.value = 1;
  loadActivity();
}

function prevPage() {
  if (activityPage.value > 1) {
    activityPage.value--;
    loadActivity();
  }
}

function nextPage() {
  if (activityPage.value < activityTotalPages.value) {
    activityPage.value++;
    loadActivity();
  }
}

onMounted(async () => {
  await Promise.all([loadStats(), loadActivity()]);
});

useActivityStream(() => {
  loadStats();
  loadActivity();
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

function rangeDescription(r: ChartRange) {
  return r === '1h' ? 'Last hour (5-min buckets)' : r === '24h' ? 'Last 24 hours' : 'Last 7 days';
}

function rangeShort(r: ChartRange) {
  return r === '1h' ? 'Last hour' : r === '24h' ? 'Last 24h' : 'Last 7d';
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold mb-6">Dashboard</h1>

    <div v-if="loading" class="text-muted-foreground">Loading statistics...</div>

    <template v-else-if="stats">
      <!-- Stat cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Active Sessions"
          :value="stats.activeSessions"
          tooltip="Logged-in sessions that have not expired."
        >
          <template #icon>
            <Activity class="w-5 h-5 text-muted-foreground shrink-0" />
          </template>
        </StatCard>
        <StatCard
          title="Active Connections"
          :value="stats.activeConnections"
          :description="`${stats.totalConnections} total`"
          tooltip="NIP-46 clients currently active."
        >
          <template #icon>
            <Link2 class="w-5 h-5 text-muted-foreground shrink-0" />
          </template>
        </StatCard>
        <StatCard
          title="Actions (24h)"
          :value="stats.signingActions24h"
          tooltip="Signing actions in the last 24 hours."
        >
          <template #icon>
            <PenLine class="w-5 h-5 text-muted-foreground shrink-0" />
          </template>
        </StatCard>
        <StatCard
          title="Actions (7d)"
          :value="stats.signingActions7d"
          tooltip="Signing actions in the last 7 days."
        >
          <template #icon>
            <BarChart3 class="w-5 h-5 text-muted-foreground shrink-0" />
          </template>
        </StatCard>
      </div>

      <!-- Two-column layout: charts left, activity right -->
      <div class="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6">
        <!-- LEFT: Charts -->
        <div class="space-y-6 min-w-0">
          <!-- Range selector -->
          <div class="flex items-center justify-end gap-1">
            <span class="text-xs text-muted-foreground mr-2">View:</span>
            <button
              v-for="r in RANGES"
              :key="r"
              :class="[
                'px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer',
                chartRange === r
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              ]"
              @click="selectRange(r)"
            >
              {{ r }}
            </button>
          </div>

          <div
            :class="[
              'transition-opacity duration-200',
              chartLoading ? 'opacity-40 pointer-events-none' : '',
            ]"
          >
            <!-- Activity over time -->
            <Card class="mb-6">
              <div class="flex items-center justify-between mb-4">
                <h2 class="text-lg font-semibold">Signing Activity</h2>
                <span class="text-xs text-muted-foreground">{{
                  rangeDescription(chartRange)
                }}</span>
              </div>
              <div
                v-if="stats.activityBuckets.every((d) => d.count === 0)"
                class="text-sm text-muted-foreground py-6 text-center"
              >
                No signing activity in this period
              </div>
              <ActivityLineChart v-else :data="stats.activityBuckets" />
            </Card>

            <!-- Method + Kind side by side -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <div class="flex items-center justify-between mb-4">
                  <h2 class="text-lg font-semibold">By Method</h2>
                  <span class="text-xs text-muted-foreground">{{ rangeShort(chartRange) }}</span>
                </div>
                <div
                  v-if="Object.keys(stats.signingByMethod).length === 0"
                  class="text-sm text-muted-foreground py-6 text-center"
                >
                  No signing activity
                </div>
                <MethodBarChart v-else :data="stats.signingByMethod" />
              </Card>

              <Card>
                <div class="flex items-center justify-between mb-4">
                  <h2 class="text-lg font-semibold">By Event Kind</h2>
                  <span class="text-xs text-muted-foreground">{{ rangeShort(chartRange) }}</span>
                </div>
                <div
                  v-if="Object.keys(stats.signingByKind).length === 0"
                  class="text-sm text-muted-foreground py-6 text-center"
                >
                  No event signing
                </div>
                <KindDoughnutChart v-else :data="stats.signingByKind" />
              </Card>
            </div>
          </div>
        </div>

        <!-- RIGHT: Activity feed -->
        <Card class="h-fit">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold">Recent Activity</h2>
            <span class="text-xs text-muted-foreground">{{ activityTotal }} total</span>
          </div>

          <!-- Filters -->
          <div class="flex gap-2 mb-4">
            <select
              v-model="filterConnection"
              class="flex-1 min-w-0 rounded-lg border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring truncate"
              @change="applyFilters"
            >
              <option value="">All connections</option>
              <option v-for="name in stats.connectionNames" :key="name" :value="name">
                {{ name }}
              </option>
            </select>
            <select
              v-model="filterMethod"
              class="flex-1 min-w-0 rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring truncate"
              @change="applyFilters"
            >
              <option value="">All methods</option>
              <option v-for="m in stats.methods" :key="m" :value="m">
                {{ m }}
              </option>
            </select>
          </div>

          <!-- List -->
          <div :class="['transition-opacity duration-150', activityLoading ? 'opacity-40' : '']">
            <div
              v-if="activityData.length === 0"
              class="text-sm text-muted-foreground py-6 text-center"
            >
              No activity found
            </div>
            <div v-else class="divide-y divide-border/50">
              <div
                v-for="item in activityData"
                :key="item.id"
                class="py-2.5 flex items-start justify-between gap-3"
              >
                <div class="min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <Badge :variant="resultBadgeVariant(item.result)" class="text-[10px]">
                      {{ item.result }}
                    </Badge>
                    <span class="text-xs font-mono truncate">
                      {{ item.method }}{{ item.eventKind != null ? `:${item.eventKind}` : '' }}
                    </span>
                  </div>
                  <p class="text-xs text-muted-foreground mt-0.5 truncate">
                    {{ item.connectionName }}
                  </p>
                </div>
                <span class="text-[11px] text-muted-foreground shrink-0 whitespace-nowrap">
                  {{ formatDateTime(item.timestamp) }}
                </span>
              </div>
            </div>
          </div>

          <!-- Pagination -->
          <div
            v-if="activityTotalPages > 1"
            class="flex items-center justify-between mt-4 pt-3 border-t border-border"
          >
            <span class="text-xs text-muted-foreground">
              Page {{ activityPage }} of {{ activityTotalPages }}
            </span>
            <div class="flex gap-1">
              <Button variant="outline" size="sm" :disabled="activityPage <= 1" @click="prevPage">
                <ChevronLeft class="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                :disabled="activityPage >= activityTotalPages"
                @click="nextPage"
              >
                <ChevronRight class="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </template>

    <Card v-else>
      <p class="text-muted-foreground">Failed to load dashboard statistics.</p>
    </Card>
  </div>
</template>
