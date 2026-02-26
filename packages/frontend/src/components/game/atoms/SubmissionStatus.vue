<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n';
import type { Player } from '@kpl/shared'

const props = defineProps<{
  players: Player[]
}>()

const czar = computed(() => props.players.find(p => p.isCardCzar))
const submitted = computed(() => props.players.filter(p => !p.isCardCzar && p.hasPlayed))
const waitingFor = computed(() => props.players.filter(p => !p.isCardCzar && !p.isAfk && !p.hasPlayed))
const afkPlayers = computed(() => props.players.filter(p => !p.isCardCzar && p.isAfk && !p.hasPlayed))

const { t } = useI18n();
</script>

<template>
  <div class="w-full space-y-2">
    <h3 class="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-3 px-1">
      {{ t('game.status.playerProgress') || 'Stav hráčů' }}
    </h3>

    <div class="grid grid-cols-1 gap-2">
      <div v-if="czar" class="flex items-center justify-between bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-2.5">
        <div class="flex items-center gap-3">
          <div class="w-2 h-2 bg-yellow-500 rounded-full shadow-[0_0_8px_rgba(234,179,8,0.6)]"></div>
          <span class="font-bold text-sm text-yellow-500">{{ czar.nickname }}</span>
        </div>
        <span class="text-[9px] font-black uppercase tracking-wider text-yellow-500/60 italic">
          {{ t('game.czar.label') }}
        </span>
      </div>

      <div v-for="p in submitted" :key="p.id" 
        class="flex items-center justify-between bg-white/5 border border-white/5 rounded-xl px-4 py-2.5 transition-all">
        <div class="flex items-center gap-3">
          <div class="w-5 h-5 bg-green-500/20 rounded-full flex items-center justify-center">
            <svg class="w-3 h-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="4">
              <path d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span class="font-bold text-sm text-gray-200">{{ p.nickname }}</span>
        </div>
      </div>

      <div v-for="p in waitingFor" :key="p.id" 
        class="flex items-center justify-between bg-white/[0.02] border border-dashed border-white/10 rounded-xl px-4 py-2.5">
        <div class="flex items-center gap-3">
          <div class="w-5 h-5 rounded-full border-2 border-white/10 flex items-center justify-center">
            <div class="w-1 h-1 bg-white/20 rounded-full animate-ping"></div>
          </div>
          <span class="font-bold text-sm text-gray-500 italic">{{ p.nickname }}</span>
        </div>
        <span class="text-[9px] font-black uppercase text-gray-600 animate-pulse">{{ t('game.status.waiting') }}</span>
      </div>

      <div v-for="p in afkPlayers" :key="p.id" 
        class="flex items-center gap-3 px-4 py-1 opacity-40">
        <span class="text-[10px]">💤</span>
        <span class="text-xs font-medium">{{ p.nickname }} (AFK)</span>
      </div>
    </div>
  </div>
</template>