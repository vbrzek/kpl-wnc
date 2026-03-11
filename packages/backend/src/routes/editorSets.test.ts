import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import editorSetsRoutes from './editorSets.js';
import { signToken } from '../auth/jwt.js';

vi.mock('../db/db.js', () => ({ default: vi.fn() }));
vi.mock('../auth/middleware.js', () => ({
  verifyJwt: vi.fn(async (request: any) => { request.jwtUser = { userId: 1, provider: 'google' }; }),
}));

import db from '../db/db.js';
const mockDb = db as unknown as ReturnType<typeof vi.fn>;
(mockDb as any).raw = vi.fn((...args: any[]) => args[0]);

describe('GET /api/editor/sets', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.resetAllMocks();
    app = Fastify({ logger: false });
    await app.register(cookie);
    await app.register(editorSetsRoutes, { prefix: '/api' });
    await app.ready();
  });

  it('returns empty array when user has no sets', async () => {
    let callCount = 0;
    mockDb.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return { where: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue({ role: 'user' }) };
      return {
        select: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };
    });
    const res = await app.inject({ method: 'GET', url: '/api/editor/sets' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([]);
  });

  it('returns user sets with card counts', async () => {
    let callCount = 0;
    mockDb.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return { where: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue({ role: 'user' }) };
      return {
        select: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          { id: 1, name: 'Moje sada', description: null, is_public: 0, user_id: 1, black_count: '5', white_count: '10', owner_nickname: 'Test' },
        ]),
      };
    });
    const res = await app.inject({ method: 'GET', url: '/api/editor/sets' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body[0]).toEqual({ id: 1, name: 'Moje sada', description: null, isPublic: false, isOwn: true, ownerNickname: 'Test', blackCount: 5, whiteCount: 10 });
  });
});

describe('POST /api/editor/sets', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.resetAllMocks();
    app = Fastify({ logger: false });
    await app.register(cookie);
    await app.register(editorSetsRoutes, { prefix: '/api' });
    await app.ready();
  });

  it('creates a new set and returns it', async () => {
    let callCount = 0;
    mockDb.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return { where: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue({ role: 'user' }) };
      return { insert: vi.fn().mockResolvedValue([42]) };
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/editor/sets',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Nová sada', isPublic: false }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(42);
    expect(body.name).toBe('Nová sada');
  });

  it('returns 400 when name is empty', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/editor/sets',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '', isPublic: false }),
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /api/editor/sets/:id', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.resetAllMocks();
    app = Fastify({ logger: false });
    await app.register(cookie);
    await app.register(editorSetsRoutes, { prefix: '/api' });
    await app.ready();
  });

  it('returns 404 when set does not belong to user', async () => {
    let callCount = 0;
    mockDb.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return { where: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue({ role: 'user' }) };
      return { where: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue(null) };
    });
    const res = await app.inject({ method: 'DELETE', url: '/api/editor/sets/99' });
    expect(res.statusCode).toBe(404);
  });

  it('deletes set and returns ok', async () => {
    let callCount = 0;
    mockDb.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return { where: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue({ role: 'user' }) };
      return {
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: 1 }),
        delete: vi.fn().mockResolvedValue(1),
      };
    });
    const res = await app.inject({ method: 'DELETE', url: '/api/editor/sets/1' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
  });
});
