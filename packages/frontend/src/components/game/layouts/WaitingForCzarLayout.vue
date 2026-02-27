<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { BlackCard, AnonymousSubmission } from '@kpl/shared'
import BlackCardAtom from '../atoms/BlackCard.vue'
import SubmissionGrid from '../atoms/SubmissionGrid.vue'
import RoundSkippedNotice from '../atoms/RoundSkippedNotice.vue'
import CzarBadge from '../atoms/CzarBadge.vue'

defineProps<{
  blackCard: BlackCard
  secondsLeft: number
  submissions: AnonymousSubmission[]
  roundSkipped: boolean
  czarNickname: string
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
      
      <CzarBadge :czarNickname="czarNickname" :isMe="false" />
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
