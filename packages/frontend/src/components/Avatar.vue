<script setup lang="ts">
import { computed, ref } from 'vue';
import { buildDiceBearUrl } from '../stores/profileStore';

const props = withDefaults(defineProps<{
  nickname: string;
  avatarUrl?: string | null;
  size?: number;
}>(), { size: 40 });

const failed = ref(false);

const src = computed(() => {
  if (!failed.value && props.avatarUrl) return props.avatarUrl;
  return buildDiceBearUrl('bottts', props.nickname);
});
</script>

<template>
  <div
    class="rounded-full overflow-hidden bg-gray-700 flex-shrink-0"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <img
      :src="src"
      :alt="nickname"
      class="w-full h-full object-cover"
      @error="failed = true"
    />
  </div>
</template>
