import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { i18n } from '../i18n';
import { useRoomStore } from './roomStore';

const SUPPORTED_LOCALES = ['cs', 'en', 'ru', 'uk', 'es'] as const;
export type SupportedLocale = typeof SUPPORTED_LOCALES[number];

export interface OAuthUser {
  id: number;
  provider: 'google' | 'discord';
  nickname: string | null;
  locale: string;
  avatarType: 'oauth' | 'dicebear';
  avatarUrl: string | null;
  dicebearStyle: string | null;
  dicebearSeed: string | null;
}

interface PlayerProfile {
  nickname: string;
  locale: SupportedLocale;
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';

export const useProfileStore = defineStore('profile', () => {
  const nickname = ref('');
  const locale = ref<SupportedLocale>('cs');
  const soundMuted = ref(localStorage.getItem('soundMuted') === 'true');
  const isAuthenticated = ref(false);
  const oauthUser = ref<OAuthUser | null>(null);

  const avatarUrl = computed(() => {
    if (isAuthenticated.value && oauthUser.value) {
      if (oauthUser.value.avatarType === 'oauth' && oauthUser.value.avatarUrl) {
        return oauthUser.value.avatarUrl;
      }
      const style = oauthUser.value.dicebearStyle ?? 'bottts';
      const seed = oauthUser.value.dicebearSeed ?? nickname.value || 'default';
      return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}`;
    }
    return `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(nickname.value || 'default')}`;
  });

  const hasProfile = computed(() => nickname.value.trim().length > 0);

  function loadLocale(localeStr: string) {
    if ((SUPPORTED_LOCALES as readonly string[]).includes(localeStr)) {
      locale.value = localeStr as SupportedLocale;
      localStorage.setItem('locale', localeStr);
      (i18n.global.locale as { value: string }).value = localeStr;
    }
  }

  async function init() {
    // Try OAuth session first
    try {
      const res = await fetch(`${BACKEND_URL}/api/me`, { credentials: 'include' });
      if (res.ok) {
        const user = await res.json() as OAuthUser;
        isAuthenticated.value = true;
        oauthUser.value = user;
        if (user.nickname) nickname.value = user.nickname;
        if (user.locale) loadLocale(user.locale);
        return;
      }
    } catch {
      // network error — fall through to localStorage
    }

    // Fall back to localStorage profile
    const raw = localStorage.getItem('playerProfile');
    if (!raw) return;
    try {
      const profile = JSON.parse(raw) as PlayerProfile;
      if (profile.nickname) nickname.value = profile.nickname;
      if (profile.locale) loadLocale(profile.locale);
    } catch {
      // ignore malformed data
    }
  }

  async function save(newNickname: string, newLocale: SupportedLocale): Promise<string | null> {
    const trimmed = newNickname.trim();
    loadLocale(newLocale);

    // Sync nickname to room if currently in one and nickname changed
    const roomStore = useRoomStore();
    if (roomStore.room && trimmed !== nickname.value) {
      const error = await roomStore.updateNickname(trimmed);
      if (error) return error.error;
    }

    nickname.value = trimmed;

    if (isAuthenticated.value) {
      try {
        const res = await fetch(`${BACKEND_URL}/api/me`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            nickname: trimmed,
            locale: newLocale,
            ...(oauthUser.value?.avatarType === 'dicebear' && {
              avatarType: 'dicebear',
              dicebearStyle: oauthUser.value.dicebearStyle,
              dicebearSeed: oauthUser.value.dicebearSeed,
            }),
          }),
        });
        if (res.ok) {
          oauthUser.value = await res.json() as OAuthUser;
        }
      } catch {
        // non-critical — continue
      }
    }

    // Always save to localStorage as fallback
    const profile: PlayerProfile = { nickname: trimmed, locale: newLocale };
    localStorage.setItem('playerProfile', JSON.stringify(profile));
    return null;
  }

  async function saveAvatar(updates: Partial<Pick<OAuthUser, 'avatarType' | 'avatarUrl' | 'dicebearStyle' | 'dicebearSeed'>>): Promise<void> {
    if (!isAuthenticated.value || !oauthUser.value) return;
    oauthUser.value = { ...oauthUser.value, ...updates };
    try {
      const res = await fetch(`${BACKEND_URL}/api/me`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          avatarType: oauthUser.value.avatarType,
          dicebearStyle: oauthUser.value.dicebearStyle,
          dicebearSeed: oauthUser.value.dicebearSeed,
        }),
      });
      if (res.ok) oauthUser.value = await res.json() as OAuthUser;
    } catch {
      // non-critical
    }
  }

  async function logout(): Promise<void> {
    await fetch(`${BACKEND_URL}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
    isAuthenticated.value = false;
    oauthUser.value = null;
  }

  function toggleSoundMuted() {
    soundMuted.value = !soundMuted.value;
    localStorage.setItem('soundMuted', String(soundMuted.value));
  }

  return {
    nickname, locale, soundMuted, avatarUrl, hasProfile,
    isAuthenticated, oauthUser,
    init, save, saveAvatar, logout, toggleSoundMuted,
  };
});
