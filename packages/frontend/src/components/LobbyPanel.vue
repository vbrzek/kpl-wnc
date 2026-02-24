<script setup lang="ts">
import { ref, computed } from 'vue';
import type { GameRoom } from '@kpl/shared';
import { useRoomStore } from '../stores/roomStore';
import PlayerList from './PlayerList.vue';
import InviteLink from './InviteLink.vue';

const props = defineProps<{ room: GameRoom }>();

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
  <div class="space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-4">
      <h1 class="text-3xl font-bold">{{ room.name }}</h1>
      <InviteLink :room-code="room.code" />
    </div>

    <p v-if="errorMsg" class="text-red-400">{{ errorMsg }}</p>

    <section>
      <h2 class="text-lg font-semibold mb-2">
        Hráči ({{ room.players.length }}/{{ room.maxPlayers }})
      </h2>
      <PlayerList
        :players="room.players"
        :host-id="room.hostId"
        :my-player-id="roomStore.myPlayerId"
        :is-host="roomStore.isHost"
        @kick="kick"
      />
    </section>

    <div>
      <button
        v-if="roomStore.isHost"
        :disabled="activePlayers < 3"
        @click="startGame"
        class="bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed px-8 py-3 rounded-lg font-bold text-lg"
      >
        Spustit hru
        <span class="text-sm font-normal ml-1">({{ activePlayers }}/3 min.)</span>
      </button>
      <p v-else class="text-gray-400">
        Čekáme, až host spustí hru...
      </p>
    </div>
  </div>
</template>
