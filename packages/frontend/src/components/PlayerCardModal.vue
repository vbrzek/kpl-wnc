<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Player } from '@kpl/shared';
import { useProfileStore } from '../stores/profileStore';
import { useFriendsStore } from '../stores/friendsStore';
import Avatar from './Avatar.vue';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';

const props = defineProps<{
  player: Player;
  myPlayerId: string | null;
}>();

const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const profileStore = useProfileStore();
const friendsStore = useFriendsStore();

const trophies = ref<number | null>(null);
const friendRequestSent = ref(false);
const friendRequestError = ref('');
const loadingFriend = ref(false);

const isOAuth = computed(() => !!props.player.oauthUserId);

const isFriend = computed(() =>
  !!props.player.oauthUserId &&
  friendsStore.friends.some(f => f.userId === props.player.oauthUserId)
);

const canAddFriend = computed(() =>
  profileStore.isAuthenticated &&
  isOAuth.value &&
  !isFriend.value &&
  !friendRequestSent.value
);

onMounted(async () => {
  if (!props.player.oauthUserId) return;
  try {
    const res = await fetch(`${BACKEND_URL}/api/users/${props.player.oauthUserId}/public-profile`);
    if (res.ok) {
      const data = await res.json();
      trophies.value = data.trophies;
    }
  } catch { /* silent */ }
});

async function addFriend() {
  if (!props.player.oauthUserId) return;
  loadingFriend.value = true;
  friendRequestError.value = '';
  const err = await friendsStore.sendRequest(props.player.oauthUserId);
  loadingFriend.value = false;
  if (err) {
    friendRequestError.value = err;
  } else {
    friendRequestSent.value = true;
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      @click.self="emit('close')"
    >
      <div class="bg-[#0d1117] border border-white/10 rounded-2xl w-full max-w-xs p-6 flex flex-col items-center gap-4 relative">
        <!-- Close button -->
        <button
          @click="emit('close')"
          class="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <!-- Avatar -->
        <Avatar :nickname="player.nickname" :avatar-url="player.avatarUrl" :size="64" />

        <!-- Nickname -->
        <h2 class="text-xl font-black tracking-tighter uppercase italic text-white">
          {{ player.nickname }}
        </h2>

        <!-- Guest view -->
        <template v-if="!isOAuth">
          <p class="text-slate-400 text-sm text-center">{{ t('playerCard.guestInfo') }}</p>
        </template>

        <!-- OAuth view -->
        <template v-else>
          <!-- Trophies -->
          <div class="flex items-center gap-2 text-yellow-400 font-black text-lg">
            <span>🏆</span>
            <span v-if="trophies !== null">{{ trophies }}</span>
            <span v-else class="text-slate-500 text-sm font-normal">...</span>
          </div>

          <!-- Friend actions -->
          <div v-if="canAddFriend" class="w-full">
            <button
              @click="addFriend"
              :disabled="loadingFriend"
              class="w-full py-2.5 bg-white text-black text-sm font-black uppercase tracking-widest rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:bg-gray-100"
            >
              {{ loadingFriend ? '...' : t('playerCard.addFriend') }}
            </button>
            <p v-if="friendRequestError" class="text-red-400 text-xs text-center mt-2">{{ friendRequestError }}</p>
          </div>

          <div v-else-if="friendRequestSent" class="text-green-400 text-sm font-bold">
            {{ t('playerCard.requestSent') }}
          </div>

          <div v-else-if="isFriend" class="text-slate-400 text-sm font-bold">
            ✓ {{ t('playerCard.alreadyFriends') }}
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
