<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
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
const authError = ref(false);
const isPublicPage = computed(() => !!route.meta.public);

onMounted(async () => {
  socket.connect();
  await profileStore.init();

  // Handle OAuth redirect
  const authParam = route.query.auth as string | undefined;
  if (authParam) {
    router.replace({ query: {} }); // clean URL
    if (authParam === 'error') {
      // #4 — OAuth failed, show profile modal with error
      authError.value = true;
      showProfileModal.value = true;
      return;
    }
    if (authParam === 'new' || (authParam === 'success' && profileStore.isAuthenticated && !profileStore.hasProfile)) {
      // New OAuth user, or returning OAuth user who never finished setting up nickname
      oauthSetup.value = true;
      showProfileModal.value = true;
      return;
    }
  }

  if (!profileStore.hasProfile && !isPublicPage.value) {
    // Authenticated user without nickname → skip to nickname setup (don't show OAuth buttons)
    if (profileStore.isAuthenticated) oauthSetup.value = true;
    showProfileModal.value = true;
  }
});

onUnmounted(() => socket.disconnect());
</script>

<template>
  <!-- Public pages (privacy, terms) — standalone, no GameLayout, no profile gate -->
  <RouterView v-if="isPublicPage" />

  <!-- Game app — requires profile -->
  <template v-else>
    <GameLayout>
      <RouterView v-if="profileStore.hasProfile" />
    </GameLayout>

    <PlayerProfileModal
      v-if="showProfileModal"
      :is-edit="false"
      :is-oauth-setup="oauthSetup"
      :auth-error="authError"
      @close="showProfileModal = false; oauthSetup = false; authError = false"
    />
  </template>
</template>
