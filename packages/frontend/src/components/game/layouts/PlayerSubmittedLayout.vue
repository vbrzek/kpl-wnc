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
  <div class="space-y-6">
    <RoundSkippedNotice v-if="roundSkipped" />
    <Countdown v-if="secondsLeft > 0" :secondsLeft="secondsLeft" :totalSeconds="totalSeconds" />
    <BlackCardAtom :text="blackCard.text" :pick="blackCard.pick" />
    <SubmissionStatus :players="players" />
    <div class="space-y-3">
      <p class="text-green-400 font-semibold text-lg">{{ t('game.submitted.waiting') }}</p>
      <button
        @click="emit('retract')"
        :disabled="retracting"
        class="bg-gray-700 hover:bg-gray-600 text-white font-semibold px-6 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {{ t('game.submitted.retract') }}
      </button>
    </div>
  </div>
</template>
