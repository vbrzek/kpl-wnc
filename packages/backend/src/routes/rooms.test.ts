import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import roomsRoutes from './rooms.js';

vi.mock('../game/RoomManager.js', () => ({
  roomManager: {
    getRoom: vi.fn(),
  },
}));

import { roomManager } from '../game/RoomManager.js';

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
    await app.inject({ method: 'GET', url: '/api/rooms/ABC123/preview' });
    expect(roomManager.getRoom).toHaveBeenCalledWith('ABC123');
  });
});
