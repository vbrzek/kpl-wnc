<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { socket } from './socket';
import GameLayout from './layouts/GameLayout.vue';
import { useProfileStore } from './stores/profileStore';
import PlayerProfileModal from './components/PlayerProfileModal.vue';

const profileStore = useProfileStore();
const showProfileModal = ref(false);

onMounted(() => {
  socket.connect();
  profileStore.init();
  if (!profileStore.hasProfile) showProfileModal.value = true;
});
onUnmounted(() => socket.disconnect());
</script>

<template>
  <GameLayout>
    <!-- RouterView se renderuje jen pokud profil existuje -->
    <RouterView v-if="profileStore.hasProfile" />
  </GameLayout>

  <PlayerProfileModal
    v-if="showProfileModal"
    @close="showProfileModal = false"
  />
</template>
