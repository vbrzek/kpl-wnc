<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useRoomStore } from '../stores/roomStore';
import { useLobbyStore } from '../stores/lobbyStore';
import { useProfileStore } from '../stores/profileStore';
import { useSound } from '../composables/useSound';
import Podium from './game/atoms/Podium.vue';
import Scoreboard from './game/atoms/Scoreboard.vue';
import confetti from 'canvas-confetti';

const { t } = useI18n();
const router = useRouter();
const roomStore = useRoomStore();
const lobbyStore = useLobbyStore();
const profileStore = useProfileStore();
const { play } = useSound();

const joiningNew = ref(false);
const joinError = ref('');

// Data bereme z finishedState (cached payload), NE z živého room
const scoreboard = computed(() =>
  (roomStore.finishedState?.finalScores ?? []).map(p => ({
    id: p.playerId,
    nickname: p.nickname,
    score: p.score,
    rank: p.rank,
  }))
);

const roomCode = computed(() => roomStore.finishedState?.roomCode ?? '');

onMounted(() => {
  setTimeout(() => {
    play('fanfare');
    confetti({ particleCount: 80, angle: 60, spread: 55, origin: { x: 0, y: 0.7 } });
    confetti({ particleCount: 80, angle: 120, spread: 55, origin: { x: 1, y: 0.7 } });
  }, 1300);
});

async function onNewGame() {
  if (roomStore.isHost) {
    // Host je stále v místnosti (LOBBY), stačí vymazat finishedState
    roomStore.clearFinishedState();
    return;
  }
  // Ostatní hráči: znovu se připojit do místnosti
  joiningNew.value = true;
  const result = await lobbyStore.joinRoom(roomCode.value, profileStore.nickname);
  if ('error' in result) {
    joinError.value = result.error;
    joiningNew.value = false;
    return;
  }
  roomStore.setRoom(result.room);
  roomStore.setMyPlayerId(result.playerId);
  roomStore.clearFinishedState();
}

function onLeaveRoom() {
  roomStore.clearFinishedState();
  router.push('/');
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

    <div class="pt-2 flex flex-col items-center gap-3">
      <p v-if="joinError" class="text-red-400 text-sm">{{ joinError }}</p>
      <button
        @click="onNewGame"
        :disabled="joiningNew"
        class="bg-green-600 hover:bg-green-500 text-white font-bold px-8 py-3 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed w-full max-w-xs"
      >
        {{ joiningNew ? '...' : t('game.finished.newGame') }}
      </button>
      <button
        @click="onLeaveRoom"
        :disabled="joiningNew"
        class="bg-gray-700 hover:bg-gray-600 text-white font-semibold px-8 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed w-full max-w-xs"
      >
        {{ t('game.finished.leaveRoom') }}
      </button>
    </div>
  </div>
</template>
