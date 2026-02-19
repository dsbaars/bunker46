<script setup lang="ts">
import { RouterView } from 'vue-router';
import AppLayout from './components/layout/AppLayout.vue';
import TooltipProvider from './components/ui/tooltip/TooltipProvider.vue';
</script>

<template>
  <TooltipProvider>
    <AppLayout>
      <RouterView />
    </AppLayout>
  </TooltipProvider>
</template>
