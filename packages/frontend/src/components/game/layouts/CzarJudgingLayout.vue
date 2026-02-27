<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { BlackCard, AnonymousSubmission } from '@kpl/shared'
import Countdown from '../atoms/Countdown.vue'
import BlackCardAtom from '../atoms/BlackCard.vue'
import SubmissionGrid from '../atoms/SubmissionGrid.vue'
import RoundSkippedNotice from '../atoms/RoundSkippedNotice.vue'
import CzarBadge from '../atoms/CzarBadge.vue'

defineProps<{
  blackCard: BlackCard
  secondsLeft: number
  totalSeconds: number
  submissions: AnonymousSubmission[]
  roundSkipped: boolean
  czarNickname: string
}>()

const emit = defineEmits<{
  pick: [submissionId: string]
}>()

const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col h-full min-h-0 pt-4">
    <div class="flex-none space-y-4 mb-6">
      <BlackCardAtom :text="blackCard.text" />
      <CzarBadge czarNickname="" :isMe="true" />
      <div class="flex items-center gap-3 px-1">
        <div class="h-[1px] flex-1 bg-yellow-500/20"></div>
        <p class="text-yellow-500 font-black uppercase text-[11px] tracking-widest italic">
          {{ t('game.czar.judging') }}
        </p>
        <div class="h-[1px] flex-1 bg-yellow-500/20"></div>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto pb-12 custom-scrollbar">
      <SubmissionGrid 
        :submissions="submissions" 
        :selectable="true" 
        @pick="emit('pick', $event)" 
      />
    </div>
  </div>
</template>