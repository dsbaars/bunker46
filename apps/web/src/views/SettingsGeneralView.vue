<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/lib/api';
import { useSettingsStore } from '@/stores/settings';
import { formatDate as fmtDate, formatTime as fmtTime } from '@/lib/formatting';
import type { UserSettingsDto } from '@bunker46/shared-types';
import Card from '@/components/ui/Card.vue';
import Button from '@/components/ui/Button.vue';

const settingsStore = useSettingsStore();

const dateFormat = ref('MM/DD/YYYY');
const timeFormat = ref('12h');
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const success = ref('');

const dateFormats = [
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY  (e.g. 02/19/2026)' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY  (e.g. 19/02/2026)' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD  (e.g. 2026-02-19)' },
];

const timeFormats = [
  { value: '12h', label: '12-hour  (e.g. 3:45 PM)' },
  { value: '24h', label: '24-hour  (e.g. 15:45)' },
];

onMounted(async () => {
  loading.value = true;
  try {
    const settings = await api.get<UserSettingsDto>('/users/me/settings');
    dateFormat.value = settings.dateFormat;
    timeFormat.value = settings.timeFormat;
  } catch {
    // use defaults
  } finally {
    loading.value = false;
  }
});

async function save() {
  error.value = '';
  success.value = '';
  saving.value = true;
  try {
    await api.patch('/users/me/settings', {
      dateFormat: dateFormat.value,
      timeFormat: timeFormat.value,
    });
    settingsStore.set({ dateFormat: dateFormat.value, timeFormat: timeFormat.value });
    success.value = 'Preferences saved.';
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save settings';
  } finally {
    saving.value = false;
  }
}

function previewDate(): string {
  return fmtDate(new Date().toISOString(), dateFormat.value);
}

function previewTime(): string {
  return fmtTime(new Date().toISOString(), timeFormat.value);
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold mb-6">
      General Settings
    </h1>

    <div
      v-if="loading"
      class="text-sm text-muted-foreground"
    >
      Loading…
    </div>

    <div
      v-else
      class="space-y-6 max-w-lg"
    >
      <Card>
        <h2 class="text-lg font-semibold mb-1">
          Date &amp; Time Format
        </h2>
        <p class="text-sm text-muted-foreground mb-5">
          Choose how dates and times are displayed across the app.
        </p>

        <div class="space-y-5">
          <!-- Date format -->
          <div>
            <label class="text-sm font-medium mb-2 block">Date Format</label>
            <div class="space-y-2">
              <label
                v-for="opt in dateFormats"
                :key="opt.value"
                class="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer transition-colors"
                :class="
                  dateFormat === opt.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                "
              >
                <input
                  v-model="dateFormat"
                  type="radio"
                  :value="opt.value"
                  class="accent-primary"
                >
                <span class="text-sm font-mono">{{ opt.label }}</span>
              </label>
            </div>
          </div>

          <!-- Time format -->
          <div>
            <label class="text-sm font-medium mb-2 block">Time Format</label>
            <div class="space-y-2">
              <label
                v-for="opt in timeFormats"
                :key="opt.value"
                class="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer transition-colors"
                :class="
                  timeFormat === opt.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                "
              >
                <input
                  v-model="timeFormat"
                  type="radio"
                  :value="opt.value"
                  class="accent-primary"
                >
                <span class="text-sm font-mono">{{ opt.label }}</span>
              </label>
            </div>
          </div>

          <!-- Preview -->
          <div class="rounded-lg bg-muted/50 p-4">
            <p class="text-xs text-muted-foreground mb-1">
              Preview
            </p>
            <p class="text-sm font-mono">
              {{ previewDate() }} · {{ previewTime() }}
            </p>
          </div>

          <div class="flex items-center gap-3">
            <Button
              :loading="saving"
              @click="save"
            >
              Save Preferences
            </Button>
            <p
              v-if="success"
              class="text-sm text-green-600 dark:text-green-400"
            >
              {{ success }}
            </p>
            <p
              v-if="error"
              class="text-sm text-destructive"
            >
              {{ error }}
            </p>
          </div>
        </div>
      </Card>
    </div>
  </div>
</template>
