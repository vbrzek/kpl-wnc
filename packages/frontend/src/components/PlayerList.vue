<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { Player } from '@kpl/shared';
import Avatar from './Avatar.vue';

defineProps<{
  players: Player[];
  hostId: string;
  myPlayerId: string | null;
  isHost: boolean;
  hasRando?: boolean;
}>();

const emit = defineEmits<{ kick: [playerId: string] }>();
const { t } = useI18n();
</script>

<template>
  <ul class="space-y-2">
    <li
      v-for="player in players"
      :key="player.id"
      class="flex items-center justify-between bg-gray-700 px-4 py-2 rounded"
    >
      <span class="flex items-center gap-2">
        <Avatar :nickname="player.nickname" :size="32" />
        {{ player.nickname }}
        <span v-if="player.id === hostId" class="text-xs text-yellow-400">({{ t('player.host') }})</span>
        <span v-if="player.id === myPlayerId" class="text-xs text-green-400">({{ t('player.you') }})</span>
        <span v-if="player.isAfk" class="text-xs text-gray-400 bg-gray-600 px-1 rounded">{{ t('player.afk') }}</span>
        <span
          v-else-if="!player.isOnline"
          class="text-xs text-orange-400"
        >{{ t('player.offline') }}</span>
      </span>
      <button
        v-if="isHost && player.id !== myPlayerId"
        @click="emit('kick', player.id)"
        class="text-xs text-red-400 hover:text-red-300"
      >
        {{ t('player.kick') }}
      </button>
    </li>
    <!-- Rando Cardrissian virtual player -->
    <li
      v-if="hasRando"
      class="flex items-center justify-between bg-gray-700 px-4 py-2 rounded"
    >
      <span class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-base shrink-0">🎲</div>
        <span class="text-slate-400 font-bold">Rando Cardrissian</span>
        <span class="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">BOT</span>
      </span>
    </li>
  </ul>
</template>
