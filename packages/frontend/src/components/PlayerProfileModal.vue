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
      class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      @click.self="onBackdropClick"
    >
      <div class="bg-[#0d1117] border border-white/10 rounded-2xl w-full max-w-sm">
        <div class="p-6 space-y-5">

          <!-- Header -->
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-black tracking-tighter uppercase italic text-white">
              {{ isEdit ? t('profile.editTitle') : t('profile.setupTitle') }}
            </h2>
            <button
              v-if="isEdit"
              @click="emit('close')"
              class="text-slate-500 hover:text-white transition-colors p-1"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Avatar preview -->
          <div class="flex justify-center">
            <div class="w-20 h-20 rounded-full overflow-hidden bg-slate-900 border border-white/10">
              <img :src="previewAvatarUrl" alt="avatar" class="w-full h-full object-cover" />
            </div>
          </div>

          <!-- Nickname -->
          <div>
            <label class="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
              {{ t('profile.nickname') }}
            </label>
            <input
              v-model="nicknameInput"
              maxlength="24"
              autofocus
              class="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-white/30 transition-colors"
              :placeholder="t('profile.nicknamePlaceholder')"
              @keyup.enter="submit"
            />
          </div>

          <!-- Language -->
          <div>
            <p class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
              {{ t('profile.language') }}
            </p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="lang in languages"
                :key="lang.code"
                type="button"
                @click="selectedLocale = lang.code"
                :class="[
                  'px-3 py-1.5 rounded-xl text-sm font-bold transition-all border',
                  selectedLocale === lang.code
                    ? 'bg-white/10 border-white/30 text-white'
                    : 'bg-slate-900/40 border-white/5 text-slate-400 hover:border-white/15 hover:text-slate-300',
                ]"
              >
                {{ lang.flag }} {{ lang.label }}
              </button>
            </div>
          </div>

          <!-- Sound toggle -->
          <div class="flex items-center justify-between">
            <p class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
              {{ t('profile.sound') }}
            </p>
            <button
              type="button"
              @click="toggleMute"
              :class="[
                'flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-bold border transition-all',
                muted
                  ? 'bg-slate-900/40 border-white/5 text-slate-500'
                  : 'bg-white/10 border-white/30 text-white',
              ]"
            >
              <span>{{ muted ? '🔇' : '🔊' }}</span>
              <span>{{ muted ? t('profile.soundOff') : t('profile.soundOn') }}</span>
            </button>
          </div>

          <!-- Save -->
          <button
            @click="submit"
            :disabled="!canSave"
            class="w-full py-3.5 bg-white text-black text-sm font-black uppercase tracking-widest rounded-2xl shadow-[0_4px_0_rgb(60,60,60)] active:shadow-none active:translate-y-1 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {{ t('profile.save') }}
          </button>

        </div>
      </div>
    </div>
  </Teleport>
</template>
