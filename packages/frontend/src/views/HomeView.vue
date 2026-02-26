<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useLobbyStore } from '../stores/lobbyStore';
import { useRoomStore } from '../stores/roomStore';
import { useProfileStore } from '../stores/profileStore';
import PublicRoomsList from '../components/PublicRoomsList.vue';
import CreateTableModal from '../components/CreateTableModal.vue';
import JoinPrivateModal from '../components/JoinPrivateModal.vue';

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const lobbyStore = useLobbyStore();
const roomStore = useRoomStore();
const profileStore = useProfileStore();

const showCreate = ref(false);
const showJoinPrivate = ref(false);
const errorMsg = ref('');

onMounted(() => {
  lobbyStore.subscribe();
  if (route.query.error) {
    errorMsg.value = route.query.error as string;
  }
});
onUnmounted(() => lobbyStore.unsubscribe());

async function onCreateRoom(settings: {
  name: string;
  isPublic: boolean;
  selectedSetIds: number[];
  maxPlayers: number;
}) {
  const result = await lobbyStore.createRoom({ ...settings, nickname: profileStore.nickname });
  if ('error' in result) {
    errorMsg.value = result.error;
    return;
  }
  roomStore.setRoom(result.room);
  roomStore.setMyPlayerId(result.playerId);
  router.push(`/room/${result.code}`);
}

async function onJoinPublic(code: string) {
  const result = await lobbyStore.joinRoom(code, profileStore.nickname);
  if ('error' in result) {
    errorMsg.value = result.error;
    return;
  }
  roomStore.setRoom(result.room);
  roomStore.setMyPlayerId(result.playerId);
  router.push(`/room/${result.code}`);
}

function onJoinPrivate(code: string) {
  router.push(`/room/${code}`);
}
</script>

<template>

  <div class="bg-gray-800/60 backdrop-blur rounded-2xl p-8 shadow-xl border border-gray-700">
    <h1 class="text-4xl font-bold mb-8">{{ t('home.title') }}</h1>

    <p v-if="errorMsg" class="text-red-400 mb-4">{{ errorMsg }}</p>

    <div class="flex flex-col sm:flex-row gap-4 mb-10">
      <button
        @click="showCreate = true"
        class="bg-green-600 hover:bg-green-500 px-6 py-3 rounded-lg font-semibold"
      >
        {{ t('home.createTable') }}
      </button>
      <button
        @click="showJoinPrivate = true"
        class="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-lg font-semibold"
      >
        {{ t('home.joinWithCode') }}
      </button>
    </div>

    <PublicRoomsList
      :rooms="lobbyStore.publicRooms"
      @join="onJoinPublic"
    />

    <CreateTableModal
      v-if="showCreate"
      @close="showCreate = false"
      @create="onCreateRoom"
    />

    <JoinPrivateModal
      v-if="showJoinPrivate"
      @close="showJoinPrivate = false"
      @join="onJoinPrivate"
    />
  </div>
</template>
