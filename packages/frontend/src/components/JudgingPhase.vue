<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import { useRoomStore } from '../stores/roomStore';

const roomStore = useRoomStore();

// --- Countdown (60s pro JUDGING) ---
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

function pickWinner(submissionId: string) {
  if (!roomStore.isCardCzar) return;
  roomStore.judgeSelect(submissionId);
}
</script>

<template>
  <div class="space-y-6">
    <!-- Notifikace: kolo přeskočeno -->
    <div v-if="roomStore.roundSkipped" class="bg-orange-900 border border-orange-500 text-orange-200 rounded-lg px-4 py-3 text-sm">
      Kolo bylo přeskočeno — časový limit vypršel.
    </div>

    <!-- Countdown (pouze pro cara) -->
    <div v-if="roomStore.isCardCzar && secondsLeft > 0" class="flex items-center gap-2">
      <div class="flex-1 bg-gray-700 rounded-full h-2">
        <div
          class="h-2 rounded-full transition-all"
          :class="secondsLeft <= 10 ? 'bg-red-500' : 'bg-yellow-400'"
          :style="{ width: `${(secondsLeft / 60) * 100}%` }"
        />
      </div>
      <span class="text-sm font-mono" :class="secondsLeft <= 10 ? 'text-red-400' : 'text-gray-300'">
        {{ secondsLeft }}s
      </span>
    </div>

    <!-- Černá karta -->
    <div class="bg-black text-white rounded-xl p-6 max-w-sm text-xl font-bold leading-relaxed shadow-lg">
      {{ roomStore.currentBlackCard?.text ?? '...' }}
    </div>

    <!-- Instrukce -->
    <p v-if="roomStore.isCardCzar" class="text-yellow-400 font-semibold text-lg">
      Jsi karetní král — vyber nejlepší odpověď!
    </p>
    <p v-else class="text-gray-400 text-lg">
      Karetní král vybírá vítěze...
      <span v-if="secondsLeft > 0" class="ml-2 text-sm text-gray-500">({{ secondsLeft }}s)</span>
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
