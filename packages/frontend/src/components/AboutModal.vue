<script setup lang="ts">
const emit = defineEmits<{ close: [] }>()

const version = __APP_VERSION__
const buildDate = new Intl.DateTimeFormat('cs-CZ', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}).format(new Date(__BUILD_DATE__))
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      @click.self="emit('close')"
    >
      <div class="bg-[#0d1117] border border-white/10 rounded-2xl w-full max-w-sm">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 pt-6 pb-4">
          <h2 class="text-xl font-black tracking-tighter uppercase italic text-white">
            O aplikaci
          </h2>
          <button @click="emit('close')" class="text-slate-500 hover:text-white transition-colors p-1">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Content -->
        <div class="px-6 pb-6 space-y-4">
          <div>
            <p class="text-2xl font-black tracking-tighter text-white uppercase italic">Karty Proti Lidskosti</p>
          </div>
          <div class="text-sm text-gray-400 space-y-1">
            <p>Verze <span class="text-white font-bold">{{ version }}</span></p>
            <p>Sestaveno <span class="text-white font-bold">{{ buildDate }}</span></p>
          </div>
          <div class="border-t border-white/10 pt-4">
            <p class="text-xs text-gray-500 leading-relaxed">
              Inspirováno hrou <span class="text-gray-300">Cards Against Humanity</span>,
              která je dostupná pod licencí Creative Commons BY-NC-SA 2.0.
            </p>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
