<script setup lang="ts">
import { computed } from 'vue';
import { useRoomStore } from '../stores/roomStore';

const roomStore = useRoomStore();

const scoreboard = computed(() => {
  const result = roomStore.roundResult;
  const players = roomStore.room?.players ?? [];
  if (!result) return [];
  return players
    .map(p => ({ nickname: p.nickname, score: result.scores[p.id] ?? 0 }))
    .sort((a, b) => b.score - a.score);
});
</script>

<template>
  <div class="space-y-8 text-center">
    <!-- Vítěz kola -->
    <div>
      <p class="text-gray-400 text-lg mb-2">Vítěz kola</p>
      <h2 class="text-4xl font-bold text-yellow-400">
        {{ roomStore.roundResult?.winnerNickname ?? '...' }}
      </h2>
    </div>

    <!-- Vítězné karty -->
    <div class="flex flex-wrap gap-3 justify-center">
      <div
        v-for="card in roomStore.roundResult?.winningCards ?? []"
        :key="card.id"
        class="bg-white text-black rounded-lg p-4 text-sm font-medium max-w-xs text-left"
      >
        {{ card.text }}
      </div>
    </div>

    <!-- Skóre -->
    <div class="max-w-sm mx-auto">
      <h3 class="text-xl font-semibold mb-3 text-left">Skóre</h3>
      <div
        v-for="entry in scoreboard"
        :key="entry.nickname"
        class="flex justify-between py-2 border-b border-gray-700"
      >
        <span>{{ entry.nickname }}</span>
        <span class="font-bold text-yellow-400">{{ entry.score }}</span>
      </div>
    </div>

    <p class="text-gray-500 text-sm">Nové kolo začíná za 5 sekund...</p>
  </div>
</template>
