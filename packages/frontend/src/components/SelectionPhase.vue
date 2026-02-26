<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue';
import { useRoomStore } from '../stores/roomStore';
import { socket } from '../socket';
import type { WhiteCard } from '@kpl/shared';
import PlayerSelectingLayout from './game/layouts/PlayerSelectingLayout.vue';
import PlayerSubmittedLayout from './game/layouts/PlayerSubmittedLayout.vue';
import CzarWaitingSelectionLayout from './game/layouts/CzarWaitingSelectionLayout.vue';

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

const players = computed(() => roomStore.room?.players ?? []);
</script>

<template>
  <CzarWaitingSelectionLayout
    v-if="roomStore.isCardCzar"
    :blackCard="roomStore.currentBlackCard!"
    :secondsLeft="secondsLeft"
    :totalSeconds="45"
    :players="players"
    :roundSkipped="roomStore.roundSkipped"
  />
  <PlayerSubmittedLayout
    v-else-if="roomStore.me?.hasPlayed"
    :blackCard="roomStore.currentBlackCard!"
    :secondsLeft="secondsLeft"
    :totalSeconds="45"
    :players="players"
    :retracting="retracting"
    :roundSkipped="roomStore.roundSkipped"
    @retract="retract"
  />
  <PlayerSelectingLayout
    v-else
    :blackCard="roomStore.currentBlackCard!"
    :secondsLeft="secondsLeft"
    :totalSeconds="45"
    :players="players"
    :hand="roomStore.hand"
    :selectedCards="roomStore.selectedCards"
    :canSubmit="canSubmit"
    :roundSkipped="roomStore.roundSkipped"
    @toggleCard="roomStore.toggleCardSelection"
    @submit="submit"
  />
</template>
