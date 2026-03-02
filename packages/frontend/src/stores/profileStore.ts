import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { i18n } from '../i18n';
import { useRoomStore } from './roomStore';

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

  async function save(newNickname: string, newLocale: SupportedLocale): Promise<string | null> {
    const trimmed = newNickname.trim();
    locale.value = newLocale;
    localStorage.setItem('locale', newLocale);
    (i18n.global.locale as { value: string }).value = newLocale;

    // Sync nickname to room if currently in one and nickname changed
    const roomStore = useRoomStore();
    if (roomStore.room && trimmed !== nickname.value) {
      const error = await roomStore.updateNickname(trimmed);
      if (error) return error.error; // nickname taken — don't update local store
    }

    nickname.value = trimmed;
    const profile: PlayerProfile = { nickname: trimmed, locale: newLocale };
    localStorage.setItem('playerProfile', JSON.stringify(profile));
    return null; // success
  }

  function toggleSoundMuted() {
    soundMuted.value = !soundMuted.value;
    localStorage.setItem('soundMuted', String(soundMuted.value));
  }

  return { nickname, locale, soundMuted, avatarUrl, hasProfile, init, save, toggleSoundMuted };
});
