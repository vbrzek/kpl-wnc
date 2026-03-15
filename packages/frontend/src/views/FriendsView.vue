<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import QRCode from 'qrcode';
import { useProfileStore } from '../stores/profileStore';
import { useFriendsStore } from '../stores/friendsStore';
import { useToast } from '../composables/useToast';
import FriendCard from '../components/FriendCard.vue';
import FriendRequestCard from '../components/FriendRequestCard.vue';

const router = useRouter();
const { t } = useI18n();
const profileStore = useProfileStore();
const friendsStore = useFriendsStore();
const { show } = useToast();

const showQR = ref(false);
const qrDataUrl = ref('');

const profileUrl = computed(() =>
  `${window.location.origin}/add-friend/${profileStore.oauthUser?.id}`
);

onMounted(async () => {
  await Promise.all([friendsStore.fetchFriends(), friendsStore.fetchRequests()]);
});

async function copyLink() {
  await navigator.clipboard.writeText(profileUrl.value);
  show(t('common.copied'), { type: 'success', duration: 2000 });
}

async function toggleQR() {
  if (!showQR.value) {
    qrDataUrl.value = await QRCode.toDataURL(profileUrl.value, { width: 200, margin: 2 });
  }
  showQR.value = !showQR.value;
}
</script>

<template>
  <div class="max-w-2xl mx-auto pt-8 pb-12 px-4">
    <!-- Back -->
    <button @click="router.push('/')" class="text-sm text-gray-500 hover:text-gray-300 mb-6 flex items-center gap-1 transition-colors">
      &larr; {{ t('common.back') }}
    </button>

    <h1 class="text-2xl font-black uppercase tracking-tighter text-white mb-8">
      {{ t('friends.title') }}
    </h1>

    <!-- Incoming requests -->
    <section v-if="friendsStore.requests.length > 0" class="mb-8">
      <h2 class="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
        {{ t('friends.pendingRequests') }}
      </h2>
      <div class="flex flex-col gap-2">
        <FriendRequestCard
          v-for="req in friendsStore.requests"
          :key="req.friendshipId"
          :request="req"
          @accept="friendsStore.acceptRequest($event)"
          @reject="friendsStore.rejectOrRemove($event)"
        />
      </div>
    </section>

    <!-- Friends list -->
    <section class="mb-8">
      <h2 class="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
        {{ t('friends.myFriends') }}
      </h2>
      <div v-if="friendsStore.loading" class="text-gray-500 text-sm">{{ t('common.loading') }}</div>
      <p v-else-if="friendsStore.friends.length === 0" class="text-gray-500 text-sm">
        {{ t('friends.noFriends') }}
      </p>
      <div v-else class="flex flex-col gap-2">
        <FriendCard
          v-for="friend in friendsStore.friends"
          :key="friend.friendshipId"
          :friend="friend"
          @remove="friendsStore.rejectOrRemove($event)"
        />
      </div>
    </section>

    <!-- Add friend -->
    <section>
      <h2 class="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
        {{ t('friends.addFriend') }}
      </h2>
      <p class="text-sm text-gray-400 mb-4">{{ t('friends.addFriendHint') }}</p>
      <div class="flex gap-2 flex-wrap">
        <button
          @click="copyLink"
          class="bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-semibold rounded-xl px-4 py-2 transition-colors"
        >
          {{ t('friends.copyProfileLink') }}
        </button>
        <button
          @click="toggleQR"
          class="bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-semibold rounded-xl px-4 py-2 transition-colors"
        >
          {{ showQR ? t('friends.hideQR') : t('friends.showQR') }}
        </button>
      </div>
      <div v-if="showQR" class="mt-4 inline-block p-3 bg-white rounded-2xl">
        <img :src="qrDataUrl" alt="QR kód" class="w-40 h-40" />
      </div>
    </section>
  </div>
</template>
