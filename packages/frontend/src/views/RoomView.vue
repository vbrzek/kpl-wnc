<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useLobbyStore, loadPlayerToken } from '../stores/lobbyStore';
import { useRoomStore } from '../stores/roomStore';
import NicknameModal from '../components/NicknameModal.vue';
import LobbyPanel from '../components/LobbyPanel.vue';

const route = useRoute();
const router = useRouter();
const lobbyStore = useLobbyStore();
const roomStore = useRoomStore();

const roomCode = route.params.token as string;
const needsNickname = ref(false);
const errorMsg = ref('');

// Watch for being kicked (roomStore clears room on lobby:kicked)
const stopKickedWatch = watch(
  () => roomStore.room,
  (newRoom, oldRoom) => {
    if (oldRoom !== null && newRoom === null && !errorMsg.value) {
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
      errorMsg.value = result.error;
      setTimeout(() => router.push('/'), 2000);
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
    errorMsg.value = result.error;
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

    <p v-if="errorMsg" class="text-red-400 mb-4">{{ errorMsg }}</p>

    <template v-if="roomStore.room">
      <LobbyPanel
        v-if="roomStore.room.status === 'LOBBY'"
        :room="roomStore.room"
      />
      <div v-else class="text-center text-2xl mt-20 text-gray-300">
        Hra probíhá... (herní UI bude implementováno)
      </div>
    </template>

    <div v-else-if="!errorMsg" class="text-gray-400 mt-20 text-center">
      Připojování...
    </div>

  </div>
</template>
