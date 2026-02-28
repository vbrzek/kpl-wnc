<script setup lang="ts">
import Avatar from '../../Avatar.vue';

defineProps<{
  entries: { id: string; nickname: string; score: number }[]
}>()
</script>

<template>
  <div class="flex items-end justify-center gap-4">
    <!-- 2nd place -->
    <div v-if="entries[1]" class="text-center podium-entry" style="animation-delay: 300ms">
      <div class="bg-gray-600 rounded-t-lg px-4 py-6 w-24">
        <div class="flex justify-center mb-2">
          <Avatar :nickname="entries[1].nickname" :size="36" />
        </div>
        <p class="font-bold truncate">{{ entries[1].nickname }}</p>
        <p class="text-2xl font-bold text-gray-300">{{ entries[1].score }}</p>
      </div>
      <div class="bg-gray-500 text-center py-1 rounded-b-sm text-sm">2.</div>
    </div>

    <!-- 1st place -->
    <div v-if="entries[0]" class="text-center podium-entry podium-first" style="animation-delay: 700ms">
      <div class="bg-yellow-700 rounded-t-lg px-4 py-8 w-28">
        <div class="flex justify-center mb-2">
          <Avatar :nickname="entries[0].nickname" :size="48" />
        </div>
        <p class="font-bold truncate">{{ entries[0].nickname }}</p>
        <p class="text-2xl font-bold text-yellow-300">{{ entries[0].score }}</p>
      </div>
      <div class="bg-yellow-600 text-center py-1 rounded-b-sm text-sm font-bold">1.</div>
    </div>

    <!-- 3rd place -->
    <div v-if="entries[2]" class="text-center podium-entry" style="animation-delay: 100ms">
      <div class="bg-gray-700 rounded-t-lg px-4 py-4 w-24">
        <div class="flex justify-center mb-2">
          <Avatar :nickname="entries[2].nickname" :size="36" />
        </div>
        <p class="font-bold truncate">{{ entries[2].nickname }}</p>
        <p class="text-2xl font-bold text-gray-400">{{ entries[2].score }}</p>
      </div>
      <div class="bg-gray-600 text-center py-1 rounded-b-sm text-sm">3.</div>
    </div>
  </div>
</template>

<style scoped>
.podium-entry {
  animation: podium-rise 0.5s ease-out both;
}
.podium-first {
  animation: podium-rise-bounce 0.6s ease-out both;
}

@keyframes podium-rise {
  from { transform: translateY(40px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}

@keyframes podium-rise-bounce {
  0%   { transform: translateY(40px) scale(0.95); opacity: 0; }
  70%  { transform: translateY(-6px) scale(1.04); opacity: 1; }
  100% { transform: translateY(0)    scale(1);    opacity: 1; }
}
</style>
