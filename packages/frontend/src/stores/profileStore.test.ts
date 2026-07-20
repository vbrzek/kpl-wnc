import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

const mockRoomStore = {
  room: null as unknown,
  updateNickname: vi.fn(),
  updateAvatar: vi.fn(),
};

vi.mock('./roomStore', () => ({
  useRoomStore: () => mockRoomStore,
}));

vi.mock('../i18n', () => ({
  i18n: { global: { locale: { value: 'cs' } } },
}));

import { useProfileStore, resolveAvatarUrl } from './profileStore';
import type { OAuthUser } from './profileStore';

const OAUTH_USER: OAuthUser = {
  id: 1,
  provider: 'google',
  nickname: 'Pepa',
  locale: 'cs',
  avatarType: 'dicebear',
  avatarUrl: '/uploads/avatars/1.jpg',
  dicebearStyle: 'dylan',
  dicebearSeed: 'můj seed',
  role: 'user',
  trophies: 5,
};

function mockFetchJson(body: unknown) {
  const fn = vi.fn().mockResolvedValue({ ok: true, json: async () => body });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('profileStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
    mockRoomStore.room = null;
  });

  describe('save', () => {
    it('sends a single PATCH including nickname, locale and avatar selection', async () => {
      const store = useProfileStore();
      store.isAuthenticated = true;
      store.oauthUser = { ...OAUTH_USER };
      const fetchMock = mockFetchJson({ ...OAUTH_USER, nickname: 'Pepa' });

      await store.save('Pepa', 'cs', { type: 'dicebear', dicebearStyle: 'croodles', dicebearSeed: 'x' });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toEqual({
        nickname: 'Pepa',
        locale: 'cs',
        avatarType: 'dicebear',
        dicebearStyle: 'croodles',
        dicebearSeed: 'x',
      });
    });

    it('does not null stored dicebear settings when switching to oauth avatar', async () => {
      const store = useProfileStore();
      store.isAuthenticated = true;
      store.oauthUser = { ...OAUTH_USER };
      const fetchMock = mockFetchJson({ ...OAUTH_USER, avatarType: 'oauth' });

      await store.save('Pepa', 'cs', { type: 'oauth' });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.avatarType).toBe('oauth');
      expect(body).not.toHaveProperty('dicebearStyle');
      expect(body).not.toHaveProperty('dicebearSeed');
    });

    it('syncs the new avatar to the current room exactly once', async () => {
      const store = useProfileStore();
      store.isAuthenticated = true;
      store.oauthUser = { ...OAUTH_USER };
      mockRoomStore.room = { code: 'ABC234' };
      mockFetchJson({ ...OAUTH_USER, dicebearStyle: 'croodles' });

      await store.save('Pepa', 'cs', { type: 'dicebear', dicebearStyle: 'croodles', dicebearSeed: null });

      expect(mockRoomStore.updateAvatar).toHaveBeenCalledTimes(1);
      expect(mockRoomStore.updateAvatar).toHaveBeenCalledWith(expect.stringContaining('croodles'));
    });

    it('keeps trophies visible after save (PATCH response includes them)', async () => {
      const store = useProfileStore();
      store.isAuthenticated = true;
      store.oauthUser = { ...OAUTH_USER };
      mockFetchJson({ ...OAUTH_USER, trophies: 5 });

      await store.save('Pepa', 'cs');

      expect(store.oauthUser?.trophies).toBe(5);
    });
  });

  describe('logout', () => {
    it('syncs the guest avatar to the current room after logout', async () => {
      const store = useProfileStore();
      store.isAuthenticated = true;
      store.oauthUser = { ...OAUTH_USER, avatarType: 'oauth' };
      store.nickname = 'Pepa';
      mockRoomStore.room = { code: 'ABC234' };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

      await store.logout();

      expect(store.isAuthenticated).toBe(false);
      expect(mockRoomStore.updateAvatar).toHaveBeenCalledWith(expect.stringContaining('api.dicebear.com'));
    });
  });

  describe('resolveAvatarUrl', () => {
    it('prefixes the backend URL for relative /uploads paths', () => {
      expect(resolveAvatarUrl('/uploads/avatars/1.png')).toBe('http://localhost:3000/uploads/avatars/1.png');
    });

    it('passes absolute URLs through unchanged', () => {
      expect(resolveAvatarUrl('https://api.dicebear.com/9.x/bottts/svg?seed=x')).toBe('https://api.dicebear.com/9.x/bottts/svg?seed=x');
    });

    it('returns null for null', () => {
      expect(resolveAvatarUrl(null)).toBeNull();
    });
  });
});
