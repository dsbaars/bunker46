<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '@/lib/utils';

const props = withDefaults(
  defineProps<{ variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' }>(),
  { variant: 'default' },
);

const classes = computed(() =>
  cn(
    'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
    {
      'border-transparent bg-primary text-primary-foreground': props.variant === 'default',
      'border-transparent bg-secondary text-secondary-foreground': props.variant === 'secondary',
      'border-transparent bg-destructive text-destructive-foreground':
        props.variant === 'destructive',
      'text-foreground': props.variant === 'outline',
      'border-transparent bg-success text-primary-foreground': props.variant === 'success',
    },
  ),
);
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
