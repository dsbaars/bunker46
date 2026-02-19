<script setup lang="ts">
import { TooltipContent, TooltipPortal } from 'radix-vue';
import { cn } from '@/lib/utils';

withDefaults(
  defineProps<{
    side?: 'top' | 'right' | 'bottom' | 'left';
    class?: string;
  }>(),
  { side: 'top', class: '' },
);
</script>

<template>
  <TooltipPortal>
    <TooltipContent
      :side="side"
      :class="
        cn(
          'z-50 overflow-hidden rounded-md border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md',
          'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          $props.class,
        )
      "
    >
      <slot />
    </TooltipContent>
  </TooltipPortal>
</template>
