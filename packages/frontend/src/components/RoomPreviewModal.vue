<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLobbyStore } from '../stores/lobbyStore';
import type { RoomPreview } from '../stores/lobbyStore';

const props = defineProps<{ preview: RoomPreview }>();
const emit = defineEmits<{ join: []; close: [] }>();

const { t } = useI18n();
const lobbyStore = useLobbyStore();

const statusLabel = computed(() => {
  if (props.preview.status === 'LOBBY') return t('roomPreview.inLobby');
  if (props.preview.status === 'FINISHED') return t('roomPreview.finished');
  return t('roomPreview.inGame');
});

const statusColor = computed(() => {
  if (props.preview.status === 'LOBBY') return 'text-slate-400 bg-slate-800 border-white/10';
  if (props.preview.status === 'FINISHED') return 'text-gray-500 bg-slate-900 border-white/5';
  return 'text-green-400 bg-green-500/10 border-green-500/20';
});

const setNames = computed(() =>
  props.preview.selectedSetIds
    .map(id => lobbyStore.cardSets.find(s => s.id === id)?.name)
    .filter(Boolean)
    .join(', ')
);

const isFull = computed(() => props.preview.playerCount >= props.preview.maxPlayers);
</script>

<template>
  <!-- Backdrop -->
  <div
    class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center"
    @click.self="emit('close')"
  >
    <!-- Sheet -->
    <div class="bg-[#0d1117] border border-white/10 rounded-t-3xl w-full max-w-lg p-6 pb-[max(24px,env(safe-area-inset-bottom))]">

      <!-- Header -->
      <div class="flex items-start justify-between mb-5">
        <div>
          <h2 class="text-2xl font-black tracking-tighter uppercase italic text-white leading-none">
            {{ preview.name }}
          </h2>
          <div class="flex items-center gap-2 mt-1.5">
            <code class="font-mono text-[11px] text-slate-500">#{{ preview.code }}</code>
            <span class="w-1 h-1 bg-slate-700 rounded-full"></span>
            <span :class="['text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg border', statusColor]">
              {{ statusLabel }}
            </span>
          </div>
        </div>
        <button @click="emit('close')" class="text-slate-500 hover:text-white transition-colors p-1">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Card sets -->
      <div v-if="setNames" class="mb-4">
        <p class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1.5">
          {{ t('roomPreview.cardSets') }}
        </p>
        <p class="text-sm font-bold text-slate-300">{{ setNames }}</p>
      </div>

      <!-- Players -->
      <div class="mb-6">
        <p class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
          {{ t('roomPreview.players', { current: preview.playerCount, max: preview.maxPlayers }) }}
        </p>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="player in preview.players"
            :key="player.nickname"
            :class="[
              'text-xs font-bold px-2.5 py-1 rounded-lg border',
              player.isAfk
                ? 'text-slate-500 bg-slate-900 border-white/5'
                : 'text-slate-200 bg-slate-800 border-white/10'
            ]"
          >
            {{ player.nickname }}
            <span v-if="player.isAfk" class="text-[10px] text-slate-600 ml-1">AFK</span>
          </span>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex gap-3">
        <button
          @click="emit('close')"
          class="flex-1 py-3.5 bg-slate-800 border border-white/10 text-slate-300 text-sm font-black uppercase tracking-widest rounded-2xl active:scale-95 transition-all"
        >
          {{ t('roomPreview.back') }}
        </button>
        <button
          @click="emit('join')"
          :disabled="isFull"
          class="flex-1 py-3.5 bg-white text-black text-sm font-black uppercase tracking-widest rounded-2xl shadow-[0_4px_0_rgb(200,200,200)] active:shadow-none active:translate-y-1 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {{ t('roomPreview.join') }}
        </button>
      </div>
    </div>
  </div>
</template>
