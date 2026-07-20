import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import roomsRoutes from './rooms.js';

vi.mock('../game/RoomManager.js', () => ({
  roomManager: {
    getRoom: vi.fn(),
  },
}));

vi.mock('../db/db.js', () => {
  const fn = vi.fn();
  (fn as any).raw = vi.fn();
  return { default: fn };
});

import { roomManager } from '../game/RoomManager.js';
import db from '../db/db.js';
const mockDb = db as unknown as ReturnType<typeof vi.fn>;

describe('GET /api/rooms/:code/preview', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.resetAllMocks();
    app = Fastify({ logger: false });
    await app.register(roomsRoutes, { prefix: '/api' });
    await app.ready();
  });

  it('returns 404 when room not found', async () => {
    (roomManager.getRoom as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const res = await app.inject({ method: 'GET', url: '/api/rooms/abc123/preview' });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'Room not found' });
  });

  it('returns preview shape when room exists', async () => {
    (roomManager.getRoom as ReturnType<typeof vi.fn>).mockReturnValue({
      code: 'abc123',
      name: 'Test Room',
      status: 'LOBBY',
      maxPlayers: 6,
      selectedSetIds: [1, 2],
      players: [
        { nickname: 'Alice', isAfk: false },
        { nickname: 'Bob', isAfk: true },
      ],
    });
    const res = await app.inject({ method: 'GET', url: '/api/rooms/abc123/preview' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toEqual({
      code: 'abc123',
      name: 'Test Room',
      status: 'LOBBY',
      playerCount: 2,
      maxPlayers: 6,
      selectedSetIds: [1, 2],
      players: [
        { nickname: 'Alice', isAfk: false },
        { nickname: 'Bob', isAfk: true },
      ],
    });
  });

  it('normalises code to uppercase before lookup', async () => {
    (roomManager.getRoom as ReturnType<typeof vi.fn>).mockReturnValue(null);
    await app.inject({ method: 'GET', url: '/api/rooms/abc123/preview' });
    expect(roomManager.getRoom).toHaveBeenCalledWith('ABC123');
  });
});

describe('GET /api/users/:userId/public-profile', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.resetAllMocks();
    app = Fastify({ logger: false });
    await app.register(roomsRoutes, { prefix: '/api' });
    await app.ready();
  });

  it('returns 404 for unknown user', async () => {
    mockDb.mockReturnValue({
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(undefined),
    });
    const res = await app.inject({ method: 'GET', url: '/api/users/99999/public-profile' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for non-numeric userId', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/users/abc/public-profile' });
    expect(res.statusCode).toBe(400);
  });

  it('returns public profile with trophies for known user', async () => {
    mockDb.mockReturnValue({
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({
        id: 5,
        nickname: 'TestUser',
        avatar_url: 'https://example.com/avatar.png',
        trophies: 13,
      }),
    });
    const res = await app.inject({ method: 'GET', url: '/api/users/5/public-profile' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({
      userId: 5,
      nickname: 'TestUser',
      avatarUrl: 'https://example.com/avatar.png',
      trophies: 13,
    });
  });

  it('returns a DiceBear URL when user chose a dicebear avatar', async () => {
    mockDb.mockReturnValue({
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({
        id: 5,
        nickname: 'TestUser',
        avatar_url: 'https://example.com/real-photo.png',
        avatar_type: 'dicebear',
        dicebear_style: 'avataaars',
        dicebear_seed: 'můj seed',
        trophies: 0,
      }),
    });
    const res = await app.inject({ method: 'GET', url: '/api/users/5/public-profile' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.avatarUrl).toBe(`https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent('můj seed')}`);
  });

  it('falls back to nickname seed for dicebear avatar without seed', async () => {
    mockDb.mockReturnValue({
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({
        id: 5,
        nickname: 'TestUser',
        avatar_url: null,
        avatar_type: 'dicebear',
        dicebear_style: null,
        dicebear_seed: null,
        trophies: 0,
      }),
    });
    const res = await app.inject({ method: 'GET', url: '/api/users/5/public-profile' });
    expect(res.json().avatarUrl).toBe('https://api.dicebear.com/9.x/bottts/svg?seed=TestUser');
  });
});
