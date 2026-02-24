import type { Server, Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@kpl/shared';
import { roomManager } from '../game/RoomManager.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

// Maps socket.id → playerToken (cleared on disconnect)
const socketToToken = new Map<string, string>();

function broadcastPublicRooms(io: IO) {
  io.to('lobby').emit('lobby:publicRoomsUpdate', roomManager.getPublicRooms());
}

export function registerLobbyHandlers(io: IO, socket: AppSocket) {

  // Subscribe to public rooms list (HomeView)
  socket.on('lobby:subscribePublic', () => {
    socket.join('lobby');
    socket.emit('lobby:publicRoomsUpdate', roomManager.getPublicRooms());
  });

  socket.on('lobby:unsubscribePublic', () => {
    socket.leave('lobby');
  });

  // Create room
  socket.on('lobby:create', (settings, callback) => {
    const { room, playerToken } = roomManager.createRoom(settings);

    // Attach socket to the host player
    const playerId = roomManager.getPlayerIdByToken(playerToken)!;
    const player = room.players.find(p => p.id === playerId);
    if (player) player.socketId = socket.id;

    socketToToken.set(socket.id, playerToken);
    socket.join(`room:${room.code}`);
    socket.leave('lobby');

    broadcastPublicRooms(io);
    callback({ room, playerToken, playerId });
  });

  // Join room (also handles reconnect when playerToken provided)
  socket.on('lobby:join', (data, callback) => {
    const result = roomManager.joinRoom(data.code, data.nickname, data.playerToken);

    if ('error' in result) {
      callback(result);
      return;
    }

    const { room, playerToken } = result;

    // Attach socket to player (reconnect or new join)
    const playerId = roomManager.getPlayerIdByToken(playerToken)!;
    const player = room.players.find(p => p.id === playerId);
    if (player) player.socketId = socket.id;

    socketToToken.set(socket.id, playerToken);
    socket.join(`room:${room.code}`);
    socket.leave('lobby');

    // Notify rest of room
    io.to(`room:${room.code}`).emit('lobby:stateUpdate', room);
    broadcastPublicRooms(io);
    callback({ room, playerToken, playerId });
  });

  // Leave room
  socket.on('lobby:leave', () => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) return;

    const roomBefore = roomManager.getRoomByPlayerToken(playerToken);
    const roomCode = roomBefore?.code;

    roomManager.leaveRoom(playerToken);
    socketToToken.delete(socket.id);
    if (roomCode) socket.leave(`room:${roomCode}`);

    const roomAfter = roomManager.getRoom(roomCode ?? '');
    if (roomAfter) {
      io.to(`room:${roomCode}`).emit('lobby:stateUpdate', roomAfter);
    }
    broadcastPublicRooms(io);
  });

  // Update settings (host only)
  socket.on('lobby:updateSettings', (settings, callback) => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) { callback({ error: 'Nejsi přihlášen' }); return; }

    const result = roomManager.updateSettings(playerToken, settings);
    if ('error' in result) { callback(result); return; }

    io.to(`room:${result.room.code}`).emit('lobby:stateUpdate', result.room);
    broadcastPublicRooms(io);
    callback({ room: result.room });
  });

  // Kick player (host only)
  socket.on('lobby:kickPlayer', (targetPlayerId, callback) => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) { callback({ error: 'Nejsi přihlášen' }); return; }

    const result = roomManager.kickPlayer(playerToken, targetPlayerId);
    if ('error' in result) { callback(result); return; }

    // Notify kicked player's socket
    for (const [sid, token] of socketToToken.entries()) {
      if (token === result.kickedPlayerToken) {
        io.to(sid).emit('lobby:kicked');
        socketToToken.delete(sid);
        break;
      }
    }

    io.to(`room:${result.room.code}`).emit('lobby:stateUpdate', result.room);
    broadcastPublicRooms(io);
    callback({ ok: true });
  });

  // Start game (host only)
  socket.on('lobby:startGame', (callback) => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) { callback({ error: 'Nejsi přihlášen' }); return; }

    const result = roomManager.startGame(playerToken);
    if ('error' in result) { callback(result); return; }

    io.to(`room:${result.room.code}`).emit('lobby:stateUpdate', result.room);
    broadcastPublicRooms(io);
    callback({ ok: true });
  });

  // Disconnect — start AFK timer, emit state update
  socket.on('disconnect', () => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) return;

    socketToToken.delete(socket.id);
    roomManager.handleDisconnect(playerToken);

    const room = roomManager.getRoomByPlayerToken(playerToken);
    if (room) {
      // Immediate emit — player.socketId is now null
      io.to(`room:${room.code}`).emit('lobby:stateUpdate', room);

      // Emit again after AFK timer fires (31s = 1s after the 30s AFK timer)
      const roomCode = room.code;
      setTimeout(() => {
        const updated = roomManager.getRoom(roomCode);
        if (updated) {
          io.to(`room:${roomCode}`).emit('lobby:stateUpdate', updated);
        }
      }, 31_000);
    }

    broadcastPublicRooms(io);
  });
}
