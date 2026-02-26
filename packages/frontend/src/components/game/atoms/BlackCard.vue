<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  text: string
  pick: number
}>()

const { t } = useI18n();
</script>

<template>
  <div class="relative bg-black text-white rounded-3xl p-6 shadow-2xl border border-white/10 overflow-hidden group">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <span class="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-pulse"></span>
        <span :class="['text-xs font-bold tracking-wide', pick > 1 ? 'text-yellow-500' : 'text-gray-400']">
          {{ t('game.blackCard.pick', pick, { n: pick }) }}
        </span>
      </div>
    </div>

    <div class="text-xl md:text-2xl font-black leading-tight tracking-tight pr-4">
      {{ text }}
    </div>

    <div class="mt-6 h-1 w-12 bg-white/10 rounded-full"></div>
  </div>
</template>