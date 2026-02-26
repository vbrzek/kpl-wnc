<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import { useRoomStore } from '../stores/roomStore';
import CzarJudgingLayout from './game/layouts/CzarJudgingLayout.vue';
import WaitingForCzarLayout from './game/layouts/WaitingForCzarLayout.vue';

const roomStore = useRoomStore();

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

function pickWinner(submissionId: string) {
  roomStore.judgeSelect(submissionId);
}

function skipCzarJudging() {
  roomStore.skipCzarJudging();
}
</script>

<template>
  <CzarJudgingLayout
    v-if="roomStore.isCardCzar"
    :blackCard="roomStore.currentBlackCard!"
    :secondsLeft="secondsLeft"
    :totalSeconds="60"
    :submissions="roomStore.submissions"
    :roundSkipped="roomStore.roundSkipped"
    @pick="pickWinner"
  />
  <WaitingForCzarLayout
    v-else
    :blackCard="roomStore.currentBlackCard!"
    :secondsLeft="secondsLeft"
    :submissions="roomStore.submissions"
    :roundSkipped="roomStore.roundSkipped"
    @skipJudging="skipCzarJudging"
  />
</template>
