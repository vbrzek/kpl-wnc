<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useLobbyStore, loadPlayerToken } from '../stores/lobbyStore';
import { useRoomStore } from '../stores/roomStore';
import { useProfileStore } from '../stores/profileStore';
import LobbyPanel from '../components/LobbyPanel.vue';
import SelectionPhase from '../components/SelectionPhase.vue';
import JudgingPhase from '../components/JudgingPhase.vue';
import ResultsPhase from '../components/ResultsPhase.vue';
import FinishedPhase from '../components/FinishedPhase.vue';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const lobbyStore = useLobbyStore();
const roomStore = useRoomStore();
const profileStore = useProfileStore();

const roomCode = route.params.token as string;

const stopKickedWatch = watch(
  () => roomStore.room,
  (newRoom, oldRoom) => {
    if (oldRoom !== null && newRoom === null) {
      router.push('/');
    }
  }
);

onMounted(async () => {
  roomStore.init();

  const existingToken = loadPlayerToken(roomCode);
  // Pokud má hráč token: reconnect s prázdnou přezdívkou (server použije token)
  // Pokud ne: připoj se s přezdívkou z globálního profilu
  const nickname = existingToken ? '' : profileStore.nickname;

  const result = await lobbyStore.joinRoom(roomCode, nickname);
  if ('error' in result) {
    router.push({ path: '/', query: { error: result.error } });
    return;
  }
  roomStore.setRoom(result.room);
  roomStore.setMyPlayerId(result.playerId);
});

onUnmounted(() => {
  stopKickedWatch();
  roomStore.cleanup();
});
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0 h-full">
    <template v-if="roomStore.room">
      <div class="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        <Transition name="phase-slide" mode="out-in">
          <LobbyPanel    v-if="roomStore.room.status === 'LOBBY'"         key="LOBBY"     :room="roomStore.room" />
          <SelectionPhase v-else-if="roomStore.room.status === 'SELECTION'" key="SELECTION" />
          <JudgingPhase  v-else-if="roomStore.room.status === 'JUDGING'"   key="JUDGING" />
          <ResultsPhase  v-else-if="roomStore.room.status === 'RESULTS'"   key="RESULTS" />
          <FinishedPhase v-else-if="roomStore.room.status === 'FINISHED'"  key="FINISHED" />
        </Transition>
      </div>
    </template>

    <div v-else class="flex items-center justify-center flex-1 text-gray-400 italic font-black uppercase tracking-tighter">
       {{ t('room.connecting') }}
    </div>
  </div>
</template>

<style scoped>
.phase-slide-enter-active,
.phase-slide-leave-active {
  transition: transform 0.3s ease-out, opacity 0.3s ease-out;
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
}
.phase-slide-enter-from {
  transform: translateX(100%);
  opacity: 0;
}
.phase-slide-leave-to {
  transform: translateX(-30%);
  opacity: 0;
}
</style>