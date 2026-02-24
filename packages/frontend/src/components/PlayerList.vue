<script setup lang="ts">
import type { Player } from '@kpl/shared';

defineProps<{
  players: Player[];
  hostId: string;
  myPlayerId: string | null;
  isHost: boolean;
}>();

const emit = defineEmits<{ kick: [playerId: string] }>();
</script>

<template>
  <ul class="space-y-2">
    <li
      v-for="player in players"
      :key="player.id"
      class="flex items-center justify-between bg-gray-700 px-4 py-2 rounded"
    >
      <span class="flex items-center gap-2">
        {{ player.nickname }}
        <span v-if="player.id === hostId" class="text-xs text-yellow-400">(host)</span>
        <span v-if="player.id === myPlayerId" class="text-xs text-green-400">(ty)</span>
        <span v-if="player.isAfk" class="text-xs text-gray-400 bg-gray-600 px-1 rounded">AFK</span>
        <span
          v-else-if="!player.socketId"
          class="text-xs text-orange-400"
        >offline</span>
      </span>
      <button
        v-if="isHost && player.id !== myPlayerId"
        @click="emit('kick', player.id)"
        class="text-xs text-red-400 hover:text-red-300"
      >
        Vyhodit
      </button>
    </li>
  </ul>
</template>
