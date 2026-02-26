<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { GameRoom } from '@kpl/shared';
import { useRoomStore } from '../stores/roomStore';
import PlayerList from './PlayerList.vue';
import InviteLink from './InviteLink.vue';

const props = defineProps<{ room: GameRoom }>();

const { t } = useI18n();
const roomStore = useRoomStore();
const errorMsg = ref('');

const activePlayers = computed(() =>
  props.room.players.filter(p => !p.isAfk).length
);

async function kick(playerId: string) {
  const err = await roomStore.kickPlayer(playerId);
  if (err) errorMsg.value = err.error;
}

async function startGame() {
  const err = await roomStore.startGame();
  if (err) errorMsg.value = err.error;
}
</script>

<template>
  <div class="flex flex-col gap-8 pt-4 pb-24 max-w-2xl mx-auto">
    
    <div class="flex items-center justify-between gap-4 border-b border-white/5 pb-6">
      <div class="flex flex-col">
        <span class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">Název stolu</span>
        <h1 class="text-3xl font-black tracking-tighter uppercase italic text-white leading-none">
          {{ room.name }}
        </h1>
      </div>
      <InviteLink :room-code="room.code" class="shrink-0" />
    </div>

    <p v-if="errorMsg" class="bg-red-500/10 text-red-400 p-4 rounded-2xl border border-red-500/20 text-sm font-bold animate-pulse">
      {{ errorMsg }}
    </p>

    <section>
      <div class="flex items-center justify-between mb-4 px-1">
        <h2 class="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-500">
          {{ t('lobby.players', { current: room.players.length, max: room.maxPlayers }) }}
        </h2>
        <div class="flex gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
        </div>
      </div>

      <div class="bg-slate-900/40 rounded-3xl border border-white/5 overflow-hidden shadow-inner">
        <PlayerList
          :players="room.players"
          :host-id="room.hostId"
          :my-player-id="roomStore.myPlayerId"
          :is-host="roomStore.isHost"
          @kick="kick"
        />
      </div>
    </section>

    <div class="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#05070a] via-[#05070a] to-transparent z-40">
      <div class="max-w-md mx-auto">
        <button
          v-if="roomStore.isHost"
          :disabled="activePlayers < 3"
          @click="startGame"
          class="w-full py-4 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-sm shadow-2xl shadow-white/5 active:scale-95 transition-all disabled:opacity-20 disabled:grayscale disabled:cursor-not-allowed"
        >
          <div class="flex flex-col">
            <span>{{ t('lobby.startGame') }}</span>
            <span class="text-[9px] font-bold opacity-60 lowercase mt-0.5">
              {{ t('lobby.minPlayers', { current: activePlayers }) }}
            </span>
          </div>
        </button>
        
        <div v-else class="w-full py-5 bg-slate-900/90 border border-white/10 text-slate-400 rounded-2xl font-bold uppercase tracking-[0.15em] text-[11px] text-center backdrop-blur-md">
          <span class="flex items-center justify-center gap-2">
            <span class="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-ping"></span>
            {{ t('lobby.waitingForHost') }}
          </span>
        </div>
      </div>
      <div class="h-[env(safe-area-inset-bottom)]"></div>
    </div>
  </div>
</template>
