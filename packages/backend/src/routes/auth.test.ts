import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import authRoutes from './auth.js';
import { signToken } from '../auth/jwt.js';

vi.mock('../db/db.js', () => ({
  default: vi.fn(),
}));

import db from '../db/db.js';
const mockDb = db as unknown as ReturnType<typeof vi.fn>;

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
      mockDb.mockReturnValue({
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(TEST_USER),
      });
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

    it('updates user and returns updated data', async () => {
      const token = signToken({ userId: 1, provider: 'google' });
      const updated = { ...TEST_USER, nickname: 'Nový', locale: 'en' };
      mockDb.mockReturnValue({
        where: vi.fn().mockReturnThis(),
        update: vi.fn().mockResolvedValue(1),
        first: vi.fn().mockResolvedValue(updated),
      });
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
