<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  nickname: string;
  size?: number;
}>(), { size: 40 });

const avatarUrl = computed(() =>
  `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(props.nickname || 'default')}`
);
</script>

<template>
  <div
    class="rounded-full overflow-hidden bg-gray-700 flex-shrink-0"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <img
      :src="avatarUrl"
      :alt="nickname"
      class="w-full h-full object-cover"
    />
  </div>
</template>
