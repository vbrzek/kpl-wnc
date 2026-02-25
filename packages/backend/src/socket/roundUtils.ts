import type { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, GameRoom } from '@kpl/shared';
import { roomManager } from '../game/RoomManager.js';
import type { GameEngine } from '../game/GameEngine.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

const SELECTION_TIMEOUT_MS = 45_000;
const JUDGING_TIMEOUT_MS = 60_000;
const SKIP_DELAY_MS = 3_000;

// Přechod do fáze JUDGING + start časovače pro rozsudek cara
export function startJudgingPhase(room: GameRoom, engine: GameEngine, io: IO): void {
  const roomCode = room.code;
  room.status = 'JUDGING';
  room.roundDeadline = Date.now() + JUDGING_TIMEOUT_MS;
  io.to(`room:${roomCode}`).emit('lobby:stateUpdate', room);
  io.to(`room:${roomCode}`).emit('game:judging', engine.getAnonymousSubmissions());

  roomManager.setJudgingTimer(roomCode, () => {
    const r = roomManager.getRoom(roomCode);
    const e = roomManager.getGameEngine(roomCode);
    if (!r || !e || r.status !== 'JUDGING') return;

    // Označit cara jako AFK
    const czar = r.players.find(p => p.isCardCzar);
    if (czar) czar.isAfk = true;

    r.roundDeadline = null;
    io.to(`room:${roomCode}`).emit('lobby:stateUpdate', r);
    io.to(`room:${roomCode}`).emit('game:roundSkipped');

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
    const r = roomManager.getRoom(roomCode);
    const e = roomManager.getGameEngine(roomCode);
    if (!r || !e || r.status !== 'SELECTION') return;

    // Označit připojené hráče, kteří neodeslali, jako AFK
    for (const player of r.players) {
      if (!player.isAfk && !player.isCardCzar && !player.hasPlayed && player.socketId !== null) {
        player.isAfk = true;
      }
    }

    const submissions = e.getAnonymousSubmissions();
    if (submissions.length > 0) {
      // Alespoň jedna odezva — přejdeme do JUDGING
      startJudgingPhase(r, e, io);
    } else {
      // Žádné odezvy — přeskoč kolo
      r.roundDeadline = null;
      io.to(`room:${roomCode}`).emit('lobby:stateUpdate', r);
      io.to(`room:${roomCode}`).emit('game:roundSkipped');

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
  }, SELECTION_TIMEOUT_MS);
}
