import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { i18n } from '../i18n';

const SUPPORTED_LOCALES = ['cs', 'en', 'ru', 'uk', 'es'] as const;
export type SupportedLocale = typeof SUPPORTED_LOCALES[number];

interface PlayerProfile {
  nickname: string;
  locale: SupportedLocale;
}

export const useProfileStore = defineStore('profile', () => {
  const nickname = ref('');
  const locale = ref<SupportedLocale>('cs');
  const soundMuted = ref(localStorage.getItem('soundMuted') === 'true');

  const avatarUrl = computed(() =>
    `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(nickname.value || 'default')}`
  );

  const hasProfile = computed(() => nickname.value.trim().length > 0);

  function init() {
    const raw = localStorage.getItem('playerProfile');
    if (!raw) return;
    try {
      const profile = JSON.parse(raw) as PlayerProfile;
      if (profile.nickname) nickname.value = profile.nickname;
      if (profile.locale && (SUPPORTED_LOCALES as readonly string[]).includes(profile.locale)) {
        locale.value = profile.locale;
      }
    } catch {
      // ignore malformed data
    }
  }

  function save(newNickname: string, newLocale: SupportedLocale) {
    nickname.value = newNickname.trim();
    locale.value = newLocale;
    const profile: PlayerProfile = { nickname: nickname.value, locale: newLocale };
    localStorage.setItem('playerProfile', JSON.stringify(profile));
    localStorage.setItem('locale', newLocale);
    (i18n.global.locale as { value: string }).value = newLocale;
  }

  function toggleSoundMuted() {
    soundMuted.value = !soundMuted.value;
    localStorage.setItem('soundMuted', String(soundMuted.value));
  }

  return { nickname, locale, soundMuted, avatarUrl, hasProfile, init, save, toggleSoundMuted };
});
