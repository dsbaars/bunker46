<script setup lang="ts">
import { HelpCircle } from 'lucide-vue-next';
import Card from './Card.vue';
import TooltipRoot from './tooltip/TooltipRoot.vue';
import TooltipTrigger from './tooltip/TooltipTrigger.vue';
import TooltipContent from './tooltip/TooltipContent.vue';

defineProps<{
  title: string;
  value: string | number;
  description?: string;
  tooltip?: string;
}>();
</script>

<template>
  <Card>
    <div class="flex flex-row items-center justify-between space-y-0 pb-2">
      <div class="flex items-center gap-1.5">
        <h3 class="text-sm font-medium text-muted-foreground">
          {{ title }}
        </h3>
        <TooltipRoot v-if="tooltip">
          <TooltipTrigger as-child>
            <span class="inline-flex text-muted-foreground cursor-help">
              <HelpCircle class="w-3.5 h-3.5 shrink-0" />
            </span>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            class="max-w-[240px]"
          >
            <p class="leading-relaxed">
              {{ tooltip }}
            </p>
          </TooltipContent>
        </TooltipRoot>
      </div>
      <slot name="icon" />
    </div>
    <div class="text-2xl font-bold">
      {{ value }}
    </div>
    <p
      v-if="description"
      class="text-xs text-muted-foreground mt-1"
    >
      {{ description }}
    </p>
  </Card>
</template>
