<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
</script>

<template>
  <div class="relative overflow-hidden bg-orange-600/10 border-2 border-orange-500 rounded-2xl p-4 mb-6 group transition-all">
    <div class="absolute inset-0 opacity-5 pointer-events-none select-none overflow-hidden">
      <div class="absolute inset-0" style="background-image: linear-gradient(45deg, #f97316 25%, transparent 25%, transparent 50%, #f97316 50%, #f97316 75%, transparent 75%, transparent); background-size: 40px 40px;"></div>
    </div>

    <div class="flex items-center gap-4 relative z-10">
      <div class="flex-shrink-0 w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(249,115,22,0.4)]">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>

      <div class="flex flex-col">
        <span class="text-[10px] font-black uppercase tracking-[0.2em] text-orange-500/60 leading-none mb-1">
          {{ t('game.status.attention') || 'Upozornění' }}
        </span>
        <p class="text-orange-200 font-black uppercase italic tracking-tight leading-tight">
          {{ t('game.roundSkipped') }}
        </p>
      </div>
    </div>
  </div>
</template>