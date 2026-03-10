import type { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, GameRoom } from '@kpl/shared';
import { roomManager } from '../game/RoomManager.js';
import type { GameEngine } from '../game/GameEngine.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

const SELECTION_TIMEOUT_MS = 45_000;
const JUDGING_TIMEOUT_MS = 60_000;

// Přechod do fáze JUDGING + start časovače pro rozsudek cara
export function startJudgingPhase(room: GameRoom, engine: GameEngine, io: IO): void {
  const roomCode = room.code;
  room.status = 'JUDGING';
  room.roundDeadline = Date.now() + JUDGING_TIMEOUT_MS;
  io.to(`room:${roomCode}`).emit('lobby:stateUpdate', toPublicRoom(room));
  io.to(`room:${roomCode}`).emit('game:judging', engine.getAnonymousSubmissions());

  roomManager.setJudgingTimer(roomCode, () => {
    // Timer vypršel — čeká se na game:skipCzarJudging od non-Czar hráče
  }, JUDGING_TIMEOUT_MS);
}

// Spuštění nového kola: un-AFK připojené hráče, zavolej startRound, rozešli karty, spusť timer
export function startNewRound(room: GameRoom, engine: GameEngine, io: IO): void {
  const roomCode = room.code;

  // Zruš stávající timery
  roomManager.clearAllGameTimers(roomCode);

  // Un-AFK hráče, kteří jsou stále připojeni (akce-AFK je jen per-kolo)
  for (const player of room.players) {
    if (player.isAfk && roomManager.getSocketId(player.id) !== undefined) {
      player.isAfk = false;
    }
  }

  const { czarId, blackCardCandidates } = engine.startRound();
  room.status = 'SELECTION';
  room.roundNumber = engine.roundNumber;

  // Wheaton's Law: czar picks black card first
  if (blackCardCandidates) {
    room.currentBlackCard = null;
    room.blackCardCandidates = blackCardCandidates;
    room.roundDeadline = null;
    io.to(`room:${roomCode}`).emit('lobby:stateUpdate', toPublicRoom(room));
    // Send candidates only to czar
    const czarSocketId = roomManager.getSocketId(czarId);
    if (czarSocketId) {
      const czarSocket = io.sockets.sockets.get(czarSocketId);
      if (czarSocket) czarSocket.emit('game:blackCardCandidates', blackCardCandidates);
    }
    return; // roundStart sent after chooseBlackCard
  }

  // Normal flow
  room.currentBlackCard = engine.currentBlackCard;
  room.blackCardCandidates = null;
  room.roundDeadline = Date.now() + SELECTION_TIMEOUT_MS;

  io.to(`room:${roomCode}`).emit('lobby:stateUpdate', toPublicRoom(room));

  for (const player of room.players) {
    const sid = roomManager.getSocketId(player.id);
    if (!sid) continue;
    const playerSocket = io.sockets.sockets.get(sid);
    if (playerSocket) {
      playerSocket.emit('game:roundStart', {
        blackCard: engine.currentBlackCard!,
        hand: engine.getPlayerHand(player.id),
        czarId,
        roundNumber: engine.roundNumber,
      });
    }
  }

  // Spusť 45s timer pro výběr karet
  roomManager.setRoundTimer(roomCode, () => {
    // Timer vypršel — čeká se na game:czarForceAdvance od Card Czara
  }, SELECTION_TIMEOUT_MS);
}

// Called after czar chooses black card (Wheaton's Law) — sends game:roundStart to all
export function finalizeRoundStart(room: GameRoom, engine: GameEngine, io: IO): void {
  const roomCode = room.code;
  const czarId = room.players.find(p => p.isCardCzar)?.id ?? '';
  room.blackCardCandidates = null;
  room.currentBlackCard = engine.currentBlackCard;
  room.roundDeadline = Date.now() + SELECTION_TIMEOUT_MS;

  io.to(`room:${roomCode}`).emit('lobby:stateUpdate', toPublicRoom(room));

  for (const player of room.players) {
    const sid = roomManager.getSocketId(player.id);
    if (!sid) continue;
    const playerSocket = io.sockets.sockets.get(sid);
    if (playerSocket) {
      playerSocket.emit('game:roundStart', {
        blackCard: engine.currentBlackCard!,
        hand: engine.getPlayerHand(player.id),
        czarId,
        roundNumber: engine.roundNumber,
      });
    }
  }

  roomManager.setRoundTimer(roomCode, () => {
    // Timer vypršel — čeká se na game:czarForceAdvance od Card Czara
  }, SELECTION_TIMEOUT_MS);
}

export function broadcastPublicRooms(io: IO): void {
  io.to('lobby').emit('lobby:publicRoomsUpdate', roomManager.getPublicRooms());
}

/** Pass-through — kept for forward-compatibility if server-only fields are added later. */
export function toPublicRoom(room: GameRoom): GameRoom {
  return room;
}
