<script setup lang="ts">
const model = defineModel<boolean>({ required: true });
</script>

<template>
  <button
    type="button"
    @click="model = !model"
    :class="model ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-600'"
    class="relative w-10 h-6 rounded-full transition-colors"
  >
    <span
      :class="model ? 'translate-x-4' : ''"
      class="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
    />
  </button>
</template>
