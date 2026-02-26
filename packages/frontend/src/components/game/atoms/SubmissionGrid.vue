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
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 px-1">
    <button
      v-for="submission in submissions"
      :key="submission.submissionId"
      @click="selectable && emit('pick', submission.submissionId)"
      :disabled="!selectable"
      :class="[
        'relative flex flex-col gap-2 p-4 rounded-2xl text-left transition-all duration-200 shadow-xl border-2',
        selectable 
          ? 'bg-white border-transparent hover:border-yellow-400 active:scale-[0.98] cursor-pointer' 
          : 'bg-white/90 border-transparent cursor-default'
      ]"
    >
      <div 
        v-for="(card, index) in submission.cards" 
        :key="card.id"
        :class="[
          'relative pr-6',
          index > 0 ? 'mt-2 pt-2 border-t border-gray-100' : ''
        ]"
      >
        <span v-if="submission.cards.length > 1" class="absolute right-0 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-300">
          {{ index + 1 }}
        </span>
        
        <p class="text-gray-900 font-bold leading-snug">
          {{ card.text }}
        </p>
      </div>

      <div class="flex justify-between items-end mt-4 pt-2">
        <span class="text-[8px] font-black opacity-10 uppercase tracking-widest">KPL Combo</span>
        <div v-if="selectable" class="w-6 h-6 rounded-full border-2 border-yellow-400/20 flex items-center justify-center">
          <div class="w-1.5 h-1.5 bg-yellow-400 rounded-full opacity-0 hover:opacity-100 transition-opacity"></div>
        </div>
      </div>
    </button>
  </div>
</template>
