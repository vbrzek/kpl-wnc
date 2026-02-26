<script setup lang="ts">
import type { AnonymousSubmission } from '@kpl/shared'

defineProps<{
  submissions: AnonymousSubmission[]
  selectable: boolean
}>()

const emit = defineEmits<{
  pick: [submissionId: string]
}>()
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
    <button
      v-for="submission in submissions"
      :key="submission.submissionId"
      @click="selectable && emit('pick', submission.submissionId)"
      :disabled="!selectable"
      class="bg-white text-black rounded-xl p-5 text-left space-y-2 border-4 border-transparent transition-all"
      :class="selectable ? 'hover:border-yellow-400 cursor-pointer' : 'cursor-default'"
    >
      <p v-for="card in submission.cards" :key="card.id" class="font-medium">
        {{ card.text }}
      </p>
    </button>
  </div>
</template>
