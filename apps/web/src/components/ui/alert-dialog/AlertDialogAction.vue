<script setup lang="ts">
import { AlertDialogAction } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = withDefaults(
  defineProps<{
    variant?: 'default' | 'destructive';
    class?: string;
  }>(),
  { variant: 'default' },
);
</script>

<template>
  <AlertDialogAction as-child>
    <button
      :class="
        cn(
          'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-9 px-4 py-2 cursor-pointer',
          props.variant === 'destructive'
            ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
            : 'bg-primary text-primary-foreground hover:bg-primary/90',
          props.class,
        )
      "
    >
      <slot>Continue</slot>
    </button>
  </AlertDialogAction>
</template>
