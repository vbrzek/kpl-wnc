<script setup lang="ts">
defineProps<{
  entries: { id: string; nickname: string; score: number }[]
}>()
</script>

<template>
  <div class="flex items-end justify-center gap-4">
    <div v-if="entries[1]" class="text-center">
      <div class="bg-gray-600 rounded-t-lg px-4 py-6 w-24">
        <p class="font-bold truncate">{{ entries[1].nickname }}</p>
        <p class="text-2xl font-bold text-gray-300">{{ entries[1].score }}</p>
      </div>
      <div class="bg-gray-500 text-center py-1 rounded-b-sm text-sm">2.</div>
    </div>
    <div v-if="entries[0]" class="text-center">
      <div class="bg-yellow-700 rounded-t-lg px-4 py-8 w-28">
        <p class="text-2xl">🏆</p>
        <p class="font-bold truncate">{{ entries[0].nickname }}</p>
        <p class="text-2xl font-bold text-yellow-300">{{ entries[0].score }}</p>
      </div>
      <div class="bg-yellow-600 text-center py-1 rounded-b-sm text-sm font-bold">1.</div>
    </div>
    <div v-if="entries[2]" class="text-center">
      <div class="bg-gray-700 rounded-t-lg px-4 py-4 w-24">
        <p class="font-bold truncate">{{ entries[2].nickname }}</p>
        <p class="text-2xl font-bold text-gray-400">{{ entries[2].score }}</p>
      </div>
      <div class="bg-gray-600 text-center py-1 rounded-b-sm text-sm">3.</div>
    </div>
  </div>
</template>
