<script setup lang="ts">
import { ref } from 'vue';
import PlayerAvatar from '../components/PlayerAvatar.vue';
import PlayerProfileModal from '../components/PlayerProfileModal.vue';

const showEditProfile = ref(false);
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white">
    <div class="flex justify-end px-6 pt-4">
      <PlayerAvatar :size="40" @click="showEditProfile = true" />
    </div>
    <div class="max-w-6xl mx-auto px-6 py-6">
      <slot></slot>
    </div>

    <PlayerProfileModal
      v-if="showEditProfile"
      :is-edit="true"
      @close="showEditProfile = false"
    />
  </div>
</template>
