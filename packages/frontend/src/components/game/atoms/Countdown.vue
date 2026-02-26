<script setup lang="ts">
defineProps<{
  secondsLeft: number
  totalSeconds: number
}>()
</script>

<template>
  <div class="fixed top-0 left-0 right-0 z-50 h-0.5 bg-transparent">
    <div
      class="h-full transition-[width] duration-1000 ease-linear origin-left"
      :class="secondsLeft <= 10 ? 'bg-red-500' : 'bg-yellow-400'"
      :style="{ width: `${(secondsLeft / totalSeconds) * 100}%` }"
    />
  </div>
</template>
