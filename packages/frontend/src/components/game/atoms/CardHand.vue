<script setup lang="ts">
import type { WhiteCard } from '@kpl/shared'

defineProps<{
  cards: WhiteCard[]
  selectedCards: WhiteCard[]
  pick: number
}>()

const emit = defineEmits<{
  toggle: [card: WhiteCard]
}>()
</script>

<template>
  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
    <button
      v-for="card in cards"
      :key="card.id"
      @click="emit('toggle', card)"
      :class="[
        'bg-white text-black rounded-lg p-4 text-sm font-medium text-left transition-all border-4',
        selectedCards.some(c => c.id === card.id)
          ? 'border-yellow-400 ring-2 ring-yellow-400'
          : 'border-transparent hover:border-gray-300',
      ]"
    >
      {{ card.text }}
    </button>
  </div>
</template>
