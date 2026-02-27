<script setup lang="ts">
import { ref } from 'vue';

defineProps<{ roomCode: string }>();
const copied = ref(false);

function copy(code: string) {
  const url = `${window.location.origin}/room/${code}`;
  navigator.clipboard.writeText(url).then(() => {
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  });
}
</script>

<template>
  <button
    @click="copy(roomCode)"
    :class="[
      'group flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border transition-all active:scale-95',
      copied
        ? 'bg-green-500/10 border-green-500/30'
        : 'bg-white/5 border-white/10 hover:bg-white/8 hover:border-white/20'
    ]"
  >
    <code :class="[
      'font-mono text-base font-black tracking-[0.2em] transition-colors',
      copied ? 'text-green-400' : 'text-white'
    ]">
      {{ roomCode }}
    </code>
    <span :class="[
      'w-px h-4 transition-colors',
      copied ? 'bg-green-500/30' : 'bg-white/15'
    ]"></span>
    <svg :class="['w-3.5 h-3.5 transition-colors shrink-0', copied ? 'text-green-400' : 'text-slate-400 group-hover:text-slate-300']" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path v-if="!copied" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
      <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
    </svg>
  </button>
</template>