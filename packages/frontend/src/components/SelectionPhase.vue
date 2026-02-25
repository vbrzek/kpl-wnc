<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoomStore } from '../stores/roomStore';

const roomStore = useRoomStore();
const pick = computed(() => roomStore.currentBlackCard?.pick ?? 1);
const canSubmit = computed(() => roomStore.selectedCards.length === pick.value);
const retracting = ref(false);

function submit() {
  if (!canSubmit.value) return;
  roomStore.playCards(roomStore.selectedCards.map(c => c.id));
}

function retract() {
  retracting.value = true;
  roomStore.retractCards();
}
</script>

<template>
  <div class="space-y-6">
    <!-- Černá karta -->
    <div class="bg-black text-white rounded-xl p-6 max-w-sm text-xl font-bold leading-relaxed shadow-lg">
      {{ roomStore.currentBlackCard?.text ?? '...' }}
      <div class="text-sm font-normal mt-2 text-gray-400">
        Vyber {{ pick }} {{ pick === 1 ? 'kartu' : 'karty' }}
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
