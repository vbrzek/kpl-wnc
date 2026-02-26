<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
</script>

<template>
  <div class="bg-orange-900 border border-orange-500 text-orange-200 rounded-lg px-4 py-3 text-sm">
    {{ t('game.roundSkipped') }}
  </div>
</template>
