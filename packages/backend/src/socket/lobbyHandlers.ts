import type { Server, Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, GameStateSync } from '@kpl/shared';
import { roomManager } from '../game/RoomManager.js';
import { socketToToken } from './socketState.js';
import db from '../db/db.js';
import { GameEngine } from '../game/GameEngine.js';
import { startNewRound, startJudgingPhase, broadcastPublicRooms, toPublicRoom } from './roundUtils.js';
import { CreateRoomSchema, JoinRoomSchema, UpdateSettingsSchema, KickPlayerSchema, UpdateNicknameSchema, validate } from './validation.js';
import { checkRateLimit, cleanupSocket } from './rateLimiter.js';
import type { BlackCard, WhiteCard } from '@kpl/shared';
import { eventLogger } from '../analytics/EventLogger.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

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
    if (!checkRateLimit(socket.id, 'lobby:create')) {
      callback({ error: 'Příliš mnoho požadavků. Zkus to za chvíli.' });
      return;
    }
    const data = validate(CreateRoomSchema, settings, callback);
    if (!data) return;
    const { room, playerToken } = roomManager.createRoom(data);

    // Attach socket to the host player
    const playerId = roomManager.getPlayerIdByToken(playerToken)!;
    const player = room.players.find(p => p.id === playerId);
    if (player) player.socketId = socket.id;

    socketToToken.set(socket.id, playerToken);
    socket.join(`room:${room.code}`);
    socket.leave('lobby');

    broadcastPublicRooms(io);
    eventLogger.logRoomCreated(room, data.nickname);
    callback({ room, playerToken, playerId });
  });

  // Join room (also handles reconnect when playerToken provided)
  socket.on('lobby:join', (input, callback) => {
    if (!checkRateLimit(socket.id, 'lobby:join')) {
      callback({ error: 'Příliš mnoho požadavků. Zkus to za chvíli.' });
      return;
    }
    const data = validate(JoinRoomSchema, input, callback);
    if (!data) return;
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

    // Po reconnectu do rozjeté hry pošli hráči jeho aktuální herní stav
    if (result.wasReconnect && (room.status === 'SELECTION' || room.status === 'JUDGING')) {
      const engine = roomManager.getGameEngine(room.code);
      if (engine?.currentBlackCard) {
        const czarPlayer = room.players.find(p => p.isCardCzar);
        const syncData: GameStateSync = {
          blackCard: engine.currentBlackCard,
          czarId: czarPlayer?.id ?? null,
          roundNumber: engine.roundNumber,
          hand: engine.getPlayerHand(playerId),
          submissions:
            room.status === 'JUDGING' && player?.isCardCzar
              ? engine.getAnonymousSubmissions()
              : [],
        };
        socket.emit('game:stateSync', syncData);
      }
    }

    // Notify rest of room
    io.to(`room:${room.code}`).emit('lobby:stateUpdate', toPublicRoom(room));
    broadcastPublicRooms(io);
    callback({ room, playerToken, playerId });
  });

  // Leave room
  socket.on('lobby:leave', () => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) return;

    const roomCode = roomManager.getRoomByPlayerToken(playerToken)?.code;
    roomManager.leaveRoom(playerToken);
    socketToToken.delete(socket.id);

    if (roomCode) {
      socket.leave(`room:${roomCode}`);
      const roomAfter = roomManager.getRoom(roomCode);
      if (roomAfter) {
        io.to(`room:${roomCode}`).emit('lobby:stateUpdate', toPublicRoom(roomAfter));
      }
    }

    broadcastPublicRooms(io);
  });

  // Update settings (host only)
  socket.on('lobby:updateSettings', (input, callback) => {
    if (!checkRateLimit(socket.id, 'lobby:updateSettings')) {
      callback({ error: 'Příliš mnoho požadavků. Zkus to za chvíli.' });
      return;
    }
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) { callback({ error: 'Nejsi přihlášen' }); return; }

    const data = validate(UpdateSettingsSchema, input, callback);
    if (!data) return;
    const result = roomManager.updateSettings(playerToken, data);
    if ('error' in result) { callback(result); return; }

    io.to(`room:${result.room.code}`).emit('lobby:stateUpdate', toPublicRoom(result.room));
    broadcastPublicRooms(io);
    const host = result.room.players.find(p => p.id === result.room.hostId);
    eventLogger.logSettingsUpdated(result.room, host?.nickname ?? 'unknown');
    callback({ room: result.room });
  });

  // Kick player (host only)
  socket.on('lobby:kickPlayer', (targetPlayerId, callback) => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) { callback({ error: 'Nejsi přihlášen' }); return; }

    const validId = validate(KickPlayerSchema, targetPlayerId, callback);
    if (!validId) return;
    const result = roomManager.kickPlayer(playerToken, validId);
    if ('error' in result) { callback(result); return; }

    // Notify kicked player's socket
    for (const [sid, token] of socketToToken.entries()) {
      if (token === result.kickedPlayerToken) {
        io.to(sid).emit('lobby:kicked');
        socketToToken.delete(sid);
        // Remove kicked player's socket from the room channel
        const kickedSocket = io.sockets.sockets.get(sid);
        if (kickedSocket) kickedSocket.leave(`room:${result.room.code}`);
        break;
      }
    }

    io.to(`room:${result.room.code}`).emit('lobby:stateUpdate', toPublicRoom(result.room));
    broadcastPublicRooms(io);
    callback({ ok: true });
  });

  // Start game (host only)
  socket.on('lobby:startGame', async (callback) => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) { callback({ error: 'Nejsi přihlášen' }); return; }

    const result = roomManager.startGame(playerToken);
    if ('error' in result) { callback(result); return; }

    const room = result.room;

    // Load cards from DB for selected sets
    let blackCards: BlackCard[];
    let whiteCards: WhiteCard[];
    try {
      [blackCards, whiteCards] = await Promise.all([
        db('black_cards')
          .whereIn('card_set_id', room.selectedSetIds)
          .select<BlackCard[]>('id', 'text', 'pick'),
        db('white_cards')
          .whereIn('card_set_id', room.selectedSetIds)
          .select<WhiteCard[]>('id', 'text'),
      ]);
    } catch {
      room.status = 'LOBBY';
      callback({ error: 'Chyba při načítání karet.' });
      return;
    }

    // Init GameEngine
    let engine: GameEngine;
    try {
      engine = new GameEngine(room.players, blackCards, whiteCards, room.specialRules, room.hostId);
      roomManager.setGameEngine(room.code, engine);
      roomManager.updateActivity(room.code);
    } catch {
      room.status = 'LOBBY';
      callback({ error: 'Chyba při inicializaci hry — zkontroluj sady karet.' });
      return;
    }

    broadcastPublicRooms(io);
    callback({ ok: true });

    // Spusť první kolo (broadcast stateUpdate + game:roundStart per player + timer)
    try {
      startNewRound(room, engine, io);
      eventLogger.logGameStarted(room);
    } catch {
      io.to(`room:${room.code}`).emit('game:error', 'Chyba při inicializaci hry — zkontroluj sady karet.');
    }
  });

  // Update nickname (while in room)
  socket.on('lobby:updateNickname', (newNickname, callback) => {
    if (!checkRateLimit(socket.id, 'lobby:updateNickname')) {
      callback({ error: 'Příliš mnoho požadavků. Zkus to za chvíli.' });
      return;
    }
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) { callback({ error: 'Nejsi přihlášen' }); return; }

    const validated = validate(UpdateNicknameSchema, newNickname, callback);
    if (!validated) return;

    const result = roomManager.updateNickname(playerToken, validated);
    if ('error' in result) { callback(result); return; }

    io.to(`room:${result.room.code}`).emit('lobby:stateUpdate', toPublicRoom(result.room));
    callback({ ok: true });
  });

  // Disconnect — start AFK timer, emit state update
  socket.on('disconnect', () => {
    cleanupSocket(socket.id);
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) return;

    socketToToken.delete(socket.id);
    roomManager.handleDisconnect(playerToken);

    const room = roomManager.getRoomByPlayerToken(playerToken);
    if (room) {
      // Immediate emit — player.socketId is now null
      io.to(`room:${room.code}`).emit('lobby:stateUpdate', toPublicRoom(room));

      // Emit again after AFK timer fires (31s = 1s after the 30s AFK timer)
      const roomCode = room.code;
      setTimeout(() => {
        const updated = roomManager.getRoom(roomCode);
        if (!updated) return;

        io.to(`room:${roomCode}`).emit('lobby:stateUpdate', toPublicRoom(updated));

        // If in SELECTION, check if remaining active players have all submitted
        // (triggered when a non-submitted player goes AFK)
        if (updated.status === 'SELECTION') {
          const engine = roomManager.getGameEngine(roomCode);
          if (engine) {
            const nonCzarActive = updated.players.filter(p => !p.isAfk && !p.isCardCzar);
            const allSubmitted = nonCzarActive.length > 0 && nonCzarActive.every(p => p.hasPlayed);
            if (allSubmitted) {
              roomManager.clearRoundTimer(roomCode);
              startJudgingPhase(updated, engine, io);
            }
          }
        }
      }, 31_000);
    }

    broadcastPublicRooms(io);
  });
}
