<script setup lang="ts">
import LanguageSwitcher from '../components/LanguageSwitcher.vue';
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white">
    <div class="flex justify-end px-6 pt-4">
      <LanguageSwitcher />
    </div>
    <div class="max-w-6xl mx-auto px-6 py-6">
      <slot></slot>
    </div>
  </div>
</template>
