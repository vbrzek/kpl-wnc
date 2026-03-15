<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoomStore } from '../stores/roomStore';
import { socket } from '../socket';
import type { FriendEntry } from '../stores/friendsStore';

const props = defineProps<{ friend: FriendEntry }>();
const emit = defineEmits<{ (e: 'remove', id: number): void }>();

const { t } = useI18n();
const roomStore = useRoomStore();

const canInvite = computed(() =>
  roomStore.room !== null && roomStore.room.status === 'LOBBY'
);

function invite() {
  if (!roomStore.room) return;
  socket.emit('friend:invite', {
    friendUserId: props.friend.userId,
    roomCode: roomStore.room.code,
  });
}
</script>

<template>
  <div class="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl p-4">
    <img
      :src="friend.avatarUrl ?? `https://api.dicebear.com/9.x/bottts/svg?seed=${friend.nickname}`"
      :alt="friend.nickname"
      class="w-10 h-10 rounded-full bg-gray-700 object-cover"
    />
    <span class="flex-1 text-sm font-semibold text-white truncate">{{ friend.nickname }}</span>
    <button
      v-if="canInvite"
      @click="invite"
      class="text-xs font-bold text-yellow-400 hover:text-yellow-300 transition-colors px-2 py-1"
    >
      {{ t('friends.invite') }}
    </button>
    <button
      @click="emit('remove', friend.friendshipId)"
      class="text-xs text-gray-500 hover:text-red-400 transition-colors px-2 py-1"
    >
      {{ t('friends.remove') }}
    </button>
  </div>
</template>
