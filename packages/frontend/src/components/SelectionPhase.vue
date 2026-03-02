<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoomStore } from '../stores/roomStore';
import { socket } from '../socket';
import type { WhiteCard } from '@kpl/shared';
import { useCardTranslations } from '../composables/useCardTranslations.js';
import PlayerSelectingLayout from './game/layouts/PlayerSelectingLayout.vue';
import PlayerSubmittedLayout from './game/layouts/PlayerSubmittedLayout.vue';
import CzarWaitingSelectionLayout from './game/layouts/CzarWaitingSelectionLayout.vue';

const { t, locale } = useI18n();
const roomStore = useRoomStore();
const cardTranslations = useCardTranslations();

// Watch for card/locale changes and fetch translations
watch(
  [() => roomStore.currentBlackCard, () => roomStore.hand, locale],
  async () => {
    const blackIds = roomStore.currentBlackCard ? [roomStore.currentBlackCard.id] : [];
    const whiteIds = roomStore.hand.map((c) => c.id);
    await cardTranslations.fetchTranslations(blackIds, whiteIds);
  },
  { immediate: true },
);

const translatedBlackCard = computed(() => {
  const bc = roomStore.currentBlackCard;
  if (!bc) return bc;
  return { ...bc, text: cardTranslations.getBlack(bc.id, bc.text) };
});

const translatedHand = computed(() =>
  roomStore.hand.map((c) => ({ ...c, text: cardTranslations.getWhite(c.id, c.text) })),
);

const pick = computed(() => roomStore.currentBlackCard?.pick ?? 1);
const canSubmit = computed(() => roomStore.selectedCards.length === pick.value);
const retracting = ref(false);
const showTradeConfirm = ref(false);

const canTrade = computed(
  () => !roomStore.me?.tradedThisRound && (roomStore.me?.score ?? 0) >= 1 && !roomStore.me?.hasPlayed && !roomStore.isCardCzar
);

function onTradeRequest() {
  showTradeConfirm.value = true;
}

function confirmTrade() {
  showTradeConfirm.value = false;
  roomStore.tradeCards();
}

function cancelTrade() {
  showTradeConfirm.value = false;
}

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

function czarForceAdvance() {
  roomStore.czarForceAdvance();
}

watch(() => roomStore.hand, () => { retracting.value = false; });

function onGameError() { retracting.value = false; }
socket.on('game:error', onGameError);
onUnmounted(() => { socket.off('game:error', onGameError); });

const players = computed(() => roomStore.room?.players ?? []);
const czarNickname = computed(() =>
  roomStore.room?.players.find(p => p.id === roomStore.czarId)?.nickname ?? ''
);

const endingGame = ref(false);
async function onEndGame() {
  endingGame.value = true;
  await roomStore.endGame();
  endingGame.value = false;
}
</script>

<template>
  <CzarWaitingSelectionLayout
    v-if="roomStore.isCardCzar"
    :blackCard="translatedBlackCard!"
    :secondsLeft="secondsLeft"
    :totalSeconds="45"
    :players="players"
    :roundSkipped="roomStore.roundSkipped"
    :czarNickname="czarNickname"
    @forceAdvance="czarForceAdvance"
  />
  <PlayerSubmittedLayout
    v-else-if="roomStore.me?.hasPlayed"
    :blackCard="translatedBlackCard!"
    :secondsLeft="secondsLeft"
    :totalSeconds="45"
    :players="players"
    :retracting="retracting"
    :roundSkipped="roomStore.roundSkipped"
    :czarNickname="czarNickname"
    @retract="retract"
  />
  <PlayerSelectingLayout
    v-else
    :blackCard="translatedBlackCard!"
    :secondsLeft="secondsLeft"
    :totalSeconds="45"
    :players="players"
    :hand="translatedHand"
    :selectedCards="roomStore.selectedCards"
    :canSubmit="canSubmit"
    :canTrade="canTrade"
    :roundSkipped="roomStore.roundSkipped"
    @toggleCard="roomStore.toggleCardSelection"
    :czarNickname="czarNickname"
    @submit="submit"
    @trade="onTradeRequest"
  />
  <!-- Trade confirm modal -->
  <Teleport to="body">
    <div
      v-if="showTradeConfirm"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      @click.self="cancelTrade"
    >
      <div class="bg-gray-900 border border-gray-700 rounded-2xl p-6 mx-4 max-w-sm w-full shadow-2xl">
        <h2 class="text-lg font-bold text-white mb-2">{{ t('game.selection.tradeConfirmTitle') }}</h2>
        <p class="text-gray-400 text-sm mb-6">{{ t('game.selection.tradeConfirmText') }}</p>
        <div class="flex gap-3">
          <button
            @click="cancelTrade"
            class="flex-1 py-3 rounded-xl font-semibold text-gray-300 bg-gray-800 hover:bg-gray-700 transition-colors"
          >
            {{ t('game.selection.tradeCancel') }}
          </button>
          <button
            @click="confirmTrade"
            class="flex-1 py-3 rounded-xl font-black text-black bg-yellow-500 hover:bg-yellow-400 transition-colors shadow-[0_4px_0_rgb(161,98,7)] active:shadow-none active:translate-y-0.5"
          >
            {{ t('game.selection.tradeConfirm') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
  <div v-if="roomStore.isHost" class="mt-4 text-center">
    <button
      @click="onEndGame"
      :disabled="endingGame"
      class="bg-red-700 hover:bg-red-600 text-white font-semibold px-5 py-2 rounded-lg text-sm disabled:opacity-40"
    >
      {{ t('game.results.endGame') }}
    </button>
  </div>
</template>
