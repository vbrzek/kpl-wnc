import type { FastifyPluginAsync } from 'fastify';
import { roomManager } from '../game/RoomManager.js';

const roomsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/rooms/:code/preview', async (request, reply) => {
    const { code } = request.params as { code: string };
    const room = roomManager.getRoom(code.toLowerCase());
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
};

export default roomsRoutes;
