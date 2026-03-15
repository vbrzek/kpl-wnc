import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import friendsRoutes from './friends.js';
import { signToken } from '../auth/jwt.js';

vi.mock('../db/db.js', () => {
  const fn = vi.fn() as any;
  fn.raw = vi.fn((...args: any[]) => args[0]);
  return { default: fn };
});
import db from '../db/db.js';
const mockDb = db as unknown as ReturnType<typeof vi.fn>;

const TOKEN = () => signToken({ userId: 1, provider: 'google' });

async function buildApp() {
  process.env.JWT_SECRET = 'test-secret-min-32-chars-long-123';
  const app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(friendsRoutes, { prefix: '/api' });
  await app.ready();
  return app;
}

describe('GET /api/friends', () => {
  it('returns 401 without auth', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/friends' });
    expect(res.statusCode).toBe(401);
  });

  it('returns friends list', async () => {
    const app = await buildApp();
    mockDb.mockReturnValue({
      join: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue([
        { friendshipId: 1, userId: 2, nickname: 'Alice', avatarUrl: null, trophies: 5 },
      ]),
    });
    const res = await app.inject({
      method: 'GET', url: '/api/friends',
      headers: { cookie: `kpl_token=${TOKEN()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveLength(1);
    expect(body[0].nickname).toBe('Alice');
  });
});

describe('GET /api/friends/requests', () => {
  it('returns pending requests', async () => {
    const app = await buildApp();
    mockDb.mockReturnValue({
      join: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue([
        { friendshipId: 3, fromUserId: 5, fromNick: 'Bob', fromAvatarUrl: null },
      ]),
    });
    const res = await app.inject({
      method: 'GET', url: '/api/friends/requests',
      headers: { cookie: `kpl_token=${TOKEN()}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toHaveLength(1);
  });
});

describe('POST /api/friends/request', () => {
  it('returns 400 if addresseeId missing', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/api/friends/request',
      headers: { cookie: `kpl_token=${TOKEN()}`, 'content-type': 'application/json' },
      payload: JSON.stringify({}),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 if sending request to self', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/api/friends/request',
      headers: { cookie: `kpl_token=${TOKEN()}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ addresseeId: 1 }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('creates friendship record', async () => {
    const app = await buildApp();
    mockDb
      .mockReturnValueOnce({
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orWhere: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null), // no existing friendship
      })
      .mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue([42]),
      });
    const res = await app.inject({
      method: 'POST', url: '/api/friends/request',
      headers: { cookie: `kpl_token=${TOKEN()}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ addresseeId: 2 }),
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).friendshipId).toBe(42);
  });
});

describe('POST /api/friends/accept/:id', () => {
  it('accepts a pending request', async () => {
    const app = await buildApp();
    mockDb
      .mockReturnValueOnce({
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: 7, requester_id: 3, addressee_id: 1, status: 'pending' }),
      })
      .mockReturnValueOnce({
        where: vi.fn().mockReturnThis(),
        update: vi.fn().mockResolvedValue(1),
      });
    const res = await app.inject({
      method: 'POST', url: '/api/friends/accept/7',
      headers: { cookie: `kpl_token=${TOKEN()}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 if request not found or not addressee', async () => {
    const app = await buildApp();
    mockDb.mockReturnValue({
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(null),
    });
    const res = await app.inject({
      method: 'POST', url: '/api/friends/accept/999',
      headers: { cookie: `kpl_token=${TOKEN()}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/friends/:id', () => {
  it('removes a friendship', async () => {
    const app = await buildApp();
    mockDb.mockReturnValue({
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      orWhere: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ id: 5, requester_id: 1, addressee_id: 2, status: 'accepted' }),
      delete: vi.fn().mockResolvedValue(1),
    });
    const res = await app.inject({
      method: 'DELETE', url: '/api/friends/5',
      headers: { cookie: `kpl_token=${TOKEN()}` },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('GET /api/users/:id/public', () => {
  it('returns public user profile', async () => {
    const app = await buildApp();
    mockDb.mockReturnValue({
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ id: 2, nickname: 'Alice', avatar_url: null }),
    });
    const res = await app.inject({ method: 'GET', url: '/api/users/2/public' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).nickname).toBe('Alice');
  });

  it('returns 404 for unknown user', async () => {
    const app = await buildApp();
    mockDb.mockReturnValue({
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(null),
    });
    const res = await app.inject({ method: 'GET', url: '/api/users/9999/public' });
    expect(res.statusCode).toBe(404);
  });
});
