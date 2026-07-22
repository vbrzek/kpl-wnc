import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

const mockRoomStore = {
  room: null as unknown,
  updateAvatar: vi.fn(),
};

vi.mock('./roomStore', () => ({
  useRoomStore: () => mockRoomStore,
}));

vi.mock('../i18n', () => ({
  i18n: { global: { locale: { value: 'cs' } } },
}));

const mockSocket = vi.hoisted(() => ({
  connected: true,
  emit: vi.fn((_event: string, _data: unknown, cb?: (result: unknown) => void) => {
    cb?.({ ok: true });
  }),
}));

vi.mock('../socket', () => ({
  socket: mockSocket,
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

    it('propagates a nickname change via profile:updateNickname even outside a room view', async () => {
      const store = useProfileStore();
      store.nickname = 'Pepa';
      mockRoomStore.room = null; // hráč edituje profil mimo pohled na místnost

      const result = await store.save('Pepik', 'cs');

      expect(result).toBeNull();
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'profile:updateNickname',
        expect.objectContaining({ nickname: 'Pepik', guestId: expect.any(String) }),
        expect.any(Function),
      );
      expect(store.nickname).toBe('Pepik');
    });

    it('does not emit the sync event when the nickname is unchanged', async () => {
      const store = useProfileStore();
      store.nickname = 'Pepa';

      await store.save('Pepa', 'cs');

      expect(mockSocket.emit).not.toHaveBeenCalledWith(
        'profile:updateNickname', expect.anything(), expect.anything(),
      );
    });

    it('aborts the save when the server reports a nickname collision', async () => {
      const store = useProfileStore();
      store.nickname = 'Pepa';
      mockSocket.emit.mockImplementationOnce((_e, _d, cb) => cb?.({ error: 'Přezdívka je již obsazena.' }));

      const result = await store.save('Cyril', 'cs');

      expect(result).toBe('Přezdívka je již obsazena.');
      expect(store.nickname).toBe('Pepa');
      expect(localStorage.getItem('playerProfile')).toBeNull();
    });

    it('skips the server sync when the socket is disconnected (syncs on next reconnect)', async () => {
      const store = useProfileStore();
      store.nickname = 'Pepa';
      mockSocket.connected = false;

      const result = await store.save('Pepik', 'cs');

      expect(result).toBeNull();
      expect(store.nickname).toBe('Pepik');
      expect(mockSocket.emit).not.toHaveBeenCalled();
      mockSocket.connected = true;
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
