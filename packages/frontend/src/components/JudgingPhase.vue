<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoomStore } from '../stores/roomStore';
import { useCardTranslations } from '../composables/useCardTranslations.js';
import CzarJudgingLayout from './game/layouts/CzarJudgingLayout.vue';
import WaitingForCzarLayout from './game/layouts/WaitingForCzarLayout.vue';

const { locale } = useI18n();
const roomStore = useRoomStore();
const cardTranslations = useCardTranslations();

watch(
  [() => roomStore.currentBlackCard, () => roomStore.submissions, locale],
  async () => {
    const blackIds = roomStore.currentBlackCard ? [roomStore.currentBlackCard.id] : [];
    const whiteIds = roomStore.submissions.flatMap((s) => s.cards.map((c) => c.id));
    await cardTranslations.fetchTranslations(blackIds, whiteIds);
  },
  { immediate: true },
);

const translatedBlackCard = computed(() => {
  const bc = roomStore.currentBlackCard;
  if (!bc) return bc;
  return { ...bc, text: cardTranslations.getBlack(bc.id, bc.text) };
});

const translatedSubmissions = computed(() =>
  roomStore.submissions.map((s) => ({
    ...s,
    cards: s.cards.map((c) => ({ ...c, text: cardTranslations.getWhite(c.id, c.text) })),
  })),
);

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
    :blackCard="translatedBlackCard!"
    :secondsLeft="secondsLeft"
    :totalSeconds="60"
    :submissions="translatedSubmissions"
    :roundSkipped="roomStore.roundSkipped"
    @pick="pickWinner"
  />
  <WaitingForCzarLayout
    v-else
    :blackCard="translatedBlackCard!"
    :secondsLeft="secondsLeft"
    :submissions="translatedSubmissions"
    :roundSkipped="roomStore.roundSkipped"
    @skipJudging="skipCzarJudging"
  />
</template>
