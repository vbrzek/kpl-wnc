<script setup lang="ts">
import { useProfileStore } from '../stores/profileStore';

withDefaults(defineProps<{ size?: number }>(), { size: 40 });
const emit = defineEmits<{ click: [] }>();
const profileStore = useProfileStore();
</script>

<template>
  <button
    @click="emit('click')"
    class="rounded-full overflow-hidden bg-gray-700 hover:ring-2 hover:ring-indigo-400 transition-all flex-shrink-0 cursor-pointer"
    :style="{ width: `${size}px`, height: `${size}px` }"
    :title="profileStore.nickname"
  >
    <img
      :src="profileStore.avatarUrl"
      :alt="profileStore.nickname"
      class="w-full h-full object-cover"
    />
  </button>
</template>
