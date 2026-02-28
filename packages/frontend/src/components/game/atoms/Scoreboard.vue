<script setup lang="ts">
import Avatar from '../../Avatar.vue';

defineProps<{
  entries: { id: string; rank?: number; nickname: string; score: number }[]
  showRank?: boolean
}>()
</script>

<template>
  <div>
    <div
      v-for="entry in entries"
      :key="entry.id"
      class="flex justify-between items-center py-2 border-b border-gray-700"
    >
      <span v-if="showRank && entry.rank" class="text-gray-400 w-6">{{ entry.rank }}.</span>
      <span class="flex items-center gap-2" :class="showRank ? 'flex-1 ml-2' : 'flex-1'">
        <Avatar :nickname="entry.nickname" :size="32" />
        {{ entry.nickname }}
      </span>
      <span class="font-bold text-yellow-400">{{ entry.score }}</span>
    </div>
  </div>
</template>
