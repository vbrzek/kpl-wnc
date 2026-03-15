<script setup lang="ts">
import { useToast } from '../composables/useToast';
const { toasts, dismiss } = useToast();
</script>

<template>
  <div class="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="pointer-events-auto flex items-start gap-3 bg-gray-800 border border-white/10 rounded-2xl px-4 py-3 shadow-2xl"
    >
      <p class="flex-1 text-sm text-white leading-snug">{{ toast.message }}</p>
      <div class="flex items-center gap-2 shrink-0">
        <button
          v-if="toast.action"
          @click="toast.action!.fn(); dismiss(toast.id)"
          class="text-xs font-bold text-yellow-400 hover:text-yellow-300 transition-colors"
        >
          {{ toast.action.label }}
        </button>
        <button @click="dismiss(toast.id)" class="text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none">&times;</button>
      </div>
    </div>
  </div>
</template>
