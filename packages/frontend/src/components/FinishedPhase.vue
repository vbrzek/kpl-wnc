<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoomStore } from '../stores/roomStore';
import Podium from './game/atoms/Podium.vue';
import Scoreboard from './game/atoms/Scoreboard.vue';

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

    <Podium v-if="scoreboard.length > 0" :entries="scoreboard" />

    <div class="text-left">
      <Scoreboard :entries="scoreboard" :showRank="true" />
    </div>

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
