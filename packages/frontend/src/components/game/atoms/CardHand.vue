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
      :key="card.isBlank ? 'blank' : card.id"
      @click="onToggle(card)"
      :class="[
        'relative min-h-[110px] p-4 rounded-2xl text-left transition-all duration-200 flex flex-col justify-between shadow-sm border-2',
        card.isBlank
          ? selectedCards.some(c => c.isBlank)
            ? 'bg-gradient-to-br from-purple-900/60 to-yellow-900/40 border-yellow-400/60 -translate-y-2 shadow-lg shadow-yellow-400/20'
            : 'bg-gradient-to-br from-purple-900/30 to-yellow-900/10 border-yellow-400/20 hover:border-yellow-400/50'
          : selectedCards.some(c => c.id === card.id)
            ? 'bg-yellow-50 border-transparent border-gray-100 -translate-y-2 shadow-lg'
            : 'bg-white border-transparent hover:border-gray-100'
      ]"
    >
      <!-- Normal card content -->
      <template v-if="!card.isBlank">
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
      </template>

      <!-- Blank card (Carte Blanche) -->
      <template v-else>
        <div class="flex flex-col items-center justify-center flex-1 gap-1.5">
          <span class="text-2xl">✏️</span>
          <span class="text-xs font-black text-yellow-400 uppercase tracking-widest">Carte Blanche</span>
          <span class="text-[10px] text-yellow-400/50 text-center leading-tight">Napiš co chceš</span>
        </div>
        <div class="flex justify-between items-end mt-2">
          <span class="text-[8px] font-black text-yellow-400/20">KPL</span>
          <div
            v-if="selectedCards.some(c => c.isBlank)"
            class="w-5 h-5 rounded-full bg-yellow-400/30 text-yellow-400 flex items-center justify-center text-[10px] font-black"
          >
            {{ pick > 1 ? selectedCards.findIndex(c => c.isBlank) + 1 : '✓' }}
          </div>
        </div>
      </template>
    </button>
  </div>
</template>