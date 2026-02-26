<script setup lang="ts">
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
</script>

<template>
  <div class="space-y-6">
    <RoundSkippedNotice v-if="roundSkipped" />
    <Countdown v-if="secondsLeft > 0" :secondsLeft="secondsLeft" :totalSeconds="totalSeconds" />
    <BlackCardAtom :text="blackCard.text" :pick="blackCard.pick" />
    <SubmissionStatus :players="players" />
    <p class="text-yellow-400 font-semibold text-lg">
      Jsi <strong>karetní král</strong> — čekej, až ostatní vyberou karty.
    </p>
    <button
      v-if="secondsLeft === 0"
      @click="emit('forceAdvance')"
      class="w-full py-3 px-6 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl transition-colors"
    >
      Dál nečekat
    </button>
  </div>
</template>
