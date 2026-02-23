<script setup lang="ts">
import { computed } from 'vue';
import { Bar } from 'vue-chartjs';
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  BarElement,
  CategoryScale,
  LinearScale,
  type ChartOptions,
} from 'chart.js';
import { getChartTheme, withAlpha } from './chartTheme';

ChartJS.register(Title, Tooltip, BarElement, CategoryScale, LinearScale);

const props = defineProps<{
  data: Record<string, number>;
}>();

const chartData = computed(() => {
  const theme = getChartTheme();
  const entries = Object.entries(props.data).sort((a, b) => b[1] - a[1]);
  return {
    labels: entries.map(([method]) => method),
    datasets: [
      {
        label: 'Calls (7d)',
        data: entries.map(([, count]) => count),
        backgroundColor: entries.map((_, i) =>
          withAlpha(theme.palette[i % theme.palette.length] ?? theme.primary, 0.8),
        ),
        borderColor: entries.map(
          (_, i) => theme.palette[i % theme.palette.length] ?? theme.primary,
        ),
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
      },
    ],
  };
});

const chartOptions = computed((): ChartOptions<'bar'> => {
  const theme = getChartTheme();
  return {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: theme.card,
        borderColor: theme.border,
        borderWidth: 1,
        titleColor: theme.foreground,
        bodyColor: theme.mutedFg,
        padding: 10,
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        min: 0,
        grid: { color: withAlpha(theme.border, 0.5), drawTicks: false },
        ticks: {
          color: theme.mutedFg,
          font: { size: 12 },
          padding: 8,
          stepSize: 1,
          maxTicksLimit: 5,
        },
        border: { display: false },
      },
      y: {
        grid: { display: false },
        ticks: { color: theme.foreground, font: { size: 12, family: 'monospace' }, padding: 8 },
        border: { display: false },
      },
    },
  };
});

const barHeight = computed(() => {
  const count = Object.keys(props.data).length;
  return Math.max(160, count * 44);
});
</script>

<template>
  <div :style="{ height: barHeight + 'px' }">
    <Bar :data="chartData" :options="chartOptions" />
  </div>
</template>
