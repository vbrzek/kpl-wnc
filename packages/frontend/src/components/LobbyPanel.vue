<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { GameRoom, SpecialRule, CzarMode } from '@kpl/shared';
import { useRoomStore } from '../stores/roomStore';
import PlayerList from './PlayerList.vue';
import InviteLink from './InviteLink.vue';
import RoomSettingsModal from './RoomSettingsModal.vue';

const RULE_ICONS: Record<SpecialRule, string> = {
  rando_cardrissian: '🎲',
  wheatons_law: '🃏',
  rebooting_universe: '♻️',
  high_stakes: '💰',
};

const CZAR_MODE_ICONS: Record<CzarMode, string> = {
  classic: '🔄',
  meritocracy: '🏆',
  god_mode: '👑',
  czar_is_dead: '🗳️',
};

const props = defineProps<{ room: GameRoom }>();

const { t } = useI18n();
const roomStore = useRoomStore();
const errorMsg = ref('');
const showSettings = ref(false);

const winConditionLabel = computed(() => {
  const room = props.room;
  switch (room.winCondition ?? 'score') {
    case 'score': return t('lobby.winConditionScore', { n: room.targetScore });
    case 'time': return t('lobby.winConditionTime', { n: room.gameTimeLimit });
    case 'rounds': return t('lobby.winConditionRounds', { n: room.targetRounds });
  }
});

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
    
    <div class="flex items-center justify-between gap-4 border-b border-white/5 pt-4 pb-6">
      <div class="flex flex-col">
        <span class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">{{ t('createTable.tableName') }}</span>
        <h1 class="text-3xl font-black tracking-tighter uppercase italic text-white leading-none">
          {{ room.name }}
        </h1>
      </div>
      <InviteLink :room-code="room.code" class="shrink-0 self-center" />
    </div>

    <p v-if="errorMsg" class="bg-red-500/10 text-red-400 p-4 rounded-2xl border border-red-500/20 text-sm font-bold animate-pulse">
      {{ errorMsg }}
    </p>

    <!-- Win condition chip + settings button -->
    <div class="flex items-center justify-between pt-4 pb-4 border-b border-white/5">
      <span class="text-xs font-bold text-slate-400">{{ winConditionLabel }}</span>
      <button
        v-if="roomStore.isHost"
        @click="showSettings = true"
        class="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 hover:text-white transition-colors px-3 py-1.5 rounded-xl border border-white/10 hover:border-white/20"
      >
        {{ t('lobby.settings') }}
      </button>
    </div>

    <!-- Active czar mode + special rules chips -->
    <div v-if="roomStore.czarMode !== 'classic' || roomStore.specialRules.length > 0" class="flex flex-wrap gap-1.5 pt-3 pb-4 border-b border-white/5">
      <span
        v-if="roomStore.czarMode !== 'classic'"
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-400/10 border border-yellow-400/20 text-yellow-400 text-xs font-bold"
      >
        {{ CZAR_MODE_ICONS[roomStore.czarMode] }} {{ t(`specialRules.czarMode.${roomStore.czarMode}.name`) }}
      </span>
      <span
        v-for="rule in roomStore.specialRules"
        :key="rule"
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-400/10 border border-yellow-400/20 text-yellow-400 text-xs font-bold"
      >
        {{ RULE_ICONS[rule] }} {{ t(`specialRules.${rule}.name`) }}
      </span>
    </div>

    <section class="pt-4">
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
          :has-rando="roomStore.hasRule('rando_cardrissian')"
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

    <RoomSettingsModal
      v-if="showSettings"
      :room="props.room"
      @close="showSettings = false"
    />
</template>
