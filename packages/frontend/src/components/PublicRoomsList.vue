<script setup lang="ts">
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PublicRoomSummary } from '@kpl/shared';
import { useLobbyStore } from '../stores/lobbyStore';

defineProps<{ rooms: PublicRoomSummary[] }>();
const emit = defineEmits<{ preview: [code: string] }>();

const { t } = useI18n();
const lobbyStore = useLobbyStore();

onMounted(() => lobbyStore.fetchCardSets());

function setNamesForRoom(room: PublicRoomSummary): string {
  if (!lobbyStore.cardSets.length) return '';
  return room.selectedSetIds
    .map(id => lobbyStore.cardSets.find(s => s.id === id)?.name)
    .filter(Boolean)
    .join(', ');
}
</script>
<template>
  <div class="w-full">
    <div v-if="rooms.length === 0" class="flex flex-col items-center justify-center py-20 text-center opacity-30">
      <div class="text-5xl mb-4">🌑</div>
      <p class="font-black uppercase tracking-tighter text-sm">{{ t('publicRooms.noRooms') }}</p>
    </div>

    <ul class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-3">
      <li
        v-for="room in rooms"
        :key="room.code"
        @click="emit('preview', room.code)"
        class="group bg-slate-900/40 border border-white/5 hover:border-white/20 rounded-2xl transition-all duration-300 overflow-hidden shadow-sm cursor-pointer"
      >
        <div class="flex items-center justify-between p-5">
          <div class="flex flex-col gap-0.5">
            <h3 class="font-black text-white text-xl tracking-tight leading-tight group-hover:text-yellow-500 transition-colors">
              {{ room.name }}
            </h3>
            <div class="flex items-center gap-2">
               <span class="text-[10px] font-mono text-slate-500">#{{ room.code }}</span>
               <span class="w-1 h-1 bg-slate-700 rounded-full"></span>
               <span v-if="setNamesForRoom(room)" class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{{ setNamesForRoom(room) }}</span>
            </div>
          </div>

          <div
            class="flex flex-col items-end"
            :class="room.playerCount >= room.maxPlayers ? 'text-red-500' : 'text-green-500'"
          >
            <span class="text-lg font-black leading-none">{{ room.playerCount }}</span>
            <span class="text-[9px] font-black uppercase opacity-50">/ {{ room.maxPlayers }}</span>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>