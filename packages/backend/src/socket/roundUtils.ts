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
  io.to(`room:${roomCode}`).emit('lobby:stateUpdate', room);
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
    if (player.isAfk && player.socketId !== null) {
      player.isAfk = false;
    }
  }

  const { czarId } = engine.startRound();
  room.status = 'SELECTION';
  room.currentBlackCard = engine.currentBlackCard;
  room.roundNumber = engine.roundNumber;
  room.roundDeadline = Date.now() + SELECTION_TIMEOUT_MS;

  io.to(`room:${roomCode}`).emit('lobby:stateUpdate', room);

  for (const player of room.players) {
    if (!player.socketId) continue;
    const playerSocket = io.sockets.sockets.get(player.socketId);
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
