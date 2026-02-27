<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useLobbyStore, fetchRoomPreview, type RoomPreview } from '../stores/lobbyStore';
import { useRoomStore } from '../stores/roomStore';
import { useProfileStore } from '../stores/profileStore';
import PublicRoomsList from '../components/PublicRoomsList.vue';
import CreateTableModal from '../components/CreateTableModal.vue';
import JoinPrivateModal from '../components/JoinPrivateModal.vue';
import RoomPreviewModal from '../components/RoomPreviewModal.vue';

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const lobbyStore = useLobbyStore();
const roomStore = useRoomStore();
const profileStore = useProfileStore();

const showCreate = ref(false);
const showJoinPrivate = ref(false);
const errorMsg = ref('');
const activeRooms = ref<RoomPreview[]>([]);
const previewRoom = ref<RoomPreview | null>(null);
const previewLoading = ref(false);

const titleStart = computed(() => {
  const words = t('home.title').split(' ');
  return words.slice(0, -1).join(' ');
});
const titleEnd = computed(() => {
  const words = t('home.title').split(' ');
  return words[words.length - 1];
});

onMounted(() => {
  lobbyStore.subscribe();
  lobbyStore.fetchCardSets();
  loadActiveRooms();
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

async function loadActiveRooms() {
  const codes: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('playerToken_')) {
      codes.push(key.replace('playerToken_', ''));
    }
  }
  if (!codes.length) return;
  const results = await Promise.all(codes.map(code => fetchRoomPreview(code)));
  results.forEach((preview, i) => {
    if (preview === null) {
      localStorage.removeItem(`playerToken_${codes[i]}`);
    }
  });
  activeRooms.value = results.filter((r): r is RoomPreview => r !== null);
}

async function openPreview(code: string) {
  previewLoading.value = true;
  const preview = await fetchRoomPreview(code);
  previewLoading.value = false;
  if (!preview) {
    errorMsg.value = 'Room not found.';
    return;
  }
  previewRoom.value = preview;
}

function onConfirmJoin() {
  if (!previewRoom.value) return;
  const code = previewRoom.value.code;
  previewRoom.value = null;
  router.push(`/room/${code}`);
}

async function onJoinPublic(code: string) {
  await openPreview(code);
}

function onJoinPrivate(code: string) {
  router.push(`/room/${code}`);
}
</script>
<template>
  <div class="min-h-screen flex flex-col justify-start px-4 pt-8 pb-12">
    
    <header class="mb-6 flex items-end justify-between">
      <div>
        <h1 class="text-3xl font-black tracking-tighter leading-none uppercase italic">
          {{ titleStart }} <span class="text-white/40">{{ titleEnd }}</span>
        </h1>
        <div class="h-1 w-12 bg-yellow-500 rounded-full mt-2"></div>
      </div>
      </header>

    <p v-if="errorMsg" class="bg-red-500/20 text-red-400 p-3 rounded-xl border border-red-500/30 mb-4 text-sm">
      {{ errorMsg }}
    </p>

    <!-- Active games section -->
    <div v-if="activeRooms.length > 0" class="mb-8">
      <div class="flex items-center justify-between mb-3 px-2">
        <h2 class="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-500">
          {{ t('home.activeRooms') }}
        </h2>
        <span class="w-2 h-2 bg-yellow-500 rounded-full shadow-[0_0_8px_rgba(234,179,8,0.6)]"></span>
      </div>
      <ul class="grid grid-cols-1 gap-3">
        <li
          v-for="room in activeRooms"
          :key="room.code"
          @click="openPreview(room.code)"
          class="group bg-slate-900/40 border border-yellow-500/10 hover:border-yellow-500/30 rounded-2xl transition-all cursor-pointer overflow-hidden"
        >
          <div class="flex items-center justify-between p-4">
            <div>
              <h3 class="font-black text-white text-base tracking-tight group-hover:text-yellow-500 transition-colors">
                {{ room.name }}
              </h3>
              <span class="font-mono text-[10px] text-slate-500">#{{ room.code }}</span>
            </div>
            <div class="flex flex-col items-end gap-1">
              <span class="text-sm font-black" :class="room.playerCount >= room.maxPlayers ? 'text-red-500' : 'text-slate-300'">
                {{ room.playerCount }}/{{ room.maxPlayers }}
              </span>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <div class="grid grid-cols-2 gap-3 mb-8">
      <button
        @click="showCreate = true"
        class="group relative bg-white text-black text-sm font-black py-4 rounded-xl shadow-[0_4px_0_rgb(200,200,200)] active:shadow-none active:translate-y-1 transition-all overflow-hidden uppercase"
      >
        <span class="relative z-10">{{ t('home.createTable') }}</span>
      </button>

      <button
        @click="showJoinPrivate = true"
        class="bg-slate-800 border border-white/10 hover:bg-slate-700 text-white text-sm font-black py-4 rounded-xl active:translate-y-1 transition-all uppercase"
      >
        {{ t('home.joinWithCode') }}
      </button>
    </div>

    <div class="flex-1 flex flex-col min-h-0">
      <div class="flex items-center justify-between mb-3 px-2">
        <h2 class="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
          {{ t('home.publicRooms') }}
        </h2>
        <span class="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span>
      </div>

      
        <PublicRoomsList
          :rooms="lobbyStore.publicRooms"
          @join="onJoinPublic"
        />
      
    </div>

    <CreateTableModal v-if="showCreate" @close="showCreate = false" @create="onCreateRoom" />
    <JoinPrivateModal v-if="showJoinPrivate" @close="showJoinPrivate = false" @join="onJoinPrivate" />

    <!-- Preview modal -->
    <RoomPreviewModal
      v-if="previewRoom"
      :preview="previewRoom"
      @join="onConfirmJoin"
      @close="previewRoom = null"
    />

    <!-- Loading indicator -->
    <div v-if="previewLoading" class="fixed inset-0 bg-black/40 z-40 flex items-center justify-center">
      <div class="text-white text-sm font-black uppercase tracking-widest animate-pulse">
        {{ t('common.loading') }}
      </div>
    </div>
  </div>
</template>