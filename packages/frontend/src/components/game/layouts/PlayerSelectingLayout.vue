<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { BlackCard, WhiteCard, Player } from '@kpl/shared'
import Countdown from '../atoms/Countdown.vue'
import BlackCardAtom from '../atoms/BlackCard.vue'
import CardHand from '../atoms/CardHand.vue'
import RoundSkippedNotice from '../atoms/RoundSkippedNotice.vue'
import CzarBadge from '../atoms/CzarBadge.vue'

const props = defineProps<{
  blackCard: BlackCard
  secondsLeft: number
  totalSeconds: number
  players: Player[]
  hand: WhiteCard[]
  selectedCards: WhiteCard[]
  canSubmit: boolean
  canTrade: boolean
  roundSkipped: boolean
  czarNickname: string
  canBet?: boolean
  betPlaced?: boolean
  currentBet?: number
  maxBet?: number
  betError?: string
}>()

const emit = defineEmits<{
  toggleCard: [card: WhiteCard]
  submit: []
  trade: []
  placeBet: [amount: number]
}>()

const { t } = useI18n();

const showBetSlider = ref(false);
const localBetAmount = ref(0);

watch(() => props.canBet, (newVal) => {
  if (!newVal) { showBetSlider.value = false; localBetAmount.value = 0; }
});

watch(() => props.betPlaced, (newVal) => {
  if (newVal) showBetSlider.value = false;
});

function toggleBetSlider() {
  showBetSlider.value = !showBetSlider.value;
  if (showBetSlider.value && props.betPlaced) {
    localBetAmount.value = props.currentBet ?? 0;
  }
}
</script>

<template>
  <div class="flex flex-col h-full min-h-0 pt-4">
    <div class="flex-none space-y-4 mb-4">
      <RoundSkippedNotice v-if="roundSkipped" />
      <div v-if="secondsLeft > 0" class="px-1">
        <Countdown :secondsLeft="secondsLeft" :totalSeconds="totalSeconds" />
      </div>
      <BlackCardAtom :text="blackCard.text" :pick="blackCard.pick" />
      <CzarBadge :czarNickname="czarNickname" :isMe="false" />
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto pb-24">
      <CardHand
        :cards="hand"
        :selectedCards="selectedCards"
        :pick="blackCard.pick"
        @toggle="emit('toggleCard', $event)"
      />
      <div v-if="canTrade || canBet" class="px-1 mt-4 flex gap-2 justify-center">
        <button
          v-if="canTrade"
          @click="emit('trade')"
          class="px-4 py-2 rounded-xl text-sm font-semibold text-gray-300 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-500 transition-colors"
        >
          {{ t('game.selection.trade') }}
        </button>
        <button
          v-if="canBet"
          @click="toggleBetSlider"
          :class="[
            'px-4 py-2 rounded-xl text-sm font-semibold border transition-colors',
            showBetSlider
              ? 'bg-yellow-400/10 border-yellow-400/40 text-yellow-400'
              : 'text-gray-300 bg-gray-800 hover:bg-gray-700 border-gray-700 hover:border-gray-500',
          ]"
        >
          {{ betPlaced ? t('specialRules.betActive', { amount: currentBet }) : t('specialRules.placeBet') }}
        </button>
      </div>

      <div v-if="canBet && showBetSlider" class="px-1 mt-3">
        <div class="bg-yellow-400/5 border border-yellow-400/20 rounded-xl p-4 space-y-3">
          <div class="flex items-center gap-3">
            <input
              v-model.number="localBetAmount"
              type="range" min="0" :max="maxBet ?? 0" step="1"
              class="flex-1 accent-yellow-400"
            />
            <span class="text-white font-black text-lg w-8 text-right">{{ localBetAmount }}</span>
          </div>
          <button
            @click="emit('placeBet', localBetAmount)"
            class="w-full py-2 bg-yellow-400 text-black font-black text-sm rounded-xl"
          >
            {{ t('specialRules.betConfirm') }}
          </button>
          <p v-if="betError" class="text-red-400 text-xs">{{ betError }}</p>
        </div>
      </div>
    </div>

    <div class="fixed bottom-0 inset-x-0 p-4 bg-gradient-to-t from-gray-900 via-gray-900 to-transparent z-20">
      <div class="max-w-6xl mx-auto">
        <button
          @click="emit('submit')"
          :disabled="!canSubmit"
          class="w-full py-4 rounded-2xl font-black uppercase tracking-[0.2em] transition-all shadow-2xl flex items-center justify-center gap-3
                 disabled:bg-gray-800 disabled:text-gray-600
                 bg-yellow-500 text-black active:scale-[0.97] shadow-[0_6px_0_rgb(161,98,7)] active:shadow-none active:translate-y-1"
        >
          <span>{{ t('game.selection.submit') }}</span>
          <span v-if="selectedCards.length > 0" class="bg-black/20 px-2 py-0.5 rounded text-sm">
            {{ selectedCards.length }}/{{ blackCard.pick }}
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
