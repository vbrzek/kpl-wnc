<script setup lang="ts">
import type { BlackCard, Player } from '@kpl/shared'
import { useI18n } from 'vue-i18n'
import Countdown from '../atoms/Countdown.vue'
import BlackCardAtom from '../atoms/BlackCard.vue'
import SubmissionStatus from '../atoms/SubmissionStatus.vue'
import RoundSkippedNotice from '../atoms/RoundSkippedNotice.vue'

const { t } = useI18n()

defineProps<{
  blackCard: BlackCard
  secondsLeft: number
  totalSeconds: number
  players: Player[]
  retracting: boolean
  roundSkipped: boolean
}>()

const emit = defineEmits<{
  retract: []
}>()
</script>

<template>
  <div class="flex flex-col h-full min-h-0 pt-4">
    <div class="flex-none space-y-4 mb-8">
      <div v-if="secondsLeft > 0">
        <Countdown :secondsLeft="secondsLeft" :totalSeconds="totalSeconds" />
      </div>
    </div>

    <div class="flex-1 flex flex-col items-center justify-center text-center px-6">
      

      <h2 class="text-xl font-black leading-tight mb-2">
        {{ t('game.submitted.waiting') }}
      </h2>
      
      <p class="text-gray-500 text-sm font-medium mb-8">
        {{ t('game.submitted.longText') }}
      </p>

      <div class="w-full max-w-xs">
        <SubmissionStatus :players="players" />
      </div>
    </div>

    <div class="flex-none p-6 flex justify-center">
      <button
        @click="emit('retract')"
        :disabled="retracting"
        class="group flex items-center gap-2 text-gray-500 hover:text-white transition-colors py-2 px-4 rounded-xl border border-transparent hover:border-white/10 active:bg-white/5"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 transition-transform group-hover:-translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>
        </svg>
        <span class="text-xs font-black uppercase tracking-widest">
          {{ t('game.submitted.retract') }}
        </span>
      </button>
    </div>
  </div>
</template>