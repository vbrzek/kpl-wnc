<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { BlackCard, WhiteCard, Player } from '@kpl/shared'
import Countdown from '../atoms/Countdown.vue'
import BlackCardAtom from '../atoms/BlackCard.vue'
import CardHand from '../atoms/CardHand.vue'
import RoundSkippedNotice from '../atoms/RoundSkippedNotice.vue'
import CzarBadge from '../atoms/CzarBadge.vue'

const props = defineProps<{
  blackCard: BlackCard
  secondsLeft: number
  totalSeconds: number
  players: Player[]
  hand: WhiteCard[]
  selectedCards: WhiteCard[]
  canSubmit: boolean
  roundSkipped: boolean
  czarNickname: string
}>()

const emit = defineEmits<{
  toggleCard: [card: WhiteCard]
  submit: []
}>()

const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col h-full min-h-0 pt-4">
    <div class="flex-none space-y-4 mb-4">
      <RoundSkippedNotice v-if="roundSkipped" />
      <div v-if="secondsLeft > 0" class="px-1">
        <Countdown :secondsLeft="secondsLeft" :totalSeconds="totalSeconds" />
      </div>
      <BlackCardAtom :text="blackCard.text" :pick="blackCard.pick" />
      <CzarBadge :czarNickname="czarNickname" :isMe="false" />
    </div>

     <CardHand
      :cards="hand"
      :selectedCards="selectedCards"
      :pick="blackCard.pick"
      @toggle="emit('toggleCard', $event)"
    />

    <div class="fixed bottom-0 inset-x-0 p-4 bg-gradient-to-t from-gray-900 via-gray-900 to-transparent z-20">
      <div class="max-w-6xl mx-auto">
        <button
          @click="emit('submit')"
          :disabled="!canSubmit"
          class="w-full py-4 rounded-2xl font-black uppercase tracking-[0.2em] transition-all shadow-2xl flex items-center justify-center gap-3
                 disabled:bg-gray-800 disabled:text-gray-600
                 bg-yellow-500 text-black active:scale-[0.97] shadow-[0_6px_0_rgb(161,98,7)] active:shadow-none active:translate-y-1"
        >
          <span>{{ t('game.selection.submit') }}</span>
          <span v-if="selectedCards.length > 0" class="bg-black/20 px-2 py-0.5 rounded text-sm">
            {{ selectedCards.length }}/{{ blackCard.pick }}
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
