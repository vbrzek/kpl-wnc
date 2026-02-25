<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { socket } from './socket';
import GameLayout from './layouts/GameLayout.vue';

onMounted(() => socket.connect());
onUnmounted(() => socket.disconnect());
</script>

<template>
  <GameLayout>
      <RouterView />
  </GameLayout>
</template>
