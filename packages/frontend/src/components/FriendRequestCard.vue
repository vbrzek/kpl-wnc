<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { FriendRequest } from '../stores/friendsStore';

defineProps<{ request: FriendRequest }>();
const emit = defineEmits<{
  (e: 'accept', id: number): void;
  (e: 'reject', id: number): void;
}>();

const { t } = useI18n();
</script>

<template>
  <div class="flex items-center gap-3 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4">
    <img
      :src="request.fromAvatarUrl ?? `https://api.dicebear.com/9.x/bottts/svg?seed=${request.fromNick}`"
      :alt="request.fromNick"
      class="w-10 h-10 rounded-full bg-gray-700 object-cover"
    />
    <span class="flex-1 text-sm font-semibold text-white truncate">{{ request.fromNick }}</span>
    <button
      @click="emit('accept', request.friendshipId)"
      class="text-xs font-bold text-green-400 hover:text-green-300 transition-colors px-2 py-1"
    >
      {{ t('friends.accept') }}
    </button>
    <button
      @click="emit('reject', request.friendshipId)"
      class="text-xs text-gray-500 hover:text-red-400 transition-colors px-2 py-1"
    >
      {{ t('friends.reject') }}
    </button>
  </div>
</template>
