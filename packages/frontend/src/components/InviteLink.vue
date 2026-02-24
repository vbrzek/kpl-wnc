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
  <div class="flex items-center gap-2">
    <code class="bg-gray-700 px-3 py-1 rounded font-mono text-sm tracking-widest">
      {{ roomCode }}
    </code>
    <button
      @click="copy(roomCode)"
      class="text-sm text-indigo-400 hover:text-indigo-300"
    >
      {{ copied ? 'Zkopírováno!' : 'Kopírovat odkaz' }}
    </button>
  </div>
</template>
