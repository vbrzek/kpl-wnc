<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  czarNickname: string;
  isMe: boolean;
}>();

const { t } = useI18n();
</script>

<template>
  <div class="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-3 py-2 text-xs font-bold">
    <span>👑</span>
    <span class="text-yellow-400">
      {{ isMe ? t('game.czar.youAreCzar') : t('game.czar.willPick', { name: czarNickname }) }}
    </span>
  </div>
</template>
