<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { CzarMode } from '@kpl/shared';

const props = defineProps<{
  czarNickname: string;
  isMe: boolean;
  czarMode?: CzarMode;
}>();

const { t } = useI18n();
</script>

<template>
  <div class="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-3 py-2 text-xs font-bold">
    <span>{{ czarMode === 'czar_is_dead' ? '🗳️' : '👑' }}</span>
    <span class="text-yellow-400">
      <template v-if="czarMode === 'czar_is_dead'">{{ t('game.czar.votingDecides') }}</template>
      <template v-else-if="isMe">{{ t('game.czar.youAreCzar') }}</template>
      <template v-else>{{ t('game.czar.willPick', { name: czarNickname }) }}</template>
    </span>
  </div>
</template>
