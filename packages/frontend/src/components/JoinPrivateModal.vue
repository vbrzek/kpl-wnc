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
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 text-white">
    <div class="bg-gray-800 p-6 rounded-xl w-full max-w-sm space-y-4">
      <h2 class="text-xl font-bold">{{ t('joinPrivate.title') }}</h2>
      <label class="block">
        <span class="text-sm text-gray-300">{{ t('joinPrivate.codeLabel') }}</span>
        <input
          v-model="code"
          maxlength="6"
          class="mt-1 w-full bg-gray-700 px-3 py-2 rounded font-mono tracking-widest text-center text-lg"
          placeholder="a3f9c1"
          @keyup.enter="submit"
          autofocus
        />
      </label>
      <p v-if="errorMsg" class="text-red-400 text-sm">{{ errorMsg }}</p>
      <div class="flex gap-3">
        <button
          @click="submit"
          class="bg-blue-600 hover:bg-blue-500 px-5 py-2 rounded flex-1 font-semibold"
        >
          {{ t('common.join') }}
        </button>
        <button @click="$emit('close')" class="text-gray-400 hover:text-white px-4 py-2">
          {{ t('common.cancel') }}
        </button>
      </div>
    </div>
  </div>
  </Teleport>
</template>
