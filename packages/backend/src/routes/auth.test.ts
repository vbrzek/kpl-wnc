import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import authRoutes from './auth.js';
import { signToken } from '../auth/jwt.js';

vi.mock('../db/db.js', () => ({
  default: vi.fn(),
}));

vi.mock('../utils/avatarCache.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/avatarCache.js')>()),
  cacheAvatar: vi.fn(),
}));

import db from '../db/db.js';
import { cacheAvatar } from '../utils/avatarCache.js';
import { findOrCreateUser } from './auth.js';
const mockDb = db as unknown as ReturnType<typeof vi.fn>;
const mockCacheAvatar = cacheAvatar as unknown as ReturnType<typeof vi.fn>;

const TEST_USER = {
  id: 1,
  provider: 'google',
  provider_id: 'g123',
  nickname: 'Testík',
  locale: 'cs',
  avatar_type: 'oauth',
  avatar_url: 'https://example.com/avatar.jpg',
  dicebear_style: null,
  dicebear_seed: null,
};

describe('Auth routes', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.resetAllMocks();
    process.env.JWT_SECRET = 'test-secret-min-32-chars-long-123';
    app = Fastify({ logger: false });
    await app.register(cookie);
    await app.register(authRoutes);
    await app.ready();
  });

  describe('GET /api/me', () => {
    it('returns 401 when no cookie', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/me' });
      expect(res.statusCode).toBe(401);
    });

    it('returns 200 with user when valid JWT cookie', async () => {
      const token = signToken({ userId: 1, provider: 'google' });
      const chain = {
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ ...TEST_USER, total_trophies: 42 }),
      };
      mockDb.mockReturnValue(chain);
      (mockDb as any).raw = vi.fn().mockReturnValue('COALESCE(user_trophies.trophies, 0) as total_trophies');
      const res = await app.inject({
        method: 'GET',
        url: '/api/me',
        headers: { cookie: `kpl_token=${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe(1);
      expect(body.nickname).toBe('Testík');
      expect(body.provider).toBe('google');
      expect(body.trophies).toBe(42);
    });

    it('returns 401 when JWT is tampered', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/me',
        headers: { cookie: 'kpl_token=notavalidjwt' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('PATCH /api/me', () => {
    it('returns 401 when no cookie', async () => {
      const res = await app.inject({
        method: 'PATCH', url: '/api/me',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ nickname: 'X' }),
      });
      expect(res.statusCode).toBe(401);
    });

    function mockPatchChain(row: Record<string, unknown>) {
      const chain = {
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        update: vi.fn().mockResolvedValue(1),
        first: vi.fn().mockResolvedValue(row),
      };
      mockDb.mockReturnValue(chain);
      (mockDb as any).raw = vi.fn().mockReturnValue('COALESCE(user_trophies.trophies, 0) as total_trophies');
      return chain;
    }

    it('updates user and returns updated data', async () => {
      const token = signToken({ userId: 1, provider: 'google' });
      mockPatchChain({ ...TEST_USER, nickname: 'Nový', locale: 'en', total_trophies: 0 });
      const res = await app.inject({
        method: 'PATCH', url: '/api/me',
        headers: {
          cookie: `kpl_token=${token}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({ nickname: 'Nový', locale: 'en' }),
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).nickname).toBe('Nový');
    });

    it('returns trophies in the PATCH response', async () => {
      const token = signToken({ userId: 1, provider: 'google' });
      mockPatchChain({ ...TEST_USER, total_trophies: 42 });
      const res = await app.inject({
        method: 'PATCH', url: '/api/me',
        headers: { cookie: `kpl_token=${token}`, 'content-type': 'application/json' },
        payload: JSON.stringify({ nickname: 'Testík' }),
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).trophies).toBe(42);
    });

    it('returns current user without calling update() on empty body', async () => {
      const token = signToken({ userId: 1, provider: 'google' });
      const chain = mockPatchChain({ ...TEST_USER, total_trophies: 7 });
      const res = await app.inject({
        method: 'PATCH', url: '/api/me',
        headers: { cookie: `kpl_token=${token}`, 'content-type': 'application/json' },
        payload: JSON.stringify({}),
      });
      expect(res.statusCode).toBe(200);
      expect(chain.update).not.toHaveBeenCalled();
      expect(JSON.parse(res.body).nickname).toBe('Testík');
    });

    it('accepts a 24-char nickname padded with whitespace and trims it', async () => {
      const token = signToken({ userId: 1, provider: 'google' });
      const nick24 = 'a'.repeat(24);
      const chain = mockPatchChain({ ...TEST_USER, nickname: nick24, total_trophies: 0 });
      const res = await app.inject({
        method: 'PATCH', url: '/api/me',
        headers: { cookie: `kpl_token=${token}`, 'content-type': 'application/json' },
        payload: JSON.stringify({ nickname: `  ${nick24}  ` }),
      });
      expect(res.statusCode).toBe(200);
      expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ nickname: nick24 }));
    });

    it('rejects a nickname longer than 24 chars after trim', async () => {
      const token = signToken({ userId: 1, provider: 'google' });
      mockPatchChain({ ...TEST_USER, total_trophies: 0 });
      const res = await app.inject({
        method: 'PATCH', url: '/api/me',
        headers: { cookie: `kpl_token=${token}`, 'content-type': 'application/json' },
        payload: JSON.stringify({ nickname: 'a'.repeat(25) }),
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('findOrCreateUser', () => {
    function mockUpsertChain(firstResults: unknown[], insertedId = 7) {
      const chain = {
        where: vi.fn().mockReturnThis(),
        whereNull: vi.fn().mockReturnThis(),
        update: vi.fn().mockResolvedValue(1),
        insert: vi.fn().mockResolvedValue([insertedId]),
        first: vi.fn(),
      };
      for (const r of firstResults) chain.first.mockResolvedValueOnce(r);
      mockDb.mockReturnValue(chain);
      return chain;
    }

    const GOOGLE_AVATAR = 'https://lh3.googleusercontent.com/a/photo';

    it('does not overwrite provider/provider_id when linking by email', async () => {
      const chain = mockUpsertChain([{ id: 1, email: 'a@b.cz', provider: 'google', provider_id: 'g1', avatar_url: '/uploads/avatars/1.jpg' }]);
      mockCacheAvatar.mockResolvedValue('/uploads/avatars/1.png');

      const result = await findOrCreateUser({ email: 'a@b.cz', provider: 'discord', providerId: 'd9', avatarUrl: GOOGLE_AVATAR });

      expect(result).toEqual({ userId: 1, isNew: false });
      for (const call of chain.update.mock.calls) {
        expect(call[0]).not.toHaveProperty('provider');
        expect(call[0]).not.toHaveProperty('provider_id');
      }
    });

    it('updates avatar_url to the cached local path on success', async () => {
      const chain = mockUpsertChain([{ id: 1, email: 'a@b.cz', avatar_url: null }]);
      mockCacheAvatar.mockResolvedValue('/uploads/avatars/1.png');

      await findOrCreateUser({ email: 'a@b.cz', provider: 'google', providerId: 'g1', avatarUrl: GOOGLE_AVATAR });

      expect(chain.update).toHaveBeenCalledWith({ avatar_url: '/uploads/avatars/1.png' });
    });

    it('keeps existing avatar_url when caching fails (only fills if null)', async () => {
      const chain = mockUpsertChain([{ id: 1, email: 'a@b.cz', avatar_url: '/uploads/avatars/1.jpg' }]);
      mockCacheAvatar.mockResolvedValue(null);

      await findOrCreateUser({ email: 'a@b.cz', provider: 'google', providerId: 'g1', avatarUrl: GOOGLE_AVATAR });

      // fallback na externí URL smí jít jen přes whereNull guard
      expect(chain.update).toHaveBeenCalledTimes(1);
      expect(chain.whereNull).toHaveBeenCalledWith('avatar_url');
      expect(chain.update).toHaveBeenCalledWith({ avatar_url: GOOGLE_AVATAR });
    });

    it('creates a new user and caches their avatar', async () => {
      const chain = mockUpsertChain([undefined, undefined], 7);
      mockCacheAvatar.mockResolvedValue('/uploads/avatars/7.jpg');

      const result = await findOrCreateUser({ email: 'new@b.cz', provider: 'google', providerId: 'g2', avatarUrl: GOOGLE_AVATAR });

      expect(result).toEqual({ userId: 7, isNew: true });
      expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ provider: 'google', provider_id: 'g2', email: 'new@b.cz' }));
      expect(chain.update).toHaveBeenCalledWith({ avatar_url: '/uploads/avatars/7.jpg' });
    });

    it('backfills missing email on same-provider re-login', async () => {
      const chain = mockUpsertChain([undefined, { id: 3, email: null, avatar_url: null }]);
      mockCacheAvatar.mockResolvedValue(null);

      await findOrCreateUser({ email: 'later@b.cz', provider: 'discord', providerId: 'd1', avatarUrl: null });

      expect(chain.update).toHaveBeenCalledWith({ email: 'later@b.cz' });
    });
  });

  describe('POST /auth/logout', () => {
    it('clears cookie and returns 200', async () => {
      const res = await app.inject({ method: 'POST', url: '/auth/logout' });
      expect(res.statusCode).toBe(200);
      const setCookie = res.headers['set-cookie'] as string;
      expect(setCookie).toMatch(/kpl_token=;/);
    });
  });
});
