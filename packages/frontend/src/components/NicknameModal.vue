<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

const emit = defineEmits<{ join: [nickname: string] }>();
const nickname = ref('');
const { t } = useI18n();

function submit() {
  if (!nickname.value.trim()) return;
  emit('join', nickname.value.trim());
}
</script>

<template>
  <Teleport to="body">
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 text-white">
    <div class="bg-gray-800 p-6 rounded-xl w-full max-w-sm space-y-4">
      <h2 class="text-xl font-bold">{{ t('nickname.title') }}</h2>
      <input
        v-model="nickname"
        autofocus
        class="w-full bg-gray-700 px-3 py-2 rounded"
        :placeholder="t('nickname.placeholder')"
        @keyup.enter="submit"
      />
      <button
        @click="submit"
        class="w-full bg-indigo-600 hover:bg-indigo-500 py-2 rounded font-semibold"
      >
        {{ t('nickname.join') }}
      </button>
    </div>
  </div>
  </Teleport>
</template>
