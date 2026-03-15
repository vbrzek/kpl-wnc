import type { Server, Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@kpl/shared';
import { extractUserIdFromCookieHeader } from '../auth/jwt.js';
import db from '../db/db.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export function registerFriendHandlers(io: IO, socket: AppSocket) {
  // Join user-specific room for targeted notifications
  const cookieHeader = socket.handshake.headers.cookie ?? '';
  const userId = extractUserIdFromCookieHeader(cookieHeader);
  if (userId) {
    socket.join(`user:${userId}`);
  }

  // Send game invite to a friend
  socket.on('friend:invite', async ({ friendUserId, roomCode }) => {
    if (!userId) return;

    const friendship = await db('friendships')
      .where({ status: 'accepted' })
      .andWhere(function () {
        this.where({ requester_id: userId, addressee_id: friendUserId })
          .orWhere({ requester_id: friendUserId, addressee_id: userId });
      })
      .first()
      .catch(() => null);
    if (!friendship) return;

    const inviter = await db('users').where({ id: userId }).select('nickname').first().catch(() => null);

    io.to(`user:${friendUserId}`).emit('friend:invite_received', {
      roomCode,
      roomName: roomCode,
      fromNick: inviter?.nickname ?? 'Někdo',
    });
  });
}
