<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoomStore } from '../stores/roomStore';

const roomStore = useRoomStore();
const returning = ref(false);
const returnError = ref('');

const scoreboard = computed(() => {
  const players = roomStore.room?.players ?? [];
  return [...players]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ rank: i + 1, id: p.id, nickname: p.nickname, score: p.score }));
});

async function onReturnToLobby() {
  returning.value = true;
  const err = await roomStore.returnToLobby();
  if (err) {
    returnError.value = err.error;
    returning.value = false;
  }
}
</script>

<template>
  <div class="space-y-8 text-center max-w-md mx-auto">
    <div>
      <h2 class="text-4xl font-bold text-yellow-400 mb-1">Hra skončila!</h2>
      <p class="text-gray-400">Finální výsledky</p>
    </div>

    <!-- Podium: top 3 -->
    <div v-if="scoreboard.length > 0" class="flex items-end justify-center gap-4">
      <div v-if="scoreboard[1]" class="text-center">
        <div class="bg-gray-600 rounded-t-lg px-4 py-6 w-24">
          <p class="font-bold truncate">{{ scoreboard[1].nickname }}</p>
          <p class="text-2xl font-bold text-gray-300">{{ scoreboard[1].score }}</p>
        </div>
        <div class="bg-gray-500 text-center py-1 rounded-b-sm text-sm">2.</div>
      </div>
      <div v-if="scoreboard[0]" class="text-center">
        <div class="bg-yellow-700 rounded-t-lg px-4 py-8 w-28">
          <p class="text-2xl">🏆</p>
          <p class="font-bold truncate">{{ scoreboard[0].nickname }}</p>
          <p class="text-2xl font-bold text-yellow-300">{{ scoreboard[0].score }}</p>
        </div>
        <div class="bg-yellow-600 text-center py-1 rounded-b-sm text-sm font-bold">1.</div>
      </div>
      <div v-if="scoreboard[2]" class="text-center">
        <div class="bg-gray-700 rounded-t-lg px-4 py-4 w-24">
          <p class="font-bold truncate">{{ scoreboard[2].nickname }}</p>
          <p class="text-2xl font-bold text-gray-400">{{ scoreboard[2].score }}</p>
        </div>
        <div class="bg-gray-600 text-center py-1 rounded-b-sm text-sm">3.</div>
      </div>
    </div>

    <!-- Kompletní tabulka -->
    <div class="text-left">
      <div
        v-for="entry in scoreboard"
        :key="entry.id"
        class="flex justify-between items-center py-2 border-b border-gray-700"
      >
        <span class="text-gray-400 w-6">{{ entry.rank }}.</span>
        <span class="flex-1 ml-2">{{ entry.nickname }}</span>
        <span class="font-bold text-yellow-400">{{ entry.score }}</span>
      </div>
    </div>

    <!-- Akce -->
    <div class="pt-2">
      <p v-if="returnError" class="text-red-400 text-sm mb-2">{{ returnError }}</p>

      <button
        v-if="roomStore.isHost"
        @click="onReturnToLobby"
        :disabled="returning"
        class="bg-green-600 hover:bg-green-500 text-white font-bold px-8 py-3 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Návrat do lobby
      </button>
      <p v-else class="text-gray-500 text-sm">
        Čekáme na hostitele...
      </p>
    </div>
  </div>
</template>
