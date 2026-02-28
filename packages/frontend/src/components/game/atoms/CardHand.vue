<script setup lang="ts">
import type { WhiteCard } from '@kpl/shared'
import { useSound } from '../../../composables/useSound'

const props = defineProps<{
  cards: WhiteCard[]
  selectedCards: WhiteCard[]
  pick: number
}>()

const emit = defineEmits<{
  toggle: [card: WhiteCard]
}>()

const { play } = useSound()

function onToggle(card: WhiteCard) {
  play('card-pick')
  emit('toggle', card)
}
</script>

<template>
  <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
    <button
      v-for="card in cards"
      :key="card.id"
      @click="onToggle(card)"
      :class="[
        'relative min-h-[110px] p-4 rounded-2xl text-left transition-all duration-200 flex flex-col justify-between shadow-sm border-2',
        selectedCards.some(c => c.id === card.id)
          ? 'bg-yellow-50 border-transparent border-gray-100 -translate-y-2 shadow-lg'
          : 'bg-white border-transparent hover:border-gray-100'
      ]"
    >
      <span :class="[
        'text-[14px] leading-snug tracking-tight transition-colors',
        selectedCards.some(c => c.id === card.id) ? 'text-yellow-900 font-bold' : 'text-gray-800 font-medium'
      ]">
        {{ card.text }}
      </span>

      <div class="flex justify-between items-end mt-2">
        <span class="text-[8px] font-black opacity-10">KPL</span>
        
        <div 
          v-if="selectedCards.some(c => c.id === card.id)"
          class="w-5 h-5 rounded-full bg-yellow-400/30 text-yellow-800 flex items-center justify-center text-[10px] font-black"
        >
          {{ pick > 1 ? selectedCards.findIndex(c => c.id === card.id) + 1 : '✓' }}
        </div>
      </div>
    </button>
  </div>
</template>