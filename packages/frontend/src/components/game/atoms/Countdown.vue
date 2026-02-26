<script setup lang="ts">
defineProps<{
  secondsLeft: number
  totalSeconds: number
}>()
</script>

<template>
  <div class="flex items-center gap-2">
    <div class="flex-1 bg-gray-700 rounded-full h-2">
      <div
        class="h-2 rounded-full transition-all"
        :class="secondsLeft <= 10 ? 'bg-red-500' : 'bg-yellow-400'"
        :style="{ width: `${(secondsLeft / totalSeconds) * 100}%` }"
      />
    </div>
    <span class="text-sm font-mono" :class="secondsLeft <= 10 ? 'text-red-400' : 'text-gray-300'">
      {{ secondsLeft }}s
    </span>
  </div>
</template>
