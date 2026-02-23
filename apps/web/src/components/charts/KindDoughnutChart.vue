<script setup lang="ts">
import { computed } from 'vue';
import { Doughnut } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, ArcElement, type ChartOptions } from 'chart.js';
import { getChartTheme, withAlpha } from './chartTheme';

ChartJS.register(Title, Tooltip, Legend, ArcElement);

const props = defineProps<{
  data: Record<string, number>;
}>();

const total = computed(() => Object.values(props.data).reduce((s, n) => s + n, 0));

const chartData = computed(() => {
  const theme = getChartTheme();
  const entries = Object.entries(props.data).sort((a, b) => b[1] - a[1]);
  return {
    labels: entries.map(([kind]) => `Kind ${kind}`),
    datasets: [
      {
        data: entries.map(([, count]) => count),
        backgroundColor: entries.map((_, i) =>
          withAlpha(theme.palette[i % theme.palette.length] ?? theme.primary, 0.85),
        ),
        borderColor: entries.map(
          (_, i) => theme.palette[i % theme.palette.length] ?? theme.primary,
        ),
        borderWidth: 1.5,
        hoverOffset: 6,
      },
    ],
  };
});

const chartOptions = computed((): ChartOptions<'doughnut'> => {
  const theme = getChartTheme();
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    plugins: {
      legend: {
        position: 'right',
        labels: {
          color: theme.mutedFg,
          font: { size: 12 },
          padding: 16,
          usePointStyle: true,
          pointStyleWidth: 8,
        },
      },
      tooltip: {
        backgroundColor: theme.card,
        borderColor: theme.border,
        borderWidth: 1,
        titleColor: theme.foreground,
        bodyColor: theme.mutedFg,
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          label: (ctx) => {
            const pct = total.value > 0 ? ((ctx.parsed / total.value) * 100).toFixed(1) : '0';
            return ` ${ctx.parsed} calls (${pct}%)`;
          },
        },
      },
    },
  };
});
</script>

<template>
  <div class="h-52">
    <Doughnut :data="chartData" :options="chartOptions" />
  </div>
</template>
