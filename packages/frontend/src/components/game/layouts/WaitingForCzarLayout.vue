<script setup lang="ts">
import type { BlackCard, AnonymousSubmission } from '@kpl/shared'
import BlackCardAtom from '../atoms/BlackCard.vue'
import SubmissionGrid from '../atoms/SubmissionGrid.vue'
import RoundSkippedNotice from '../atoms/RoundSkippedNotice.vue'

defineProps<{
  blackCard: BlackCard
  secondsLeft: number
  submissions: AnonymousSubmission[]
  roundSkipped: boolean
}>()

const emit = defineEmits<{
  skipJudging: []
}>()
</script>

<template>
  <div class="space-y-6">
    <RoundSkippedNotice v-if="roundSkipped" />
    <BlackCardAtom :text="blackCard.text" />
    <p class="text-gray-400 text-lg">
      Karetní král vybírá vítěze...
      <span v-if="secondsLeft > 0" class="ml-2 text-sm text-gray-500">({{ secondsLeft }}s)</span>
    </p>
    <SubmissionGrid :submissions="submissions" :selectable="false" />
    <button
      v-if="secondsLeft === 0"
      @click="emit('skipJudging')"
      class="w-full py-3 px-6 bg-red-700 hover:bg-red-600 text-white font-bold rounded-xl transition-colors"
    >
      Přeskočit hodnocení
    </button>
  </div>
</template>
