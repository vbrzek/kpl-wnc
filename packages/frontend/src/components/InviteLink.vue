<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

defineProps<{ roomCode: string }>();
const copied = ref(false);
const { t } = useI18n();

function copy(code: string) {
  const url = `${window.location.origin}/room/${code}`;
  navigator.clipboard.writeText(url).then(() => {
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  });
}
</script>

<template>
  <div class="flex flex-col items-start gap-2 min-w-0">
    <div class="flex items-center gap-2 bg-gray-800/50 border border-white/5 p-1 rounded-lg">
      <code class="px-3 py-1 font-mono text-base font-black tracking-widest text-white">
        {{ roomCode }}
      </code>
    </div>

    <button
      @click="copy(roomCode)"
      :class="[
        'flex items-center gap-2 px-1 py-1 text-[10px] font-black uppercase tracking-wider transition-all',
        copied ? 'text-green-400' : 'text-indigo-400 hover:text-indigo-300 active:scale-95'
      ]"
    >
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path v-if="!copied" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
      </svg>
      
      <span class="truncate">
        {{ copied ? t('common.copied') : t('common.copyLink') }}
      </span>
    </button>
  </div>
</template>