<script setup lang="ts">
import type { SpecialRule } from '@kpl/shared';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  modelValue: SpecialRule[];
  readonly?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [rules: SpecialRule[]] }>();

const { t } = useI18n();

interface RuleInfo {
  id: SpecialRule;
  icon: string;
}

const RULES: RuleInfo[] = [
  { id: 'rando_cardrissian', icon: '🎲' },
  { id: 'god_mode', icon: '👑' },
  { id: 'wheatons_law', icon: '🃏' },
  { id: 'rebooting_universe', icon: '♻️' },
  { id: 'meritocracy', icon: '🏆' },
  { id: 'high_stakes', icon: '💰' },
];

// Mutually exclusive pairs: activating one deactivates the other(s)
const CONFLICTS: Partial<Record<SpecialRule, SpecialRule[]>> = {
  god_mode: ['meritocracy'],
  meritocracy: ['god_mode'],
};

function toggle(id: SpecialRule) {
  if (props.readonly) return;
  const current = new Set(props.modelValue);
  if (current.has(id)) {
    current.delete(id);
  } else {
    current.add(id);
    for (const conflict of CONFLICTS[id] ?? []) current.delete(conflict);
  }
  emit('update:modelValue', Array.from(current));
}

function isActive(id: SpecialRule) {
  return props.modelValue.includes(id);
}
</script>

<template>
  <div class="space-y-2">
    <button
      v-for="rule in RULES"
      :key="rule.id"
      type="button"
      :disabled="readonly"
      @click="toggle(rule.id)"
      :class="[
        'w-full text-left px-4 py-3 rounded-xl border transition-all',
        isActive(rule.id)
          ? 'bg-yellow-400/10 border-yellow-400/40 text-white'
          : 'bg-slate-900/40 border-white/5 text-slate-400',
        !readonly && 'hover:border-white/20 cursor-pointer',
        readonly && 'cursor-default',
      ]"
    >
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-lg shrink-0">{{ rule.icon }}</span>
          <div class="min-w-0">
            <div class="text-sm font-bold truncate">{{ t(`specialRules.${rule.id}.name`) }}</div>
            <div class="text-xs text-slate-500 mt-0.5 leading-snug">{{ t(`specialRules.${rule.id}.desc`) }}</div>
          </div>
        </div>
        <div
          v-if="!readonly"
          :class="[
            'shrink-0 w-10 h-6 rounded-full transition-colors flex items-center',
            isActive(rule.id) ? 'bg-yellow-400' : 'bg-slate-700',
          ]"
        >
          <div :class="[
            'w-4 h-4 rounded-full bg-white shadow transition-transform mx-1',
            isActive(rule.id) ? 'translate-x-4' : 'translate-x-0',
          ]" />
        </div>
        <span v-else-if="isActive(rule.id)" class="shrink-0 text-xs font-bold text-yellow-400 uppercase tracking-widest">
          {{ t('specialRules.active') }}
        </span>
      </div>
    </button>
  </div>
</template>
