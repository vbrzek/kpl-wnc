<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { locale } = useI18n();

const languages = [
  { code: 'cs', label: 'CS' },
  { code: 'en', label: 'EN' },
  { code: 'ru', label: 'RU' },
  { code: 'uk', label: 'UK' },
  { code: 'es', label: 'ES' },
];

function setLocale(code: string) {
  locale.value = code;
  localStorage.setItem('locale', code);
}
</script>

<template>
  <div class="flex gap-1">
    <button
      v-for="lang in languages"
      :key="lang.code"
      @click="setLocale(lang.code)"
      :class="[
        'px-2 py-1 text-xs rounded font-mono transition-colors',
        locale === lang.code
          ? 'bg-white text-gray-900 font-bold'
          : 'text-gray-400 hover:text-white',
      ]"
    >
      {{ lang.label }}
    </button>
  </div>
</template>
