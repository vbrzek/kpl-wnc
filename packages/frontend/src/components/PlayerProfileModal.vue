<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProfileStore } from '../stores/profileStore';
import type { SupportedLocale } from '../stores/profileStore';
import { useSound } from '../composables/useSound';

const props = withDefaults(defineProps<{ isEdit?: boolean; isOAuthSetup?: boolean }>(), {
  isEdit: false,
  isOAuthSetup: false,
});
const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const profileStore = useProfileStore();
const { muted, toggleMute } = useSound();

const isSetupMode = computed(() => !props.isEdit && !props.isOAuthSetup);

const nicknameInput = ref(profileStore.nickname);
const selectedLocale = ref<SupportedLocale>(profileStore.locale);
const saveError = ref('');

const selectedAvatarType = ref<'oauth' | 'dicebear'>(profileStore.oauthUser?.avatarType ?? 'oauth');
const selectedDicebearStyle = ref(profileStore.oauthUser?.dicebearStyle ?? 'bottts');
const dicebearSeedInput = ref(profileStore.oauthUser?.dicebearSeed ?? '');

const DICEBEAR_STYLES = [
  { value: 'bottts', label: 'Bottts' },
  { value: 'avataaars', label: 'Avataars' },
  { value: 'big-smile', label: 'Big Smile' },
  { value: 'croodles', label: 'Croodles' },
  { value: 'dylan', label: 'Dylan' },
  { value: 'big-ears', label: 'Big Ears' },
  { value: 'adventurer', label: 'Adventurer' },
];

const previewAvatarUrl = computed(() => {
  if (profileStore.isAuthenticated && profileStore.oauthUser) {
    if (selectedAvatarType.value === 'oauth' && profileStore.oauthUser.avatarUrl) {
      return profileStore.oauthUser.avatarUrl;
    }
    const seed = dicebearSeedInput.value || nicknameInput.value || 'default';
    return `https://api.dicebear.com/9.x/${selectedDicebearStyle.value}/svg?seed=${encodeURIComponent(seed)}`;
  }
  return `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(nicknameInput.value || 'default')}`;
});

const canSave = computed(() => nicknameInput.value.trim().length > 0);

const languages: { code: SupportedLocale; label: string; flagClass: string }[] = [
  { code: 'cs', label: 'Čeština', flagClass: 'fi fi-cz' },
  { code: 'en', label: 'English', flagClass: 'fi fi-gb' },
  { code: 'ru', label: 'Русский', flagClass: 'fi fi-ru' },
  { code: 'uk', label: 'Українська', flagClass: 'fi fi-ua' },
  { code: 'es', label: 'Español', flagClass: 'fi fi-es' },
];

async function submit() {
  if (!canSave.value) return;
  const error = await profileStore.save(nicknameInput.value.trim(), selectedLocale.value);
  if (error) {
    saveError.value = error;
    return;
  }
  if (profileStore.isAuthenticated) {
    await profileStore.saveAvatar({
      avatarType: selectedAvatarType.value,
      dicebearStyle: selectedAvatarType.value === 'dicebear' ? selectedDicebearStyle.value : null,
      dicebearSeed: selectedAvatarType.value === 'dicebear' ? (dicebearSeedInput.value || null) : null,
    });
  }
  saveError.value = '';
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

          <!-- OAuth login (jen v setup modu, ne edit ani isOAuthSetup) -->
          <template v-if="isSetupMode">
            <a
              href="/auth/google"
              class="flex items-center justify-center gap-3 w-full py-3 bg-white text-black text-sm font-bold rounded-2xl hover:bg-gray-100 transition-colors"
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              {{ t('profile.loginWithGoogle') }}
            </a>
            <a
              href="/auth/discord"
              class="flex items-center justify-center gap-3 w-full py-3 bg-[#5865F2] text-white text-sm font-bold rounded-2xl hover:bg-[#4752c4] transition-colors"
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.033.055a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
              </svg>
              {{ t('profile.loginWithDiscord') }}
            </a>

            <div class="flex items-center gap-3">
              <div class="flex-1 h-px bg-white/10"></div>
              <span class="text-slate-500 text-xs font-bold uppercase tracking-widest">nebo</span>
              <div class="flex-1 h-px bg-white/10"></div>
            </div>
          </template>

          <!-- Avatar preview -->
          <div class="flex justify-center">
            <div class="w-20 h-20 rounded-full overflow-hidden bg-slate-900 border border-white/10">
              <img :src="previewAvatarUrl" alt="avatar" class="w-full h-full object-cover" />
            </div>
          </div>

          <!-- Avatar picker (jen pro přihlášené v edit modu) -->
          <div v-if="isEdit && profileStore.isAuthenticated && profileStore.oauthUser" class="space-y-3">
            <p class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{{ t('profile.avatar') }}</p>
            <!-- Type toggle -->
            <div class="flex gap-2">
              <button
                v-for="type in ['oauth', 'dicebear'] as const"
                :key="type"
                type="button"
                @click="selectedAvatarType = type"
                :class="[
                  'flex-1 py-2 rounded-xl text-xs font-bold border transition-all',
                  selectedAvatarType === type
                    ? 'bg-white/10 border-white/30 text-white'
                    : 'bg-slate-900/40 border-white/5 text-slate-400 hover:border-white/15',
                ]"
              >
                {{ type === 'oauth' ? t('profile.avatarOAuth', { provider: profileStore.oauthUser.provider }) : t('profile.avatarDicebear') }}
              </button>
            </div>
            <!-- DiceBear options -->
            <template v-if="selectedAvatarType === 'dicebear'">
              <div>
                <label class="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">{{ t('profile.dicebearStyle') }}</label>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="style in DICEBEAR_STYLES"
                    :key="style.value"
                    type="button"
                    @click="selectedDicebearStyle = style.value"
                    :class="[
                      'px-2.5 py-1 rounded-lg text-xs font-bold border transition-all',
                      selectedDicebearStyle === style.value
                        ? 'bg-white/10 border-white/30 text-white'
                        : 'bg-slate-900/40 border-white/5 text-slate-400 hover:border-white/15',
                    ]"
                  >
                    {{ style.label }}
                  </button>
                </div>
              </div>
              <div>
                <label class="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">{{ t('profile.dicebearSeed') }}</label>
                <input
                  v-model="dicebearSeedInput"
                  maxlength="100"
                  class="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-white/30 transition-colors text-sm"
                  :placeholder="t('profile.dicebearSeedPlaceholder')"
                />
              </div>
            </template>
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
                <span :class="lang.flagClass"></span> {{ lang.label }}
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

          <!-- Link account (jen pro hosta v edit modu) -->
          <div v-if="isEdit && !profileStore.isAuthenticated" class="border-t border-white/10 pt-4 space-y-2">
            <p class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{{ t('profile.linkAccount') }}</p>
            <a
              href="/auth/google"
              class="flex items-center justify-center gap-2 w-full py-2.5 bg-white/5 border border-white/10 text-slate-300 text-xs font-bold rounded-xl hover:bg-white/10 transition-colors"
            >
              <span>G</span> {{ t('profile.loginWithGoogle') }}
            </a>
            <a
              href="/auth/discord"
              class="flex items-center justify-center gap-2 w-full py-2.5 bg-[#5865F2]/20 border border-[#5865F2]/30 text-[#c0c5ff] text-xs font-bold rounded-xl hover:bg-[#5865F2]/30 transition-colors"
            >
              <span>D</span> {{ t('profile.loginWithDiscord') }}
            </a>
          </div>

          <!-- Logout (jen pro přihlášeného v edit modu) -->
          <div v-if="isEdit && profileStore.isAuthenticated" class="flex items-center justify-between border-t border-white/10 pt-4">
            <span class="text-slate-500 text-xs">{{ t('profile.loggedInAs') }}: <span class="text-slate-300">{{ profileStore.oauthUser?.provider }}</span></span>
            <button
              type="button"
              @click="profileStore.logout(); emit('close')"
              class="text-xs text-red-400 hover:text-red-300 font-bold transition-colors"
            >
              {{ t('profile.logout') }}
            </button>
          </div>

          <!-- Save -->
          <p v-if="saveError" class="text-red-400 text-sm text-center">{{ saveError }}</p>
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
