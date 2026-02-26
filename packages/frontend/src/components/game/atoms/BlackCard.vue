<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineProps<{
  text: string
  pick?: number
}>()

const { t } = useI18n();
</script>

<template>
  <div class="bg-black text-white rounded-xl p-6 max-w-sm text-xl font-bold leading-relaxed shadow-lg">
    {{ text }}
    <div v-if="pick" class="text-sm font-normal mt-2 text-gray-400">
      {{ t('game.blackCard.pick', pick, { n: pick }) }}
    </div>
  </div>
</template>
