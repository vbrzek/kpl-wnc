<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoomStore } from '../stores/roomStore';
import { useCardTranslations } from '../composables/useCardTranslations.js';
import { useSound } from '../composables/useSound';
import Scoreboard from './game/atoms/Scoreboard.vue';

const { t, locale } = useI18n();
const roomStore = useRoomStore();
const endingGame = ref(false);
const endGameError = ref('');
const cardTranslations = useCardTranslations();
const { play } = useSound();

watch(
  [() => roomStore.roundResult, locale],
  async () => {
    const ids = roomStore.roundResult?.winningCards.map((c) => c.id) ?? [];
    await cardTranslations.fetchTranslations([], ids);
  },
  { immediate: true },
);

const translatedWinningCards = computed(() =>
  roomStore.roundResult?.winningCards.map((c) => ({
    ...c,
    text: cardTranslations.getWhite(c.id, c.text),
  })) ?? [],
);

const scoreboard = computed(() => {
  const result = roomStore.roundResult;
  const players = roomStore.room?.players ?? [];
  if (!result) return [];
  return players
    .map(p => ({ id: p.id, nickname: p.nickname, score: result.scores[p.id] ?? 0 }))
    .sort((a, b) => b.score - a.score);
});

onMounted(() => {
  play('round-win')
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
    <div class="winner-entrance">
      <p class="text-gray-400 text-lg mb-2">{{ t('game.results.roundWinner') }}</p>
      <h2 class="text-4xl font-bold winner-name">
        {{ roomStore.roundResult?.winnerNickname ?? '...' }}
      </h2>
    </div>

    <!-- Vítězné karty -->
    <div class="flex flex-wrap gap-3 justify-center">
      <div
        v-for="(card, index) in translatedWinningCards"
        :key="card.id"
        class="winning-card bg-white text-black rounded-lg p-4 text-sm font-medium max-w-xs text-left"
        :style="{ animationDelay: `${400 + index * 300}ms` }"
      >
        {{ card.text }}
      </div>
    </div>

    <!-- Skóre -->
    <div class="max-w-sm mx-auto text-left scoreboard-fadein">
      <h3 class="text-xl font-semibold mb-3">{{ t('game.results.score') }}</h3>
      <Scoreboard :entries="scoreboard" />
    </div>

    <p class="text-gray-500 text-sm">{{ t('game.results.nextRound') }}</p>

    <!-- Host: ukončit hru -->
    <div v-if="roomStore.isHost" class="pt-4 border-t border-gray-700">
      <p v-if="endGameError" class="text-red-400 text-sm mb-2">{{ endGameError }}</p>
      <button
        @click="onEndGame"
        :disabled="endingGame"
        class="bg-red-700 hover:bg-red-600 text-white font-semibold px-6 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {{ t('game.results.endGame') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.winner-entrance {
  animation: slide-down 0.4s ease-out both;
}

.winner-name {
  color: #facc15; /* yellow-400 */
  animation: slide-down 0.4s ease-out both, winner-glow 1.8s ease-in-out 0.4s infinite alternate;
}

.winning-card {
  animation: card-pop 0.35s ease-out both, card-glow 1.6s ease-in-out 0.8s infinite alternate;
}

.scoreboard-fadein {
  animation: fade-in 0.5s ease-out 1s both;
}

@keyframes slide-down {
  from { transform: translateY(-20px); opacity: 0; }
  to   { transform: translateY(0);     opacity: 1; }
}

@keyframes winner-glow {
  from { text-shadow: 0 0 8px rgba(250, 204, 21, 0.3); }
  to   { text-shadow: 0 0 20px rgba(250, 204, 21, 0.8), 0 0 40px rgba(250, 204, 21, 0.4); }
}

@keyframes card-pop {
  from { transform: scale(0.85); opacity: 0; }
  to   { transform: scale(1);    opacity: 1; }
}

@keyframes card-glow {
  from { box-shadow: 0 0 0 2px rgba(250, 204, 21, 0.2); }
  to   { box-shadow: 0 0 12px 4px rgba(250, 204, 21, 0.5); }
}

@keyframes fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
</style>
