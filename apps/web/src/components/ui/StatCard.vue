<script setup lang="ts">
import Card from './Card.vue';

defineProps<{
  title: string;
  value: string | number;
  description?: string;
}>();
</script>

<template>
  <Card>
    <div class="flex flex-row items-center justify-between space-y-0 pb-2">
      <h3 class="text-sm font-medium text-muted-foreground">
        {{ title }}
      </h3>
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
