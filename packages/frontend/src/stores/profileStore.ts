import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { buildDiceBearUrl } from '@kpl/shared';
import { i18n } from '../i18n';
import { useRoomStore } from './roomStore';

export { buildDiceBearUrl };

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
  role: string;
  trophies?: number;
}

interface PlayerProfile {
  nickname: string;
  locale: SupportedLocale;
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';

/**
 * Cachované avatary ukládá backend jako relativní cesty (`/uploads/avatars/…`),
 * aby v DB nebyl zapečený origin. Na absolutní URL je převádí až klient tady.
 */
export function resolveAvatarUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith('/') ? `${BACKEND_URL}${url}` : url;
}

/** Výběr avataru z profilového modalu. */
export interface AvatarSelection {
  type: 'oauth' | 'dicebear';
  dicebearStyle?: string | null;
  dicebearSeed?: string | null;
}

export const useProfileStore = defineStore('profile', () => {
  const nickname = ref('');
  const locale = ref<SupportedLocale>('cs');
  const soundMuted = ref(localStorage.getItem('soundMuted') === 'true');
  const isAuthenticated = ref(false);
  const oauthUser = ref<OAuthUser | null>(null);
  let initPromise: Promise<void> | null = null;

  const avatarUrl = computed(() => {
    if (isAuthenticated.value && oauthUser.value) {
      if (oauthUser.value.avatarType === 'oauth' && oauthUser.value.avatarUrl) {
        return oauthUser.value.avatarUrl;
      }
      return buildDiceBearUrl(
        oauthUser.value.dicebearStyle ?? 'bottts',
        oauthUser.value.dicebearSeed ?? nickname.value,
      );
    }
    return buildDiceBearUrl('bottts', nickname.value);
  });

  const hasProfile = computed(() => nickname.value.trim().length > 0);

  function loadLocale(localeStr: string) {
    if ((SUPPORTED_LOCALES as readonly string[]).includes(localeStr)) {
      locale.value = localeStr as SupportedLocale;
      localStorage.setItem('locale', localeStr);
      (i18n.global.locale as { value: string }).value = localeStr;
    }
  }

  function init() {
    if (!initPromise) initPromise = doInit();
    return initPromise;
  }

  async function doInit() {
    // Try OAuth session first
    let oauthLoaded = false;
    try {
      const res = await fetch(`${BACKEND_URL}/api/me`, { credentials: 'include' });
      if (res.ok) {
        const user = await res.json() as OAuthUser;
        isAuthenticated.value = true;
        oauthUser.value = user;
        if (user.nickname) nickname.value = user.nickname;
        if (user.locale) loadLocale(user.locale);
        oauthLoaded = true;
        if (nickname.value) return; // nickname in DB — done
        // OAuth session valid but no nickname in DB yet — also check localStorage
      }
    } catch {
      // network error — fall through to localStorage
    }

    // Fall back to localStorage profile
    // (covers: no OAuth session, network error, or OAuth user whose nickname isn't in DB yet)
    const raw = localStorage.getItem('playerProfile');
    if (!raw) return;
    try {
      const profile = JSON.parse(raw) as PlayerProfile;
      if (profile.nickname) nickname.value = profile.nickname;
      if (profile.locale && !oauthLoaded) loadLocale(profile.locale);
    } catch {
      // ignore malformed data
    }
  }

  async function save(newNickname: string, newLocale: SupportedLocale, avatar?: AvatarSelection): Promise<string | null> {
    const trimmed = newNickname.trim();
    loadLocale(newLocale);

    // Sync nickname to room if currently in one and nickname changed
    const roomStore = useRoomStore();
    if (roomStore.room && trimmed !== nickname.value) {
      const error = await roomStore.updateNickname(trimmed);
      if (error) return error.error;
    }

    nickname.value = trimmed;

    if (isAuthenticated.value && oauthUser.value) {
      // Optimistic local update — i při výpadku PATCHe se zobrazí nová volba
      if (avatar) {
        oauthUser.value = {
          ...oauthUser.value,
          avatarType: avatar.type,
          ...(avatar.type === 'dicebear' && {
            dicebearStyle: avatar.dicebearStyle ?? null,
            dicebearSeed: avatar.dicebearSeed ?? null,
          }),
        };
      }
      try {
        const res = await fetch(`${BACKEND_URL}/api/me`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            nickname: trimmed,
            locale: newLocale,
            // Při typu 'oauth' se style/seed neposílají, aby v DB zůstala
            // poslední dicebear volba pro případný návrat zpět
            ...(avatar && {
              avatarType: avatar.type,
              ...(avatar.type === 'dicebear' && {
                dicebearStyle: avatar.dicebearStyle ?? null,
                dicebearSeed: avatar.dicebearSeed || null,
              }),
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

    // Sync avatar to current room (if in one) — jediný sync až po uložení,
    // ať se spoluhráčům neblikne stará volba
    if (roomStore.room) roomStore.updateAvatar(avatarUrl.value);

    // Always save to localStorage as fallback
    const profile: PlayerProfile = { nickname: trimmed, locale: newLocale };
    localStorage.setItem('playerProfile', JSON.stringify(profile));
    return null;
  }

  async function logout(): Promise<void> {
    await fetch(`${BACKEND_URL}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
    isAuthenticated.value = false;
    oauthUser.value = null;
    // Ostatní v místnosti musí vidět návrat na guest avatar
    const roomStore = useRoomStore();
    if (roomStore.room) roomStore.updateAvatar(avatarUrl.value);
  }

  function toggleSoundMuted() {
    soundMuted.value = !soundMuted.value;
    localStorage.setItem('soundMuted', String(soundMuted.value));
  }

  return {
    nickname, locale, soundMuted, avatarUrl, hasProfile,
    isAuthenticated, oauthUser, initPromise,
    init, save, logout, toggleSoundMuted,
  };
});
