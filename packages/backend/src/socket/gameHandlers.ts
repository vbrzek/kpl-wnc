import type { Server, Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, GameRoom, RoundResult } from '@kpl/shared';
import { roomManager } from '../game/RoomManager.js';
import type { GameEngine } from '../game/GameEngine.js';
import { socketToToken } from './socketState.js';
import { startNewRound, startJudgingPhase, finalizeRoundStart, broadcastPublicRooms, toPublicRoom } from './roundUtils.js';
import { PlayCardsSchema, JudgeSelectSchema, VoteSchema, ChooseBlackCardSchema, PlaceBetSchema, validate } from './validation.js';
import { checkRateLimit } from './rateLimiter.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
const SKIP_DELAY_MS = 3_000;

function isWinConditionMet(room: GameRoom, engine: GameEngine, result: RoundResult): boolean {
  const allWinnerIds = result.winnerIds && result.winnerIds.length > 0
    ? result.winnerIds
    : (result.winnerId ? [result.winnerId] : []);

  switch (room.winCondition ?? 'score') {
    case 'score':
      return allWinnerIds.some(
        wid => wid !== 'rando_cardrissian' && (result.scores[wid] ?? 0) >= room.targetScore
      );
    case 'rounds':
      return engine.roundNumber >= room.targetRounds;
    case 'time':
      return !!(room.gameStartedAt && Date.now() - room.gameStartedAt >= room.gameTimeLimit * 60_000);
  }
}

function handlePostRound(room: GameRoom, engine: GameEngine, result: RoundResult, io: IO): void {
  if (isWinConditionMet(room, engine, result)) {
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
      io.to(`room:${room.code}`).emit('lobby:stateUpdate', toPublicRoom(finishResult.room));
      broadcastPublicRooms(io);
    }
    return;
  }

  const roomCode = room.code;
  setTimeout(() => {
    const currentRoom = roomManager.getRoom(roomCode);
    const currentEngine = roomManager.getGameEngine(roomCode);
    if (!currentRoom || !currentEngine) return;
    if (currentRoom.status !== 'RESULTS') return;
    try {
      startNewRound(currentRoom, currentEngine, io);
    } catch {
      io.to(`room:${roomCode}`).emit('game:error', 'Hra skončila — došly karty nebo nejsou aktivní hráči.');
    }
  }, 5_000);
}

export function registerGameHandlers(io: IO, socket: AppSocket) {

  // Player submits white cards during SELECTION
  socket.on('game:playCards', (data) => {
    if (!checkRateLimit(socket.id, 'game:playCards')) {
      socket.emit('game:error', 'Příliš mnoho požadavků. Zkus to za chvíli.');
      return;
    }
    const parsed = validate(PlayCardsSchema, data);
    if (!parsed) { socket.emit('game:error', 'Neplatná data karet.'); return; }

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
    const result = engine.submitCards(playerId, parsed.cardIds, parsed.blankCardText);

    if ('error' in result) {
      socket.emit('game:error', result.error);
      return;
    }

    const subId = engine.getSubmissionId(playerId);
    if (subId) socket.emit('game:mySubmissionId', subId);

    if (result.allSubmitted) {
      roomManager.clearRoundTimer(room.code);
      startJudgingPhase(room, engine, io);
    } else {
      io.to(`room:${room.code}`).emit('lobby:stateUpdate', toPublicRoom(room));
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

    io.to(`room:${room.code}`).emit('lobby:stateUpdate', toPublicRoom(room));
    socket.emit('game:handUpdate', engine.getPlayerHand(playerId));
  });

  // Player trades entire hand for 1 point (once per round, SELECTION only)
  socket.on('game:tradeCards', () => {
    if (!checkRateLimit(socket.id, 'game:tradeCards')) {
      socket.emit('game:error', 'Příliš mnoho požadavků. Zkus to za chvíli.');
      return;
    }
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) return;

    const room = roomManager.getRoomByPlayerToken(playerToken);
    if (!room || room.status !== 'SELECTION') {
      socket.emit('game:error', 'Výměna karet je možná jen ve fázi výběru karet.');
      return;
    }

    const engine = roomManager.getGameEngine(room.code);
    if (!engine) { socket.emit('game:error', 'Herní engine nenalezen.'); return; }

    const playerId = roomManager.getPlayerIdByToken(playerToken)!;
    const result = engine.tradeHand(playerId);

    if ('error' in result) {
      socket.emit('game:error', result.error);
      return;
    }

    roomManager.updateActivity(room.code);
    io.to(`room:${room.code}`).emit('lobby:stateUpdate', toPublicRoom(room));
    socket.emit('game:handUpdate', result.newHand);
  });

  // Card Czar selects winner during JUDGING
  socket.on('game:judgeSelect', (submissionId) => {
    if (!checkRateLimit(socket.id, 'game:judgeSelect')) {
      socket.emit('game:error', 'Příliš mnoho požadavků. Zkus to za chvíli.');
      return;
    }
    const id = validate(JudgeSelectSchema, submissionId);
    if (!id) { socket.emit('game:error', 'Neplatné submissionId.'); return; }

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
    const result = engine.selectWinner(czarId, id);

    if ('error' in result) {
      socket.emit('game:error', result.error);
      return;
    }

    // Zruš judging timer
    roomManager.clearJudgingTimer(room.code);
    roomManager.updateActivity(room.code);

    room.status = 'RESULTS';
    room.roundDeadline = null;
    io.to(`room:${room.code}`).emit('lobby:stateUpdate', toPublicRoom(room));
    io.to(`room:${room.code}`).emit('game:roundEnd', result);

    handlePostRound(room, engine, result, io);
  });

  // czar_is_dead: player votes for a submission
  socket.on('game:vote', (submissionId) => {
    if (!checkRateLimit(socket.id, 'game:vote')) {
      socket.emit('game:error', 'Příliš mnoho požadavků. Zkus to za chvíli.');
      return;
    }
    const id = validate(VoteSchema, submissionId);
    if (!id) { socket.emit('game:error', 'Neplatné submissionId.'); return; }

    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) return;

    const room = roomManager.getRoomByPlayerToken(playerToken);
    if (!room || room.status !== 'JUDGING') {
      socket.emit('game:error', 'Hra není ve fázi hlasování.');
      return;
    }

    const engine = roomManager.getGameEngine(room.code);
    if (!engine || engine.getCzarMode() !== 'czar_is_dead') {
      socket.emit('game:error', 'Hlasování není v tomto módu dostupné.');
      return;
    }

    const playerId = roomManager.getPlayerIdByToken(playerToken)!;
    const result = engine.castVote(playerId, id);

    if ('error' in result) {
      socket.emit('game:error', result.error);
      return;
    }

    roomManager.updateActivity(room.code);

    // Broadcast vote count update
    const activePlayers = room.players.filter(p => !p.isAfk);
    const votedCount = activePlayers.filter(p => engine.hasVoted(p.id)).length;
    io.to(`room:${room.code}`).emit('game:voteUpdate', {
      votedCount,
      totalVoters: activePlayers.length,
    });

    if (result.allVoted) {
      const roundResult = engine.resolveVotes();
      roomManager.clearJudgingTimer(room.code);

      room.status = 'RESULTS';
      room.roundDeadline = null;
      io.to(`room:${room.code}`).emit('lobby:stateUpdate', toPublicRoom(room));
      io.to(`room:${room.code}`).emit('game:roundEnd', roundResult);

      handlePostRound(room, engine, roundResult, io);
    }
  });

  // czar_is_dead: skip voting after deadline
  socket.on('game:skipVoting', () => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) return;

    const room = roomManager.getRoomByPlayerToken(playerToken);
    if (!room || room.status !== 'JUDGING') return;

    const engine = roomManager.getGameEngine(room.code);
    if (!engine || engine.getCzarMode() !== 'czar_is_dead') return;

    if (!room.roundDeadline || Date.now() < room.roundDeadline) {
      socket.emit('game:error', 'Časový limit ještě nevypršel.');
      return;
    }

    const roundResult = engine.resolveVotes();
    roomManager.clearJudgingTimer(room.code);
    roomManager.updateActivity(room.code);

    room.status = 'RESULTS';
    room.roundDeadline = null;
    io.to(`room:${room.code}`).emit('lobby:stateUpdate', toPublicRoom(room));
    io.to(`room:${room.code}`).emit('game:roundEnd', roundResult);

    handlePostRound(room, engine, roundResult, io);
  });

  // Player explicitly leaves during game
  socket.on('game:leave', () => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) return;

    const roomCode = roomManager.getRoomByPlayerToken(playerToken)?.code;
    roomManager.leaveRoom(playerToken);
    socketToToken.delete(socket.id);
    roomManager.clearSocketIdByToken(playerToken);

    if (roomCode) {
      socket.leave(`room:${roomCode}`);
      const roomAfter = roomManager.getRoom(roomCode);
      if (roomAfter) {
        io.to(`room:${roomCode}`).emit('lobby:stateUpdate', toPublicRoom(roomAfter));
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
    io.to(`room:${room.code}`).emit('lobby:stateUpdate', toPublicRoom(result.room));
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
      if (!p.isAfk && !p.isCardCzar && !p.hasPlayed && roomManager.getSocketId(p.id) !== undefined) {
        p.isAfk = true;
      }
    }

    const submissions = engine.getAnonymousSubmissions();
    if (submissions.length > 0) {
      startJudgingPhase(room, engine, io);
    } else {
      room.roundDeadline = null;
      io.to(`room:${room.code}`).emit('lobby:stateUpdate', toPublicRoom(room));
      io.to(`room:${room.code}`).emit('game:roundSkipped');
      const roomCode = room.code;
      setTimeout(() => {
        const cr = roomManager.getRoom(roomCode);
        const ce = roomManager.getGameEngine(roomCode);
        if (!cr || !ce || cr.status !== 'SELECTION') return;
        // Zkontroluj podmínku kol i při přeskočeném kole (rounds mode)
        if ((cr.winCondition ?? 'score') === 'rounds' && ce.roundNumber >= cr.targetRounds) {
          const finishResult = roomManager.finishGame(roomCode);
          if (!('error' in finishResult)) {
            io.to(`room:${roomCode}`).emit('game:gameOver', finishResult.payload);
            for (const [sid, token] of socketToToken.entries()) {
              if (finishResult.kickedTokens.includes(token)) {
                const kickedSocket = io.sockets.sockets.get(sid);
                if (kickedSocket) kickedSocket.leave(`room:${roomCode}`);
                socketToToken.delete(sid);
              }
            }
            io.to(`room:${roomCode}`).emit('lobby:stateUpdate', toPublicRoom(finishResult.room));
            broadcastPublicRooms(io);
          }
          return;
        }
        try {
          startNewRound(cr, ce, io);
        } catch {
          io.to(`room:${roomCode}`).emit('game:error', 'Hra skončila — došly karty nebo nejsou aktivní hráči.');
        }
      }, SKIP_DELAY_MS);
    }
  });

  // Czar picks black card (Wheaton's Law)
  socket.on('game:chooseBlackCard', (cardId) => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) return;

    const room = roomManager.getRoomByPlayerToken(playerToken);
    if (!room || room.status !== 'SELECTION' || !room.blackCardCandidates) {
      socket.emit('game:error', 'Výběr černé karty není aktuálně možný.');
      return;
    }

    const engine = roomManager.getGameEngine(room.code);
    if (!engine) { socket.emit('game:error', 'Herní engine nenalezen.'); return; }

    const id = validate(ChooseBlackCardSchema, cardId);
    if (!id) { socket.emit('game:error', 'Neplatné ID karty.'); return; }

    const czarId = roomManager.getPlayerIdByToken(playerToken)!;
    const result = engine.chooseBlackCard(czarId, id);
    if ('error' in result) { socket.emit('game:error', result.error); return; }

    roomManager.updateActivity(room.code);
    finalizeRoundStart(room, engine, io);
  });

  // Player places a bet (High Stakes)
  socket.on('game:placeBet', (amount, callback) => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) { callback({ error: 'Nejsi přihlášen.' }); return; }

    const room = roomManager.getRoomByPlayerToken(playerToken);
    if (!room || room.status !== 'SELECTION') {
      callback({ error: 'Sázky jsou možné jen ve fázi výběru karet.' });
      return;
    }

    const engine = roomManager.getGameEngine(room.code);
    if (!engine) { callback({ error: 'Herní engine nenalezen.' }); return; }

    const bet = validate(PlaceBetSchema, amount, callback);
    if (bet === null) return;

    const playerId = roomManager.getPlayerIdByToken(playerToken)!;
    const result = engine.placeBet(playerId, bet);
    if ('error' in result) { callback(result); return; }

    callback({ ok: true });
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
    io.to(`room:${room.code}`).emit('lobby:stateUpdate', toPublicRoom(room));
    io.to(`room:${room.code}`).emit('game:roundSkipped');

    const roomCode = room.code;
    setTimeout(() => {
      const cr = roomManager.getRoom(roomCode);
      const ce = roomManager.getGameEngine(roomCode);
      if (!cr || !ce || cr.status !== 'JUDGING') return;
      // Zkontroluj podmínku kol i při přeskočeném kole (rounds mode)
      if ((cr.winCondition ?? 'score') === 'rounds' && ce.roundNumber >= cr.targetRounds) {
        const finishResult = roomManager.finishGame(roomCode);
        if (!('error' in finishResult)) {
          io.to(`room:${roomCode}`).emit('game:gameOver', finishResult.payload);
          for (const [sid, token] of socketToToken.entries()) {
            if (finishResult.kickedTokens.includes(token)) {
              const kickedSocket = io.sockets.sockets.get(sid);
              if (kickedSocket) kickedSocket.leave(`room:${roomCode}`);
              socketToToken.delete(sid);
            }
          }
          io.to(`room:${roomCode}`).emit('lobby:stateUpdate', toPublicRoom(finishResult.room));
          broadcastPublicRooms(io);
        }
        return;
      }
      try {
        startNewRound(cr, ce, io);
      } catch {
        io.to(`room:${roomCode}`).emit('game:error', 'Hra skončila — došly karty nebo nejsou aktivní hráči.');
      }
    }, SKIP_DELAY_MS);
  });
}
