<script setup lang="ts">
import { useProfileStore } from '../stores/profileStore';
import Avatar from './Avatar.vue';

withDefaults(defineProps<{ size?: number }>(), { size: 40 });
const emit = defineEmits<{ click: [] }>();
const profileStore = useProfileStore();
</script>

<template>
  <button
    @click="emit('click')"
    class="rounded-full hover:ring-2 hover:ring-indigo-400 transition-all flex-shrink-0 cursor-pointer"
    :title="profileStore.nickname"
  >
    <Avatar :nickname="profileStore.nickname" :size="size" />
  </button>
</template>
