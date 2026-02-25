<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue';
import { useRoomStore } from '../stores/roomStore';
import { socket } from '../socket';

const roomStore = useRoomStore();
const pick = computed(() => roomStore.currentBlackCard?.pick ?? 1);
const canSubmit = computed(() => roomStore.selectedCards.length === pick.value);
const retracting = ref(false);

// --- Countdown ---
const secondsLeft = ref(0);
let countdownInterval: ReturnType<typeof setInterval> | null = null;

watch(
  () => roomStore.room?.roundDeadline,
  (deadline) => {
    if (countdownInterval) clearInterval(countdownInterval);
    if (!deadline) { secondsLeft.value = 0; return; }
    const update = () => {
      secondsLeft.value = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    };
    update();
    countdownInterval = setInterval(update, 1000);
  },
  { immediate: true }
);

onUnmounted(() => {
  if (countdownInterval) clearInterval(countdownInterval);
});

// --- Submission status ---
const players = computed(() => roomStore.room?.players ?? []);
const czar = computed(() => players.value.find(p => p.isCardCzar));
const waitingFor = computed(() => players.value.filter(p => !p.isCardCzar && !p.isAfk && !p.hasPlayed));
const submitted = computed(() => players.value.filter(p => !p.isCardCzar && p.hasPlayed));
const afkPlayers = computed(() => players.value.filter(p => !p.isCardCzar && p.isAfk && !p.hasPlayed));

// --- Submit / retract ---
function submit() {
  if (!canSubmit.value) return;
  roomStore.playCards(roomStore.selectedCards.map(c => c.id));
}

function retract() {
  retracting.value = true;
  roomStore.retractCards();
}

watch(() => roomStore.hand, () => { retracting.value = false; });

function onGameError() { retracting.value = false; }
socket.on('game:error', onGameError);
onUnmounted(() => { socket.off('game:error', onGameError); });
</script>

<template>
  <div class="space-y-6">
    <!-- Notifikace: kolo přeskočeno -->
    <div v-if="roomStore.roundSkipped" class="bg-orange-900 border border-orange-500 text-orange-200 rounded-lg px-4 py-3 text-sm">
      Kolo bylo přeskočeno — časový limit vypršel.
    </div>

    <!-- Countdown -->
    <div v-if="secondsLeft > 0" class="flex items-center gap-2">
      <div class="flex-1 bg-gray-700 rounded-full h-2">
        <div
          class="h-2 rounded-full transition-all"
          :class="secondsLeft <= 10 ? 'bg-red-500' : 'bg-yellow-400'"
          :style="{ width: `${(secondsLeft / 45) * 100}%` }"
        />
      </div>
      <span class="text-sm font-mono" :class="secondsLeft <= 10 ? 'text-red-400' : 'text-gray-300'">
        {{ secondsLeft }}s
      </span>
    </div>

    <!-- Černá karta -->
    <div class="bg-black text-white rounded-xl p-6 max-w-sm text-xl font-bold leading-relaxed shadow-lg">
      {{ roomStore.currentBlackCard?.text ?? '...' }}
      <div class="text-sm font-normal mt-2 text-gray-400">
        Vyber {{ pick }} {{ pick === 1 ? 'kartu' : 'karty' }}
      </div>
    </div>

    <!-- Stav odevzdání -->
    <div class="text-sm space-y-1 bg-gray-800 rounded-lg px-4 py-3">
      <div v-if="czar" class="text-yellow-400">
        🎴 {{ czar.nickname }} — Card Czar
      </div>
      <div v-for="p in submitted" :key="p.id" class="text-green-400">
        ✓ {{ p.nickname }}
      </div>
      <div v-for="p in waitingFor" :key="p.id" class="text-gray-400">
        ⏳ {{ p.nickname }}
      </div>
      <div v-for="p in afkPlayers" :key="p.id" class="text-gray-600">
        💤 {{ p.nickname }} (AFK)
      </div>
    </div>

    <!-- Czar čeká -->
    <p v-if="roomStore.isCardCzar" class="text-yellow-400 font-semibold text-lg">
      Jsi Card Czar — čekej, až ostatní vyberou karty.
    </p>

    <!-- Hráč odeslal — může změnit výběr -->
    <div v-else-if="roomStore.me?.hasPlayed" class="space-y-3">
      <p class="text-green-400 font-semibold text-lg">
        Karty odeslány — čekáme na ostatní...
      </p>
      <button
        @click="retract"
        :disabled="retracting"
        class="bg-gray-700 hover:bg-gray-600 text-white font-semibold px-6 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Změnit výběr
      </button>
    </div>

    <!-- Výběr karet -->
    <template v-else>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <button
          v-for="card in roomStore.hand"
          :key="card.id"
          @click="roomStore.toggleCardSelection(card)"
          :class="[
            'bg-white text-black rounded-lg p-4 text-sm font-medium text-left transition-all border-4',
            roomStore.selectedCards.some(c => c.id === card.id)
              ? 'border-yellow-400 ring-2 ring-yellow-400'
              : 'border-transparent hover:border-gray-300',
          ]"
        >
          {{ card.text }}
        </button>
      </div>

      <button
        @click="submit"
        :disabled="!canSubmit"
        class="bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-8 py-3 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Odeslat {{ roomStore.selectedCards.length }}/{{ pick }} karet
      </button>
    </template>
  </div>
</template>
