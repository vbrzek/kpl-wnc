<script setup lang="ts">
import type { CzarMode } from '@kpl/shared';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  modelValue: CzarMode;
  readonly?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [mode: CzarMode] }>();

const { t } = useI18n();

interface ModeInfo {
  id: CzarMode;
  icon: string;
}

const MODES: ModeInfo[] = [
  { id: 'classic', icon: '🔄' },
  { id: 'meritocracy', icon: '🏆' },
  { id: 'god_mode', icon: '👑' },
  { id: 'czar_is_dead', icon: '🗳️' },
];
</script>

<template>
  <div class="space-y-2">
    <p class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-3">
      {{ t('specialRules.czarMode.label') }}
    </p>
    <button
      v-for="mode in MODES"
      :key="mode.id"
      type="button"
      :disabled="readonly"
      @click="!readonly && emit('update:modelValue', mode.id)"
      :class="[
        'w-full text-left px-4 py-3 rounded-xl border transition-all',
        modelValue === mode.id
          ? 'bg-yellow-400/10 border-yellow-400/40 text-white'
          : 'bg-slate-900/40 border-white/5 text-slate-400',
        !readonly && 'hover:border-white/20 cursor-pointer',
        readonly && 'cursor-default',
      ]"
    >
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-lg shrink-0">{{ mode.icon }}</span>
          <div class="min-w-0">
            <div class="text-sm font-bold truncate">
              {{ t(`specialRules.czarMode.${mode.id}.name`) }}
            </div>
            <div class="text-xs text-slate-500 mt-0.5 leading-snug">
              {{ t(`specialRules.czarMode.${mode.id}.desc`) }}
            </div>
          </div>
        </div>
        <div
          v-if="!readonly"
          :class="[
            'shrink-0 w-4 h-4 rounded-full border-2 transition-all',
            modelValue === mode.id
              ? 'bg-yellow-400 border-yellow-400'
              : 'border-slate-600',
          ]"
        />
        <span v-else-if="modelValue === mode.id" class="shrink-0 text-xs font-bold text-yellow-400 uppercase tracking-widest">
          {{ t('specialRules.active') }}
        </span>
      </div>
    </button>
  </div>
</template>
