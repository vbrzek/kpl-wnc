<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoomStore } from '../stores/roomStore';
import Scoreboard from './game/atoms/Scoreboard.vue';

const roomStore = useRoomStore();
const endingGame = ref(false);
const endGameError = ref('');

const scoreboard = computed(() => {
  const result = roomStore.roundResult;
  const players = roomStore.room?.players ?? [];
  if (!result) return [];
  return players
    .map(p => ({ id: p.id, nickname: p.nickname, score: result.scores[p.id] ?? 0 }))
    .sort((a, b) => b.score - a.score);
});

async function onEndGame() {
  endingGame.value = true;
  const err = await roomStore.endGame();
  if (err) {
    endGameError.value = err.error;
    endingGame.value = false;
  }
}
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
    <div class="max-w-sm mx-auto text-left">
      <h3 class="text-xl font-semibold mb-3">Skóre</h3>
      <Scoreboard :entries="scoreboard" />
    </div>

    <p class="text-gray-500 text-sm">Nové kolo začíná za 5 sekund...</p>

    <!-- Host: ukončit hru -->
    <div v-if="roomStore.isHost" class="pt-4 border-t border-gray-700">
      <p v-if="endGameError" class="text-red-400 text-sm mb-2">{{ endGameError }}</p>
      <button
        @click="onEndGame"
        :disabled="endingGame"
        class="bg-red-700 hover:bg-red-600 text-white font-semibold px-6 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Ukončit hru
      </button>
    </div>
  </div>
</template>
