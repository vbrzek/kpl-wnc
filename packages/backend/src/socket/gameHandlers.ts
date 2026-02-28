import type { Server, Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@kpl/shared';
import { roomManager } from '../game/RoomManager.js';
import { socketToToken } from './socketState.js';
import { startNewRound, startJudgingPhase } from './roundUtils.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
const SKIP_DELAY_MS = 3_000;

function broadcastPublicRooms(io: IO) {
  io.to('lobby').emit('lobby:publicRoomsUpdate', roomManager.getPublicRooms());
}

export function registerGameHandlers(io: IO, socket: AppSocket) {

  // Player submits white cards during SELECTION
  socket.on('game:playCards', (cardIds) => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) return;

    const room = roomManager.getRoomByPlayerToken(playerToken);
    if (!room || room.status !== 'SELECTION') {
      socket.emit('game:error', 'Hra není ve fázi výběru karet.');
      return;
    }

    roomManager.updateActivity(room.code);

    const engine = roomManager.getGameEngine(room.code);
    if (!engine) { socket.emit('game:error', 'Herní engine nenalezen.'); return; }

    const playerId = roomManager.getPlayerIdByToken(playerToken)!;
    const result = engine.submitCards(playerId, cardIds);

    if ('error' in result) {
      socket.emit('game:error', result.error);
      return;
    }

    if (result.allSubmitted) {
      // Zruš round timer a přejdi do JUDGING
      roomManager.clearRoundTimer(room.code);
      startJudgingPhase(room, engine, io);
    } else {
      io.to(`room:${room.code}`).emit('lobby:stateUpdate', room);
    }
  });

  // Player retracts submitted cards to change selection
  socket.on('game:retractCards', () => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) return;

    const room = roomManager.getRoomByPlayerToken(playerToken);
    if (!room || room.status !== 'SELECTION') {
      socket.emit('game:error', 'Karty nelze vzít zpět mimo fázi výběru.');
      return;
    }

    const engine = roomManager.getGameEngine(room.code);
    if (!engine) { socket.emit('game:error', 'Herní engine nenalezen.'); return; }

    const playerId = roomManager.getPlayerIdByToken(playerToken)!;
    const result = engine.retractCards(playerId);

    if ('error' in result) {
      socket.emit('game:error', result.error);
      return;
    }

    io.to(`room:${room.code}`).emit('lobby:stateUpdate', room);
    socket.emit('game:handUpdate', engine.getPlayerHand(playerId));
  });

  // Card Czar selects winner during JUDGING
  socket.on('game:judgeSelect', (submissionId) => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) return;

    const room = roomManager.getRoomByPlayerToken(playerToken);
    if (!room || room.status !== 'JUDGING') {
      socket.emit('game:error', 'Hra není ve fázi souzení.');
      return;
    }

    const engine = roomManager.getGameEngine(room.code);
    if (!engine) { socket.emit('game:error', 'Herní engine nenalezen.'); return; }

    const czarId = roomManager.getPlayerIdByToken(playerToken)!;
    const result = engine.selectWinner(czarId, submissionId);

    if ('error' in result) {
      socket.emit('game:error', result.error);
      return;
    }

    // Zruš judging timer
    roomManager.clearJudgingTimer(room.code);
    roomManager.updateActivity(room.code);

    room.status = 'RESULTS';
    room.roundDeadline = null;
    io.to(`room:${room.code}`).emit('lobby:stateUpdate', room);
    io.to(`room:${room.code}`).emit('game:roundEnd', result);

    // Auto-win: zkontroluj jestli vítěz dosáhl targetScore
    const winnerId = result.winnerId;
    if (winnerId && result.scores[winnerId] >= room.targetScore) {
      const finishResult = roomManager.finishGame(room.code);
      if (!('error' in finishResult)) {
        io.to(`room:${room.code}`).emit('game:gameOver', finishResult.payload);
        for (const [sid, token] of socketToToken.entries()) {
          if (finishResult.kickedTokens.includes(token)) {
            const kickedSocket = io.sockets.sockets.get(sid);
            if (kickedSocket) kickedSocket.leave(`room:${room.code}`);
            socketToToken.delete(sid);
          }
        }
        io.to(`room:${room.code}`).emit('lobby:stateUpdate', finishResult.room);
        broadcastPublicRooms(io);
      }
      return; // nepokračuj na setTimeout pro startNewRound
    }

    // After 5s: start next round
    const roomCode = room.code;
    setTimeout(() => {
      const currentRoom = roomManager.getRoom(roomCode);
      const currentEngine = roomManager.getGameEngine(roomCode);
      if (!currentRoom || !currentEngine) return;
      if (currentRoom.status !== 'RESULTS') return; // host mohl ukončit hru

      try {
        startNewRound(currentRoom, currentEngine, io);
      } catch {
        io.to(`room:${roomCode}`).emit('game:error', 'Hra skončila — došly karty nebo nejsou aktivní hráči.');
      }
    }, 5_000);
  });

  // Player explicitly leaves during game
  socket.on('game:leave', () => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) return;

    const roomCode = roomManager.getRoomByPlayerToken(playerToken)?.code;
    roomManager.leaveRoom(playerToken);
    socketToToken.delete(socket.id);

    if (roomCode) {
      socket.leave(`room:${roomCode}`);
      const roomAfter = roomManager.getRoom(roomCode);
      if (roomAfter) {
        io.to(`room:${roomCode}`).emit('lobby:stateUpdate', roomAfter);
      }
    }
  });

  // Host ukončí hru (finishGame → LOBBY + game:gameOver)
  socket.on('lobby:endGame', (callback) => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) { callback({ error: 'Nejsi přihlášen.' }); return; }

    const room = roomManager.getRoomByPlayerToken(playerToken);
    if (!room) { callback({ error: 'Místnost nebyla nalezena.' }); return; }

    const playerId = roomManager.getPlayerIdByToken(playerToken)!;
    if (playerId !== room.hostId) { callback({ error: 'Pouze hostitel může ukončit hru.' }); return; }

    if (room.status === 'LOBBY') { callback({ error: 'Hra právě neprobíhá.' }); return; }

    const result = roomManager.finishGame(room.code);
    if ('error' in result) { callback(result); return; }

    // Emituj game:gameOver všem hráčům (včetně kicknutých — jsou stále v room:${code})
    io.to(`room:${room.code}`).emit('game:gameOver', result.payload);

    // Odstraň sockety kicknutých hráčů z room channel
    for (const [sid, token] of socketToToken.entries()) {
      if (result.kickedTokens.includes(token)) {
        const kickedSocket = io.sockets.sockets.get(sid);
        if (kickedSocket) kickedSocket.leave(`room:${room.code}`);
        socketToToken.delete(sid);
      }
    }

    // Informuj hosta o novém stavu místnosti (LOBBY)
    io.to(`room:${room.code}`).emit('lobby:stateUpdate', result.room);
    broadcastPublicRooms(io);
    callback({ ok: true });
  });

  // Card Czar manuálně přeskočí čekání na odevzdání (po vypršení timeru)
  socket.on('game:czarForceAdvance', () => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) return;

    const room = roomManager.getRoomByPlayerToken(playerToken);
    if (!room || room.status !== 'SELECTION') return;

    const engine = roomManager.getGameEngine(room.code);
    if (!engine) return;

    const playerId = roomManager.getPlayerIdByToken(playerToken)!;
    const player = room.players.find(p => p.id === playerId);
    if (!player?.isCardCzar) {
      socket.emit('game:error', 'Jen karetní král může přeskočit čekání.');
      return;
    }

    if (!room.roundDeadline || Date.now() < room.roundDeadline) {
      socket.emit('game:error', 'Časový limit ještě nevypršel.');
      return;
    }

    roomManager.clearRoundTimer(room.code);
    roomManager.updateActivity(room.code);

    // Označit nepřipravené hráče jako AFK
    for (const p of room.players) {
      if (!p.isAfk && !p.isCardCzar && !p.hasPlayed && p.socketId !== null) {
        p.isAfk = true;
      }
    }

    const submissions = engine.getAnonymousSubmissions();
    if (submissions.length > 0) {
      startJudgingPhase(room, engine, io);
    } else {
      room.roundDeadline = null;
      io.to(`room:${room.code}`).emit('lobby:stateUpdate', room);
      io.to(`room:${room.code}`).emit('game:roundSkipped');
      const roomCode = room.code;
      setTimeout(() => {
        const cr = roomManager.getRoom(roomCode);
        const ce = roomManager.getGameEngine(roomCode);
        if (!cr || !ce || cr.status !== 'SELECTION') return;
        try {
          startNewRound(cr, ce, io);
        } catch {
          io.to(`room:${roomCode}`).emit('game:error', 'Hra skončila — došly karty nebo nejsou aktivní hráči.');
        }
      }, SKIP_DELAY_MS);
    }
  });

  // Non-Czar hráč manuálně přeskočí hodnocení (po vypršení timeru)
  socket.on('game:skipCzarJudging', () => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) return;

    const room = roomManager.getRoomByPlayerToken(playerToken);
    if (!room || room.status !== 'JUDGING') return;

    const playerId = roomManager.getPlayerIdByToken(playerToken)!;
    const player = room.players.find(p => p.id === playerId);
    if (player?.isCardCzar) {
      socket.emit('game:error', 'Karetní král nemůže přeskočit vlastní hodnocení.');
      return;
    }

    if (!room.roundDeadline || Date.now() < room.roundDeadline) {
      socket.emit('game:error', 'Časový limit ještě nevypršel.');
      return;
    }

    roomManager.clearJudgingTimer(room.code);
    roomManager.updateActivity(room.code);

    const czar = room.players.find(p => p.isCardCzar);
    if (czar && !czar.isAfk) czar.isAfk = true;

    room.roundDeadline = null;
    io.to(`room:${room.code}`).emit('lobby:stateUpdate', room);
    io.to(`room:${room.code}`).emit('game:roundSkipped');

    const roomCode = room.code;
    setTimeout(() => {
      const cr = roomManager.getRoom(roomCode);
      const ce = roomManager.getGameEngine(roomCode);
      if (!cr || !ce || cr.status !== 'JUDGING') return;
      try {
        startNewRound(cr, ce, io);
      } catch {
        io.to(`room:${roomCode}`).emit('game:error', 'Hra skončila — došly karty nebo nejsou aktivní hráči.');
      }
    }, SKIP_DELAY_MS);
  });
}
