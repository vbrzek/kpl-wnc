<script setup lang="ts">
defineProps<{
  text: string
  pick?: number
}>()
</script>

<template>
  <div class="bg-black text-white rounded-xl p-6 max-w-sm text-xl font-bold leading-relaxed shadow-lg">
    {{ text }}
    <div v-if="pick" class="text-sm font-normal mt-2 text-gray-400">
      Vyber {{ pick }} {{ pick === 1 ? 'kartu' : 'karty' }}
    </div>
  </div>
</template>
