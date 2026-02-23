<script setup lang="ts">
import { computed } from 'vue';
import { Line } from 'vue-chartjs';
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Filler,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  type ChartOptions,
} from 'chart.js';
import { getChartTheme, withAlpha } from './chartTheme';

ChartJS.register(Title, Tooltip, Filler, LineElement, PointElement, CategoryScale, LinearScale);

const props = defineProps<{
  data: Array<{ label: string; count: number }>;
}>();

const chartData = computed(() => {
  const theme = getChartTheme();
  return {
    labels: props.data.map((d) => d.label),
    datasets: [
      {
        label: 'Signing actions',
        data: props.data.map((d) => d.count),
        borderColor: theme.primary,
        backgroundColor: withAlpha(theme.primary, 0.15),
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: theme.primary,
        pointBorderColor: theme.card,
        pointBorderWidth: 2,
        borderWidth: 2,
      },
    ],
  };
});

const chartOptions = computed((): ChartOptions<'line'> => {
  const theme = getChartTheme();
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
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
        callbacks: {
          title: (items) => {
            const item = items[0];
            if (!item) return '';
            return props.data[item.dataIndex]?.label ?? item.label;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { color: withAlpha(theme.border, 0.5), drawTicks: false },
        ticks: { color: theme.mutedFg, font: { size: 12 }, padding: 8 },
        border: { display: false },
      },
      y: {
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
    },
  };
});
</script>

<template>
  <div class="h-48">
    <Line :data="chartData" :options="chartOptions" />
  </div>
</template>
