import type { FastifyPluginAsync } from 'fastify';
import type { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@kpl/shared';
import { z } from 'zod';
import db from '../db/db.js';
import { verifyJwt } from '../auth/middleware.js';

const SendRequestSchema = z.object({ addresseeId: z.number().int().positive() });

interface FriendsRouteOpts {
  io?: Server<ClientToServerEvents, ServerToClientEvents>;
}

const friendsRoutes: FastifyPluginAsync<FriendsRouteOpts> = async (fastify, opts) => {
  const io = opts.io;
  fastify.decorateRequest('jwtUser', undefined);

  // GET /friends — accepted friends
  fastify.get('/friends', { preHandler: verifyJwt }, async (request) => {
    const { userId } = request.jwtUser!;
    return db('friendships as f')
      .join('users as u', function () {
        this.on(db.raw('CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END = u.id', [userId]));
      })
      .where('f.status', 'accepted')
      .andWhere(function () {
        this.where('f.requester_id', userId).orWhere('f.addressee_id', userId);
      })
      .select<Array<{ friendshipId: number; userId: number; nickname: string; avatarUrl: string | null }>>(
        'f.id as friendshipId',
        'u.id as userId',
        'u.nickname',
        'u.avatar_url as avatarUrl',
      );
  });

  // GET /friends/requests — incoming pending requests
  fastify.get('/friends/requests', { preHandler: verifyJwt }, async (request) => {
    const { userId } = request.jwtUser!;
    return db('friendships as f')
      .join('users as u', 'u.id', 'f.requester_id')
      .where('f.status', 'pending')
      .andWhere('f.addressee_id', userId)
      .select<Array<{ friendshipId: number; fromUserId: number; fromNick: string; fromAvatarUrl: string | null }>>(
        'f.id as friendshipId',
        'u.id as fromUserId',
        'u.nickname as fromNick',
        'u.avatar_url as fromAvatarUrl',
      );
  });

  // POST /friends/request
  fastify.post('/friends/request', { preHandler: verifyJwt }, async (request, reply) => {
    const { userId } = request.jwtUser!;
    const parsed = SendRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid addresseeId' });

    const { addresseeId } = parsed.data;
    if (addresseeId === userId) return reply.status(400).send({ error: 'Cannot add yourself' });

    const existing = await db('friendships')
      .where(function () {
        this.where({ requester_id: userId, addressee_id: addresseeId })
          .orWhere({ requester_id: addresseeId, addressee_id: userId });
      })
      .first();
    if (existing) return reply.status(409).send({ error: 'Already friends or request pending' });

    const [friendshipId] = await db('friendships').insert({ requester_id: userId, addressee_id: addresseeId });

    // Notify addressee in real-time if online
    if (io) {
      const requester = await db('users').where({ id: userId }).select('nickname', 'avatar_url').first().catch(() => null);
      io.to(`user:${addresseeId}`).emit('friend:request_received', {
        friendshipId,
        fromNick: requester?.nickname ?? 'Někdo',
        fromAvatarUrl: requester?.avatar_url ?? null,
      });
    }

    return reply.status(201).send({ friendshipId });
  });

  // POST /friends/accept/:id
  fastify.post<{ Params: { id: string } }>('/friends/accept/:id', { preHandler: verifyJwt }, async (request, reply) => {
    const { userId } = request.jwtUser!;
    const id = Number(request.params.id);
    const row = await db('friendships')
      .where({ id })
      .andWhere('addressee_id', userId)
      .first();
    if (!row) return reply.status(404).send({ error: 'Request not found' });

    await db('friendships').where({ id }).update({ status: 'accepted' });

    if (io) {
      const accepter = await db('users').where({ id: userId }).select('nickname', 'avatar_url').first().catch(() => null);
      io.to(`user:${row.requester_id}`).emit('friend:request_accepted', {
        friendshipId: id,
        byNick: accepter?.nickname ?? 'Někdo',
        byAvatarUrl: accepter?.avatar_url ?? null,
      });
    }

    return { ok: true };
  });

  // DELETE /friends/:id — reject or remove
  fastify.delete<{ Params: { id: string } }>('/friends/:id', { preHandler: verifyJwt }, async (request, reply) => {
    const { userId } = request.jwtUser!;
    const id = Number(request.params.id);
    const row = await db('friendships')
      .where({ id })
      .andWhere(function () {
        this.where('requester_id', userId).orWhere('addressee_id', userId);
      })
      .first();
    if (!row) return reply.status(404).send({ error: 'Not found' });

    await db('friendships').where({ id }).delete();
    return { ok: true };
  });

  // GET /users/:id/public — public profile (no auth)
  fastify.get<{ Params: { id: string } }>('/users/:id/public', async (request, reply) => {
    const id = Number(request.params.id);
    const user = await db('users')
      .where({ id })
      .select('id', 'nickname', 'avatar_url')
      .first();
    if (!user) return reply.status(404).send({ error: 'User not found' });
    return { id: user.id, nickname: user.nickname, avatarUrl: user.avatar_url };
  });
};

export default friendsRoutes;
