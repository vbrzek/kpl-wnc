import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import editorCardsRoutes from './editorCards.js';

vi.mock('../db/db.js', () => ({ default: vi.fn() }));
vi.mock('../auth/middleware.js', () => ({
  verifyJwt: vi.fn(async (request: any) => { request.jwtUser = { userId: 1, provider: 'google' }; }),
}));

import db from '../db/db.js';
const mockDb = db as unknown as ReturnType<typeof vi.fn>;

describe('GET /api/editor/cards', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.resetAllMocks();
    app = Fastify({ logger: false });
    await app.register(cookie);
    await app.register(editorCardsRoutes, { prefix: '/api' });
    await app.ready();
  });

  it('returns black cards with type field', async () => {
    mockDb.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      modify: vi.fn().mockReturnThis(),
      count: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ count: '2' }),
      whereILike: vi.fn().mockReturnThis(),
      whereIn: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue([
        { id: 1, text: 'Karta 1', pick: 1 },
        { id: 2, text: 'Karta 2', pick: 2 },
      ]),
    });
    const res = await app.inject({ method: 'GET', url: '/api/editor/cards?type=black' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.cards[0].type).toBe('black');
    expect(body.total).toBe(2);
  });
});

describe('POST /api/editor/cards', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.resetAllMocks();
    app = Fastify({ logger: false });
    await app.register(cookie);
    await app.register(editorCardsRoutes, { prefix: '/api' });
    await app.ready();
  });

  it('returns 400 when text is empty', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/editor/cards',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'white', text: '', setId: 1 }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 403 when set does not belong to user', async () => {
    mockDb.mockReturnValue({
      where: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(null),
    });
    const res = await app.inject({
      method: 'POST', url: '/api/editor/cards',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'white', text: 'Nová karta', setId: 99 }),
    });
    expect(res.statusCode).toBe(403);
  });
});
