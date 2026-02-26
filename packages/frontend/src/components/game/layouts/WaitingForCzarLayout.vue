<script setup lang="ts">
import { useI18n } from 'vue-i18n';
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

const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col h-full min-h-0 pt-4">
    <div class="flex-none space-y-4 mb-6">
      <BlackCardAtom :text="blackCard.text" />
      
      <div class="flex items-center justify-between bg-white/5 rounded-2xl px-4 py-3 border border-white/5">
        <div class="flex items-center gap-3">
          <div class="relative">
            <div class="w-3 h-3 bg-yellow-500 rounded-full animate-ping absolute inset-0"></div>
            <div class="w-3 h-3 bg-yellow-500 rounded-full relative"></div>
          </div>
          <span class="text-sm font-bold text-yellow-500">
            {{ t('game.waiting.czarPicking') }}
          </span>
        </div>
        <span v-if="secondsLeft > 0" class="font-mono text-xs text-gray-500 bg-black/30 px-2 py-1 rounded-lg">
          {{ secondsLeft }}s
        </span>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto pb-24 custom-scrollbar px-1">
      <div class="mb-4">
        <p class="text-[10px] font-black uppercase tracking-widest text-gray-600 mb-2 px-1">
          {{ t('game.waiting.candidate') }}
        </p>
        <SubmissionGrid 
          :submissions="submissions" 
          :selectable="false" 
          class="opacity-90"
        />
      </div>
    </div>

    <div v-if="secondsLeft === 0" class="fixed bottom-0 inset-x-0 p-4 bg-gradient-to-t from-gray-900 via-gray-900 to-transparent">
      <button
        @click="emit('skipJudging')"
        class="w-full py-3 bg-red-900/40 hover:bg-red-900/60 text-red-200 text-xs font-black uppercase tracking-widest rounded-xl border border-red-500/30 transition-all"
      >
        {{ t('game.waiting.skipJudging') }}
      </button>
    </div>
  </div>
</template>
