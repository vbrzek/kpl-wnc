<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { socket } from './socket';

onMounted(() => socket.connect());
onUnmounted(() => socket.disconnect());
</script>

<template>
  <RouterView />
</template>
