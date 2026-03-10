<script setup lang="ts">
import { computed } from 'vue';
import { buildDiceBearUrl } from '../stores/profileStore';

const props = withDefaults(defineProps<{
  nickname: string;
  avatarUrl?: string | null;
  size?: number;
}>(), { size: 40 });

const avatarUrl = computed(() =>
  props.avatarUrl || buildDiceBearUrl('bottts', props.nickname)
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
