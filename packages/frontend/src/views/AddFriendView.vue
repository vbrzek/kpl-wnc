<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useProfileStore } from '../stores/profileStore';
import { useFriendsStore } from '../stores/friendsStore';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const profileStore = useProfileStore();
const friendsStore = useFriendsStore();

const userId = Number(route.params.userId);

interface PublicProfile {
  id: number;
  nickname: string;
  avatarUrl: string | null;
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';

const profile = ref<PublicProfile | null>(null);
const notFound = ref(false);
const sending = ref(false);
const sent = ref(false);
const sendError = ref<string | null>(null);

const isSelf = computed(() => profileStore.oauthUser?.id === userId);

onMounted(async () => {
  await profileStore.init();
  try {
    const res = await fetch(`${BACKEND_URL}/api/users/${userId}/public`);
    if (res.status === 404) { notFound.value = true; return; }
    if (!res.ok) throw new Error();
    profile.value = await res.json();
  } catch {
    notFound.value = true;
  }
});

async function sendRequest() {
  if (!profileStore.isAuthenticated) {
    router.push('/');
    return;
  }
  sending.value = true;
  sendError.value = null;
  const error = await friendsStore.sendRequest(userId);
  sending.value = false;
  if (error) {
    sendError.value = error;
  } else {
    sent.value = true;
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4">
    <div class="max-w-sm w-full bg-gray-800 border border-white/10 rounded-3xl p-8 text-center">

      <div v-if="notFound" class="text-gray-400">
        <p class="text-4xl mb-4">🤷</p>
        <p class="font-bold text-white mb-2">{{ t('friends.userNotFound') }}</p>
        <button @click="router.push('/')" class="text-sm text-yellow-400 hover:underline mt-4">
          {{ t('common.backToHome') }}
        </button>
      </div>

      <template v-else-if="profile">
        <img
          :src="profile.avatarUrl ?? `https://api.dicebear.com/9.x/bottts/svg?seed=${profile.nickname}`"
          :alt="profile.nickname"
          class="w-20 h-20 rounded-full mx-auto mb-4 object-cover bg-gray-700"
        />
        <h1 class="text-xl font-black text-white mb-6">{{ profile.nickname }}</h1>

        <!-- Self -->
        <p v-if="isSelf" class="text-sm text-gray-400">{{ t('friends.cantAddSelf') }}</p>

        <!-- Not authenticated -->
        <div v-else-if="!profileStore.isAuthenticated" class="space-y-3">
          <p class="text-sm text-gray-400">{{ t('friends.loginToAdd') }}</p>
          <button @click="router.push('/')" class="bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-xl px-6 py-2.5 transition-colors w-full">
            {{ t('friends.goLogin') }}
          </button>
        </div>

        <!-- Sent -->
        <div v-else-if="sent">
          <p class="text-green-400 font-bold">{{ t('friends.requestSent') }} ✓</p>
        </div>

        <!-- Send button -->
        <div v-else class="space-y-3">
          <p v-if="sendError" class="text-sm text-red-400">{{ sendError }}</p>
          <button
            @click="sendRequest"
            :disabled="sending"
            class="bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-bold rounded-xl px-6 py-2.5 transition-colors w-full"
          >
            {{ sending ? t('common.loading') : t('friends.sendRequest') }}
          </button>
        </div>
      </template>

      <div v-else class="text-gray-400 text-sm">{{ t('common.loading') }}</div>

    </div>
  </div>
</template>
