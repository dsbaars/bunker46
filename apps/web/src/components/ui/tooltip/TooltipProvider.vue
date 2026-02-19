<script setup lang="ts">
import { TooltipProvider as TooltipProviderPrimitive } from 'radix-vue';
</script>

<template>
  <TooltipProviderPrimitive :delay-duration="200">
    <slot />
  </TooltipProviderPrimitive>
</template>
