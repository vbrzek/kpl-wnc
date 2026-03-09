<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { socket } from './socket';
import GameLayout from './layouts/GameLayout.vue';
import { useProfileStore } from './stores/profileStore';
import PlayerProfileModal from './components/PlayerProfileModal.vue';

const profileStore = useProfileStore();
const route = useRoute();
const router = useRouter();
const showProfileModal = ref(false);
const oauthSetup = ref(false);

onMounted(async () => {
  socket.connect();
  await profileStore.init();

  // Handle OAuth redirect
  const authParam = route.query.auth as string | undefined;
  if (authParam) {
    router.replace({ query: {} }); // clean URL
    if (authParam === 'new') {
      oauthSetup.value = true;
      showProfileModal.value = true;
      return;
    }
    // 'success' or 'error' — profile already loaded by init()
  }

  if (!profileStore.hasProfile) showProfileModal.value = true;
});

onUnmounted(() => socket.disconnect());
</script>

<template>
  <GameLayout>
    <RouterView v-if="profileStore.hasProfile" />
  </GameLayout>

  <PlayerProfileModal
    v-if="showProfileModal"
    :is-edit="false"
    :is-oauth-setup="oauthSetup"
    @close="showProfileModal = false; oauthSetup = false"
  />
</template>
