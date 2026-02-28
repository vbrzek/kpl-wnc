<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProfileStore } from '../stores/profileStore';
import type { SupportedLocale } from '../stores/profileStore';
import { useSound } from '../composables/useSound';

const props = withDefaults(defineProps<{ isEdit?: boolean }>(), { isEdit: false });
const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const profileStore = useProfileStore();
const { muted, toggleMute } = useSound();

const nicknameInput = ref(profileStore.nickname);
const selectedLocale = ref<SupportedLocale>(profileStore.locale);

const previewAvatarUrl = computed(() =>
  `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(nicknameInput.value || 'default')}`
);

const canSave = computed(() => nicknameInput.value.trim().length > 0);

const languages: { code: SupportedLocale; label: string; flag: string }[] = [
  { code: 'cs', label: 'Čeština', flag: '🇨🇿' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'uk', label: 'Українська', flag: '🇺🇦' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
];

function submit() {
  if (!canSave.value) return;
  profileStore.save(nicknameInput.value.trim(), selectedLocale.value);
  emit('close');
}

function onBackdropClick() {
  if (props.isEdit) emit('close');
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 text-white"
      @click.self="onBackdropClick"
    >
      <div class="bg-gray-800 p-6 rounded-xl w-full max-w-sm space-y-5">

        <div class="flex items-center justify-between">
          <h2 class="text-xl font-bold">
            {{ isEdit ? t('profile.editTitle') : t('profile.setupTitle') }}
          </h2>
          <button
            v-if="isEdit"
            @click="emit('close')"
            class="text-gray-400 hover:text-white text-lg leading-none"
          >✕</button>
        </div>

        <!-- Live avatar náhled -->
        <div class="flex justify-center">
          <div class="w-24 h-24 rounded-full overflow-hidden bg-gray-700">
            <img :src="previewAvatarUrl" alt="avatar" class="w-full h-full object-cover" />
          </div>
        </div>

        <!-- Přezdívka -->
        <label class="block">
          <span class="text-sm text-gray-300">{{ t('profile.nickname') }}</span>
          <input
            v-model="nicknameInput"
            maxlength="24"
            autofocus
            class="mt-1 w-full bg-gray-700 px-3 py-2 rounded"
            :placeholder="t('profile.nicknamePlaceholder')"
            @keyup.enter="submit"
          />
        </label>

        <!-- Výběr jazyka -->
        <div>
          <span class="text-sm text-gray-300">{{ t('profile.language') }}</span>
          <div class="mt-2 flex flex-wrap gap-2">
            <button
              v-for="lang in languages"
              :key="lang.code"
              @click="selectedLocale = lang.code"
              :class="[
                'px-3 py-1.5 rounded text-sm transition-colors',
                selectedLocale === lang.code
                  ? 'bg-indigo-600 text-white font-semibold'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
              ]"
            >
              {{ lang.flag }} {{ lang.label }}
            </button>
          </div>
        </div>

        <!-- Zvuk -->
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-300">{{ t('profile.sound') }}</span>
          <button
            type="button"
            @click="toggleMute"
            :class="[
              'flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors',
              muted ? 'bg-gray-700 text-gray-400' : 'bg-indigo-600/20 text-indigo-300'
            ]"
          >
            <span>{{ muted ? '🔇' : '🔊' }}</span>
            <span>{{ muted ? t('profile.soundOff') : t('profile.soundOn') }}</span>
          </button>
        </div>

        <button
          @click="submit"
          :disabled="!canSave"
          class="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed py-2 rounded font-semibold"
        >
          {{ t('profile.save') }}
        </button>

      </div>
    </div>
  </Teleport>
</template>
