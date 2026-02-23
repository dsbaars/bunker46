<script setup lang="ts">
import { AlertDialogTrigger } from 'reka-ui';
</script>

<template>
  <AlertDialogTrigger as-child>
    <slot />
  </AlertDialogTrigger>
</template>
