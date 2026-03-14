<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useProfileStore } from '../stores/profileStore';
import { useI18n } from 'vue-i18n';

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'editProfile'): void;
}>();

const router = useRouter();
const profileStore = useProfileStore();
const { t } = useI18n();

function navigate(path: string) {
  emit('close');
  router.push(path);
}
</script>

<template>
  <div class="absolute right-0 top-full mt-2 w-52 bg-gray-800 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50">
    <!-- Player name -->
    <div class="px-4 py-3 border-b border-white/10">
      <p class="text-xs text-gray-500 uppercase tracking-widest font-bold">{{ profileStore.nickname }}</p>
    </div>

    <!-- Primary nav (player-related) -->
    <div class="py-1">
      <button @click="emit('editProfile'); emit('close')"
        class="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-white/5 transition-colors">
        {{ t('nav.myProfile') }}
      </button>
      <button @click="navigate('/editor')"
        class="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-white/5 transition-colors">
        {{ t('nav.cardEditor') }}
      </button>
      <button @click="navigate('/friends')"
        class="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-white/5 transition-colors">
        {{ t('nav.friends') }}
      </button>
    </div>

    <!-- Divider -->
    <div class="border-t border-white/10"></div>

    <!-- Secondary nav -->
    <div class="py-1">
      <button @click="navigate('/rules')"
        class="w-full text-left px-4 py-2.5 text-sm text-gray-400 hover:bg-white/5 hover:text-white transition-colors">
        {{ t('nav.rules') }}
      </button>
      <button @click="navigate('/about')"
        class="w-full text-left px-4 py-2.5 text-sm text-gray-400 hover:bg-white/5 hover:text-white transition-colors">
        {{ t('nav.about') }}
      </button>
    </div>
  </div>
</template>
