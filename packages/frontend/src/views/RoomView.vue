<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useLobbyStore, loadPlayerToken } from '../stores/lobbyStore';
import { useRoomStore } from '../stores/roomStore';
import NicknameModal from '../components/NicknameModal.vue';
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

const roomCode = route.params.token as string;
const needsNickname = ref(false);

// Watch for being kicked (roomStore clears room on lobby:kicked)
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

  if (existingToken) {
    // Reconnect: pass empty nickname — server will use the stored playerToken
    const result = await lobbyStore.joinRoom(roomCode, '');
    if ('error' in result) {
      router.push({ path: '/', query: { error: result.error } });
      return;
    }
    roomStore.setRoom(result.room);
    roomStore.setMyPlayerId(result.playerId);
  } else {
    needsNickname.value = true;
  }
});

async function onNicknameSubmit(nickname: string) {
  const result = await lobbyStore.joinRoom(roomCode, nickname);
  if ('error' in result) {
    router.push({ path: '/', query: { error: result.error } });
    return;
  }
  roomStore.setRoom(result.room);
  roomStore.setMyPlayerId(result.playerId);
  needsNickname.value = false;
}

onUnmounted(() => {
  stopKickedWatch();
  roomStore.cleanup();
});
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white p-6">

    <NicknameModal
      v-if="needsNickname"
      @join="onNicknameSubmit"
    />

    <template v-if="roomStore.room">
      <LobbyPanel
        v-if="roomStore.room.status === 'LOBBY'"
        :room="roomStore.room"
      />
      <SelectionPhase v-else-if="roomStore.room.status === 'SELECTION'" />
      <JudgingPhase v-else-if="roomStore.room.status === 'JUDGING'" />
      <ResultsPhase v-else-if="roomStore.room.status === 'RESULTS'" />
      <FinishedPhase v-else-if="roomStore.room.status === 'FINISHED'" />
    </template>

    <div v-else class="text-gray-400 mt-20 text-center">
      {{ t('room.connecting') }}
    </div>

  </div>
</template>
