import type { FastifyPluginAsync } from 'fastify';
import { roomManager } from '../game/RoomManager.js';
import db from '../db/db.js';

const roomsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/rooms/:code/preview', async (request, reply) => {
    const { code } = request.params as { code: string };
    const room = roomManager.getRoom(code.toUpperCase());
    if (!room) {
      return reply.status(404).send({ error: 'Room not found' });
    }
    return {
      code: room.code,
      name: room.name,
      status: room.status,
      playerCount: room.players.length,
      maxPlayers: room.maxPlayers,
      players: room.players.map(p => ({ nickname: p.nickname, isAfk: p.isAfk })),
      selectedSetIds: room.selectedSetIds,
    };
  });

  fastify.get('/users/:userId/public-profile', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const id = parseInt(userId, 10);
    if (isNaN(id)) return reply.status(400).send({ error: 'Invalid userId' });

    const row = await db('users')
      .leftJoin('user_trophies', 'users.id', 'user_trophies.user_id')
      .where('users.id', id)
      .select('users.id', 'users.nickname', 'users.avatar_url', db.raw('COALESCE(user_trophies.trophies, 0) as trophies'))
      .first();

    if (!row) return reply.status(404).send({ error: 'User not found' });

    return {
      userId: row.id,
      nickname: row.nickname,
      avatarUrl: row.avatar_url,
      trophies: row.trophies,
    };
  });
};

export default roomsRoutes;
