<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { BlackCard, Player } from '@kpl/shared'
import Countdown from '../atoms/Countdown.vue'
import BlackCardAtom from '../atoms/BlackCard.vue'
import SubmissionStatus from '../atoms/SubmissionStatus.vue'
import RoundSkippedNotice from '../atoms/RoundSkippedNotice.vue'

defineProps<{
  blackCard: BlackCard
  secondsLeft: number
  totalSeconds: number
  players: Player[]
  roundSkipped: boolean
}>()

const emit = defineEmits<{
  forceAdvance: []
}>()

const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col h-full min-h-0 pt-4">
    <div class="flex-none space-y-4 mb-6">
      <BlackCardAtom :text="blackCard.text" :pick="blackCard.pick" />
      <div v-if="secondsLeft > 0">
        <Countdown :secondsLeft="secondsLeft" :totalSeconds="totalSeconds" />
      </div>
    </div>

    <div class="flex-1 overflow-y-auto px-1 pb-24 custom-scrollbar">
      <div class="bg-yellow-500/5 border border-yellow-500/10 rounded-3xl p-6 text-center mb-6">
        <div class="inline-flex items-center justify-center w-16 h-16 bg-yellow-500/10 rounded-full mb-4">
          <span class="text-3xl">👑</span>
        </div>
        <h2 class="text-xl font-black text-yellow-500 leading-tight mb-2">
          {{ t('game.czar.waiting') }}
        </h2>
        <p class="text-gray-500 text-sm">
          {{ t('game.czar.waitingText') }}
        </p>
      </div>

      <SubmissionStatus :players="players" />
    </div>

    <div v-if="secondsLeft === 0" class="fixed bottom-0 inset-x-0 p-4 bg-gradient-to-t from-gray-900 via-gray-900 to-transparent">
      <div class="max-w-6xl mx-auto">
        <button
          @click="emit('forceAdvance')"
          class="w-full py-4 bg-white text-black font-black uppercase tracking-widest rounded-2xl shadow-[0_4px_0_rgb(200,200,200)] active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-3"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="13 17 18 12 13 7"></polyline>
            <polyline points="6 17 11 12 6 7"></polyline>
          </svg>
          {{ t('game.czar.forceAdvance') }}
        </button>
        <p class="text-center text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-3">
          {{ t('game.czar.forceAdvanceHint') }}
        </p>
      </div>
    </div>
  </div>
</template>