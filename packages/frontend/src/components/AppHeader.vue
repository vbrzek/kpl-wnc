<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoomStore } from '../stores/roomStore';
import PlayerAvatar from './PlayerAvatar.vue';

const emit = defineEmits<{
  (e: 'editProfile'): void;
}>();

const { t } = useI18n();
const roomStore = useRoomStore();

const isInRoom = computed(() => roomStore.room !== null);
const isInGame = computed(() => roomStore.room !== null && roomStore.room.status !== 'LOBBY');
const myScore = computed(() => roomStore.me?.score ?? 0);
</script>

<template>
  <header class="fixed top-0 inset-x-0 bg-gray-900/80 backdrop-blur-xl border-b border-white/5 z-50"
          style="padding-top: env(safe-area-inset-top, 0px)">
    <div class="h-16 max-w-6xl mx-auto px-6 flex items-center justify-between">

      <div class="flex flex-col">
        <h1 class="text-lg md:text-xl font-black text-white uppercase tracking-tighter leading-none">
          {{ t('home.title') }}
        </h1>
        <span v-if="isInRoom" class="text-[10px] uppercase tracking-widest text-gray-500 font-bold mt-1">
          {{ t('header.table') }}: {{ roomStore.room!.name }}
        </span>
      </div>

      <div class="flex items-center gap-2 md:gap-4">
      <div v-if="isInGame" class="flex items-center gap-1.5 md:gap-2 bg-white/5 px-2.5 py-1.5 md:px-3 rounded-full border border-white/10">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-yellow-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
          <path d="M4 22h16"></path>
          <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
          <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
          <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>
        </svg>
        
        <span class="hidden md:inline text-xs font-bold text-gray-400 uppercase">
          {{ t('header.score') }}:
        </span>
        
        <span class="text-sm font-black text-yellow-500 leading-none">
          {{ myScore }}
        </span>
      </div>

      <button @click="emit('editProfile')" class="relative group">
        <div class="w-9 h-9 md:w-10 md:h-10 rounded-full bg-yellow-500 border-2 border-white/10 overflow-hidden hover:border-yellow-500 transition-all active:scale-90">
          <PlayerAvatar :size="40" />
        </div>
        <span class="absolute -top-0.5 -right-0.5 w-3 h-3 md:w-3.5 md:h-3.5 bg-green-500 border-2 border-gray-900 rounded-full"></span>
      </button>
    </div>
    </div>
  </header>
</template>
