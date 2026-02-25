<script setup lang="ts">
import { useRoomStore } from '../stores/roomStore';

const roomStore = useRoomStore();

function pickWinner(submissionId: string) {
  if (!roomStore.isCardCzar) return;
  roomStore.judgeSelect(submissionId);
}
</script>

<template>
  <div class="space-y-6">
    <!-- Černá karta -->
    <div class="bg-black text-white rounded-xl p-6 max-w-sm text-xl font-bold leading-relaxed shadow-lg">
      {{ roomStore.currentBlackCard?.text ?? '...' }}
    </div>

    <!-- Instrukce -->
    <p v-if="roomStore.isCardCzar" class="text-yellow-400 font-semibold text-lg">
      Jsi Card Czar — vyber nejlepší odpověď!
    </p>
    <p v-else class="text-gray-400 text-lg">
      Card Czar vybírá vítěze...
    </p>

    <!-- Anonymní submise -->
    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      <button
        v-for="submission in roomStore.submissions"
        :key="submission.submissionId"
        @click="pickWinner(submission.submissionId)"
        :disabled="!roomStore.isCardCzar"
        class="bg-white text-black rounded-xl p-5 text-left space-y-2 border-4 border-transparent transition-all"
        :class="roomStore.isCardCzar ? 'hover:border-yellow-400 cursor-pointer' : 'cursor-default'"
      >
        <p v-for="card in submission.cards" :key="card.id" class="font-medium">
          {{ card.text }}
        </p>
      </button>
    </div>
  </div>
</template>
