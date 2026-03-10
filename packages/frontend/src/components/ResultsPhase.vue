<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
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
    const result = roomStore.roundResult;
    const winningIds = result?.winningCards.map((c) => c.id) ?? [];
    const voteIds = result?.voteResults?.flatMap((v) => v.cards.map((c) => c.id)) ?? [];
    const allIds = [...new Set([...winningIds, ...voteIds])];
    await cardTranslations.fetchTranslations([], allIds);
  },
  { immediate: true },
);

const translatedWinningCards = computed(() =>
  roomStore.roundResult?.winningCards.map((c) => ({
    ...c,
    text: cardTranslations.getWhite(c.id, c.text),
  })) ?? [],
);

const translatedVoteResults = computed(() =>
  roomStore.roundResult?.voteResults?.map((v) => ({
    ...v,
    cards: v.cards.map((c) => ({ ...c, text: cardTranslations.getWhite(c.id, c.text) })),
  })) ?? [],
);

const hasVoteResults = computed(() => translatedVoteResults.value.length > 0);

const winnerNames = computed(() => {
  const result = roomStore.roundResult;
  if (!result) return [];
  if (result.winnerIds && result.winnerIds.length > 0) {
    return result.winnerIds.map(id => {
      if (id === 'rando_cardrissian') return 'Rando Cardrissian';
      return roomStore.room?.players.find(p => p.id === id)?.nickname ?? id;
    });
  }
  return result.winnerNickname ? [result.winnerNickname] : [];
});

const isMultiWinner = computed(() => {
  const ids = roomStore.roundResult?.winnerIds;
  return ids && ids.length > 1;
});

const scoreboard = computed(() => {
  const result = roomStore.roundResult;
  const players = roomStore.room?.players ?? [];
  if (!result) return [];
  return players
    .map(p => ({ id: p.id, nickname: p.nickname, avatarUrl: p.avatarUrl, score: result.scores[p.id] ?? 0 }))
    .sort((a, b) => b.score - a.score);
});

// Informace o průběhu (rounds / score)
const isLastRoundNext = computed(() => {
  const room = roomStore.room;
  if (room?.winCondition !== 'rounds') return false;
  return room.roundNumber >= room.targetRounds - 1;
});

// Zbývající čas do konce hry (jen pro winCondition === 'time')
const gameSecondsLeft = ref(0);
let gameTimerInterval: ReturnType<typeof setInterval> | null = null;

function updateGameSecondsLeft() {
  const room = roomStore.room;
  if (!room?.gameStartedAt) { gameSecondsLeft.value = 0; return; }
  const endMs = room.gameStartedAt + room.gameTimeLimit * 60_000;
  gameSecondsLeft.value = Math.max(0, Math.ceil((endMs - Date.now()) / 1000));
}

const gameTimeFormatted = computed(() => {
  const s = gameSecondsLeft.value;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
});

onMounted(() => {
  const result = roomStore.roundResult;
  const myId = roomStore.myPlayerId;
  if (myId && (result?.winnerId === myId || result?.winnerIds?.includes(myId))) {
    play('round-win')
  }
  if (roomStore.room?.winCondition === 'time') {
    updateGameSecondsLeft();
    gameTimerInterval = setInterval(updateGameSecondsLeft, 1000);
  }
});

onUnmounted(() => {
  if (gameTimerInterval !== null) clearInterval(gameTimerInterval);
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
    <!-- Rando Cardrissian win (solo) -->
    <div v-if="roomStore.roundResult?.winnerId === 'rando_cardrissian' && !isMultiWinner" class="winner-entrance space-y-3">
      <div class="text-5xl">🎲</div>
      <p class="text-2xl font-black text-red-400">{{ t('specialRules.randoWon') }}</p>
    </div>

    <!-- Vítěz kola (multi-winner pro czar_is_dead remízu) -->
    <div v-else-if="isMultiWinner" class="winner-entrance">
      <p class="text-gray-400 text-lg mb-2">{{ t('game.results.roundWinner') }}</p>
      <h2 v-for="name in winnerNames" :key="name" class="text-3xl font-bold winner-name">
        {{ name }}
      </h2>
    </div>

    <!-- Vítěz kola (single) -->
    <div v-else class="winner-entrance">
      <p class="text-gray-400 text-lg mb-2">{{ t('game.results.roundWinner') }}</p>
      <h2 class="text-4xl font-bold winner-name">
        {{ roomStore.roundResult?.winnerNickname ?? '...' }}
      </h2>
    </div>

    <!-- Výsledky hlasování (czar_is_dead) -->
    <div v-if="hasVoteResults" class="space-y-3 max-w-sm mx-auto">
      <div
        v-for="(entry, index) in translatedVoteResults"
        :key="entry.submissionId"
        class="vote-result-card rounded-2xl p-4 text-left shadow-xl border-2 transition-all"
        :class="roomStore.roundResult?.winnerIds?.includes(entry.playerId)
          ? 'bg-white border-yellow-400'
          : 'bg-white/90 border-transparent'"
        :style="{ animationDelay: `${400 + index * 200}ms` }"
      >
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-black uppercase tracking-wider text-gray-500">{{ entry.nickname }}</span>
          <span
            class="text-xs font-black px-2 py-0.5 rounded-full"
            :class="roomStore.roundResult?.winnerIds?.includes(entry.playerId)
              ? 'bg-yellow-400 text-black'
              : 'bg-gray-100 text-gray-500'"
          >
            {{ t('game.results.voteCount', { count: entry.voteCount }) }}
          </span>
        </div>
        <div v-for="(card, cardIndex) in entry.cards" :key="card.id" :class="cardIndex > 0 ? 'mt-2 pt-2 border-t border-gray-100' : ''">
          <p class="text-gray-900 font-bold leading-snug text-sm">{{ card.text }}</p>
        </div>
      </div>
    </div>

    <!-- Vítězné karty (classic/meritocracy/god_mode) -->
    <div v-else class="flex flex-wrap gap-3 justify-center">
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

    <!-- Čas do konce hry (pouze winCondition === 'time') -->
    <div v-if="roomStore.room?.winCondition === 'time'" class="text-center">
      <p class="text-gray-400 text-sm mb-1">{{ t('game.results.gameTimeLeft') }}</p>
      <p
        class="text-3xl font-mono font-bold tabular-nums"
        :class="gameSecondsLeft <= 60 ? 'text-red-400' : 'text-yellow-400'"
      >{{ gameTimeFormatted }}</p>
    </div>

    <!-- Průběh kol (pouze winCondition === 'rounds') -->
    <p v-else-if="roomStore.room?.winCondition === 'rounds'" class="font-semibold text-lg"
      :class="isLastRoundNext ? 'text-yellow-400' : 'text-gray-300'"
    >
      <template v-if="isLastRoundNext">{{ t('game.results.lastRoundNext') }}</template>
      <template v-else>{{ t('game.results.roundProgress', { current: roomStore.room!.roundNumber, total: roomStore.room!.targetRounds }) }}</template>
    </p>

    <!-- Cíl skóre (pouze winCondition === 'score') -->
    <p v-else-if="roomStore.room?.winCondition === 'score'" class="text-gray-400 text-sm">
      {{ t('game.results.scoreGoal', { score: roomStore.room!.targetScore }) }}
    </p>

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

.vote-result-card {
  animation: card-pop 0.35s ease-out both;
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
