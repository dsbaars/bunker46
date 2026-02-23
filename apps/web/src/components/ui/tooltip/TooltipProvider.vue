<script setup lang="ts">
import { TooltipProvider as TooltipProviderPrimitive } from 'reka-ui';
</script>

<template>
  <TooltipProviderPrimitive :delay-duration="200">
    <slot />
  </TooltipProviderPrimitive>
</template>
