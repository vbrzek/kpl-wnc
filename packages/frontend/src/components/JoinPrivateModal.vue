<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

const emit = defineEmits<{ close: []; join: [code: string] }>();
const code = ref('');
const errorMsg = ref('');
const { t } = useI18n();

function submit() {
  const trimmed = code.value.trim().toLowerCase();
  if (!/^[a-f0-9]{6}$/.test(trimmed)) {
    errorMsg.value = t('joinPrivate.codeError');
    return;
  }
  errorMsg.value = '';
  emit('join', trimmed);
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      @click.self="$emit('close')"
    >
      <div class="bg-[#0d1117] border border-white/10 rounded-2xl w-full max-w-sm">
        <div class="p-6 space-y-5">

          <!-- Header -->
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-black tracking-tighter uppercase italic text-white">
              {{ t('joinPrivate.title') }}
            </h2>
            <button @click="$emit('close')" class="text-slate-500 hover:text-white transition-colors p-1">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Code input -->
          <div>
            <label class="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
              {{ t('joinPrivate.codeLabel') }}
            </label>
            <input
              v-model="code"
              maxlength="6"
              class="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 font-mono tracking-widest text-center text-lg focus:outline-none focus:border-white/30 transition-colors"
              placeholder="a3f9c1"
              @keyup.enter="submit"
              autofocus
            />
            <p v-if="errorMsg" class="text-red-400 text-xs mt-2 font-bold uppercase tracking-wider">
              {{ errorMsg }}
            </p>
          </div>

          <!-- Actions -->
          <div class="flex gap-3">
            <button
              @click="$emit('close')"
              class="flex-1 py-3.5 bg-slate-800 border border-white/10 text-slate-300 text-sm font-black uppercase tracking-widest rounded-2xl active:scale-95 transition-all"
            >
              {{ t('common.cancel') }}
            </button>
            <button
              @click="submit"
              class="flex-1 py-3.5 bg-white text-black text-sm font-black uppercase tracking-widest rounded-2xl shadow-[0_4px_0_rgb(60,60,60)] active:shadow-none active:translate-y-1 transition-all"
            >
              {{ t('common.join') }}
            </button>
          </div>

        </div>
      </div>
    </div>
  </Teleport>
</template>
