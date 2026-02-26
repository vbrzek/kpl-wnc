<script setup lang="ts">
import { ref } from 'vue';
import AppHeader from '../components/AppHeader.vue';
import PlayerProfileModal from '../components/PlayerProfileModal.vue';

const showEditProfile = ref(false);
</script>

<template>
  <div class="h-[100dvh] flex flex-col bg-gray-900 text-white font-sans overflow-hidden">

    <AppHeader @edit-profile="showEditProfile = true" />

    <main class="pt-16 min-h-screen flex flex-col">
      <div class="max-w-6xl mx-auto w-full px-4 md:px-6 py-6 flex-1">
        <slot></slot>
      </div>
    </main>

    <PlayerProfileModal
      v-if="showEditProfile"
      :is-edit="true"
      @close="showEditProfile = false"
    />

  </div>
</template>