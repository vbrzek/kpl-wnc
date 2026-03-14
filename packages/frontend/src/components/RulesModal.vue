<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

const emit = defineEmits<{ close: [] }>();
const { t, tm } = useI18n();

type Tab = 'basic' | 'modes' | 'homerules';
const activeTab = ref<Tab>('basic');
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      @click.self="emit('close')"
    >
      <div class="bg-[#0d1117] border border-white/10 rounded-2xl w-full max-w-lg flex flex-col max-h-[90dvh]">

        <!-- Header -->
        <div class="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
          <h2 class="text-xl font-black tracking-tighter uppercase italic text-white">
            {{ t('rules.title') }}
          </h2>
          <button @click="emit('close')" class="text-slate-500 hover:text-white transition-colors p-1">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Tabs -->
        <div class="flex gap-1 px-6 pb-4 shrink-0">
          <button
            v-for="tab in (['basic', 'modes', 'homerules'] as Tab[])"
            :key="tab"
            @click="activeTab = tab"
            class="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors"
            :class="activeTab === tab
              ? 'bg-white/10 text-white'
              : 'text-slate-500 hover:text-white hover:bg-white/5'"
          >
            {{ t(`rules.tabs.${tab}`) }}
          </button>
        </div>

        <!-- Content -->
        <div class="overflow-y-auto px-6 pb-6 space-y-6">

          <!-- Basic rules -->
          <template v-if="activeTab === 'basic'">
            <div v-for="section in (tm('rules.basic') as any[])" :key="section.title" class="space-y-2">
              <h3 class="text-xs font-black uppercase tracking-[0.15em] text-yellow-500">{{ section.title }}</h3>
              <ul class="space-y-1.5">
                <li
                  v-for="(item, i) in section.items"
                  :key="i"
                  class="flex gap-2.5 text-sm text-slate-300 leading-relaxed"
                >
                  <span class="text-slate-600 shrink-0 mt-0.5">–</span>
                  <span>{{ item }}</span>
                </li>
              </ul>
            </div>
          </template>

          <!-- Game modes -->
          <template v-if="activeTab === 'modes'">
            <p class="text-xs text-slate-500 uppercase tracking-widest font-bold">{{ t('rules.modesIntro') }}</p>
            <div v-for="mode in (tm('rules.modes') as any[])" :key="mode.name" class="bg-white/5 rounded-xl p-4 space-y-1">
              <div class="flex items-center gap-2">
                <span class="text-base">{{ mode.icon }}</span>
                <h3 class="font-black text-white text-sm tracking-tight">{{ mode.name }}</h3>
              </div>
              <p class="text-sm text-slate-400 leading-relaxed">{{ mode.desc }}</p>
              <p v-if="mode.note" class="text-xs text-yellow-500/80 mt-1">{{ mode.note }}</p>
            </div>
          </template>

          <!-- House rules -->
          <template v-if="activeTab === 'homerules'">
            <p class="text-xs text-slate-500 uppercase tracking-widest font-bold">{{ t('rules.homerulesIntro') }}</p>
            <div v-for="rule in (tm('rules.homerules') as any[])" :key="rule.name" class="bg-white/5 rounded-xl p-4 space-y-1">
              <div class="flex items-center gap-2">
                <span class="text-base">{{ rule.icon }}</span>
                <h3 class="font-black text-white text-sm tracking-tight">{{ rule.name }}</h3>
              </div>
              <p class="text-sm text-slate-400 leading-relaxed">{{ rule.desc }}</p>
              <p v-if="rule.note" class="text-xs text-yellow-500/80 mt-1">⚠ {{ rule.note }}</p>
            </div>
          </template>

        </div>
      </div>
    </div>
  </Teleport>
</template>
