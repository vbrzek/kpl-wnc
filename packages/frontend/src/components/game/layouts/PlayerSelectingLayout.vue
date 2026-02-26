<script setup lang="ts">
import type { BlackCard, WhiteCard, Player } from '@kpl/shared'
import Countdown from '../atoms/Countdown.vue'
import BlackCardAtom from '../atoms/BlackCard.vue'
import CardHand from '../atoms/CardHand.vue'
import RoundSkippedNotice from '../atoms/RoundSkippedNotice.vue'

const props = defineProps<{
  blackCard: BlackCard
  secondsLeft: number
  totalSeconds: number
  players: Player[]
  hand: WhiteCard[]
  selectedCards: WhiteCard[]
  canSubmit: boolean
  roundSkipped: boolean
}>()

const emit = defineEmits<{
  toggleCard: [card: WhiteCard]
  submit: []
}>()
</script>

<template>
  <div class="space-y-6">
    <RoundSkippedNotice v-if="roundSkipped" />
    <Countdown v-if="secondsLeft > 0" :secondsLeft="secondsLeft" :totalSeconds="totalSeconds" />
    <BlackCardAtom :text="blackCard.text" :pick="blackCard.pick" />
    <CardHand
      :cards="hand"
      :selectedCards="selectedCards"
      :pick="blackCard.pick"
      @toggle="emit('toggleCard', $event)"
    />
    <button
      @click="emit('submit')"
      :disabled="!canSubmit"
      class="bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-8 py-3 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
    >
      Odeslat {{ selectedCards.length }}/{{ blackCard.pick }} karet
    </button>
  </div>
</template>
