<script setup lang="ts">
import type { BlackCard, AnonymousSubmission } from '@kpl/shared'
import Countdown from '../atoms/Countdown.vue'
import BlackCardAtom from '../atoms/BlackCard.vue'
import SubmissionGrid from '../atoms/SubmissionGrid.vue'
import RoundSkippedNotice from '../atoms/RoundSkippedNotice.vue'

defineProps<{
  blackCard: BlackCard
  secondsLeft: number
  totalSeconds: number
  submissions: AnonymousSubmission[]
  roundSkipped: boolean
}>()

const emit = defineEmits<{
  pick: [submissionId: string]
}>()
</script>

<template>
  <div class="space-y-6">
    <RoundSkippedNotice v-if="roundSkipped" />
    <Countdown v-if="secondsLeft > 0" :secondsLeft="secondsLeft" :totalSeconds="totalSeconds" />
    <BlackCardAtom :text="blackCard.text" />
    <p class="text-yellow-400 font-semibold text-lg">Jsi karetní král — vyber nejlepší odpověď!</p>
    <SubmissionGrid :submissions="submissions" :selectable="true" @pick="emit('pick', $event)" />
  </div>
</template>
