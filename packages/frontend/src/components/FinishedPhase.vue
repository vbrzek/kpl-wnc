<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoomStore } from '../stores/roomStore';
import { useSound } from '../composables/useSound';
import Podium from './game/atoms/Podium.vue';
import Scoreboard from './game/atoms/Scoreboard.vue';
import confetti from 'canvas-confetti';

const { t } = useI18n();
const roomStore = useRoomStore();
const returning = ref(false);
const returnError = ref('');
const { play } = useSound();

const scoreboard = computed(() => {
  const players = roomStore.room?.players ?? [];
  return [...players]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ rank: i + 1, id: p.id, nickname: p.nickname, score: p.score }));
});

onMounted(() => {
  // Fire confetti + fanfare after 1st place animates in (~1300ms delay)
  setTimeout(() => {
    play('fanfare')
    confetti({ particleCount: 80, angle: 60, spread: 55, origin: { x: 0, y: 0.7 } })
    confetti({ particleCount: 80, angle: 120, spread: 55, origin: { x: 1, y: 0.7 } })
  }, 1300)
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
      <h2 class="text-4xl font-bold text-yellow-400 mb-1">{{ t('game.finished.title') }}</h2>
      <p class="text-gray-400">{{ t('game.finished.finalResults') }}</p>
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
        {{ t('game.finished.returnToLobby') }}
      </button>
      <p v-else class="text-gray-500 text-sm">
        {{ t('game.finished.waitingForHost') }}
      </p>
    </div>
  </div>
</template>
