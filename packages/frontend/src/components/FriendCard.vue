<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoomStore } from '../stores/roomStore';
import { socket } from '../socket';
import type { FriendEntry } from '../stores/friendsStore';
import Avatar from './Avatar.vue';

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
    <Avatar :nickname="friend.nickname" :avatar-url="friend.avatarUrl" :size="40" />
    <span class="flex-1 text-sm font-semibold text-white truncate">{{ friend.nickname }}</span>
    <span class="text-xs font-bold text-yellow-400 shrink-0">🏆 {{ friend.trophies }}</span>
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
