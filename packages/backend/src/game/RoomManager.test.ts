import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RoomManager } from './RoomManager.js';
import { GameEngine } from './GameEngine.js';

describe('RoomManager', () => {
  let rm: RoomManager;

  beforeEach(() => {
    vi.useFakeTimers();
    rm = new RoomManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- createRoom ---

  it('creates a room with a 6-char alfanumeric code', () => {
    const { room } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 8 }
    );
    expect(room.code).toMatch(/^[A-Z2-9]{6}$/);
  });

  it('creates a room with the host as first player', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 8 }
    );
    expect(room.players).toHaveLength(1);
    expect(room.players[0].nickname).toBe('Alice');
    expect(room.hostId).toBe(room.players[0].id);
    expect(typeof playerToken).toBe('string');
  });

  it('sets default win condition when not provided', () => {
    const { room } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 10, specialRules: [] }
    );
    expect(room.winCondition).toBe('score');
    expect(room.targetRounds).toBe(20);
    expect(room.gameTimeLimit).toBe(15);
    expect(room.gameStartedAt).toBeNull();
  });

  it('uses provided win condition', () => {
    const { room } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 10, specialRules: [],
        winCondition: 'time', gameTimeLimit: 30 }
    );
    expect(room.winCondition).toBe('time');
    expect(room.gameTimeLimit).toBe(30);
  });

  it('stores czarMode in room', () => {
    const { room } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 8, specialRules: [], czarMode: 'god_mode' }
    );
    expect(room.czarMode).toBe('god_mode');
  });

  it('default czarMode is classic', () => {
    const { room } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 8, specialRules: [] }
    );
    expect(room.czarMode).toBe('classic');
  });

  it('updateSettings: can change czarMode', () => {
    const { playerToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 8, specialRules: [] }
    );
    const result = rm.updateSettings(playerToken, { czarMode: 'meritocracy' });
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.room.czarMode).toBe('meritocracy');
    }
  });

  // --- joinRoom ---

  it('joins an existing room and returns playerToken', () => {
    const { room } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 8 }
    );
    const result = rm.joinRoom(room.code, 'Bob');
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.room.players).toHaveLength(2);
      expect(result.playerToken).toBeTruthy();
    }
  });

  it('returns error when room not found', () => {
    const result = rm.joinRoom('000000', 'Bob');
    expect('error' in result).toBe(true);
  });

  it('returns error when room is full', () => {
    const { room } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 2, nickname: 'Alice', targetScore: 8 }
    );
    rm.joinRoom(room.code, 'Bob');
    const result = rm.joinRoom(room.code, 'Charlie');
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error).toContain('plná');
  });

  it('returns error on duplicate nickname', () => {
    const { room } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 8 }
    );
    const result = rm.joinRoom(room.code, 'Alice');
    expect('error' in result).toBe(true);
  });

  it('returns error when game already started', () => {
    const { room } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 8 }
    );
    const r = rm.getRoom(room.code)!;
    r.status = 'SELECTION';
    const result = rm.joinRoom(room.code, 'Bob');
    expect('error' in result).toBe(true);
  });

  it('joinRoom returns wasReconnect: false on a fresh join', () => {
    const { room } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 8 }
    );
    const result = rm.joinRoom(room.code, 'Bob');
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.wasReconnect).toBe(false);
    }
  });

  it('joinRoom returns wasReconnect: true when playerToken matches the room', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 8 }
    );
    rm.handleDisconnect(playerToken);
    const result = rm.joinRoom(room.code, '', playerToken);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.wasReconnect).toBe(true);
    }
  });

  it('joinRoom ignores invalid playerToken and treats join as fresh (wasReconnect: false)', () => {
    const { room } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 8 }
    );
    const result = rm.joinRoom(room.code, 'Bob', 'non-existent-token');
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.wasReconnect).toBe(false);
    }
  });

  it('reconnects player by playerToken, restores online + clears AFK', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 8 }
    );
    rm.handleDisconnect(playerToken);
    const reconnected = rm.reconnect(playerToken);
    expect(reconnected).not.toBeNull();
    expect(reconnected!.players[0].isOnline).toBe(true);
    expect(reconnected!.players[0].isAfk).toBe(false);
  });

  // --- AFK ---

  it('marks player AFK after 30s of disconnect', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 8 }
    );
    rm.handleDisconnect(playerToken);
    expect(room.players[0].isAfk).toBe(false);
    vi.advanceTimersByTime(30_000);
    expect(room.players[0].isAfk).toBe(true);
  });

  it('does not mark AFK if player reconnects before 30s', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 8 }
    );
    rm.handleDisconnect(playerToken);
    vi.advanceTimersByTime(10_000);
    rm.reconnect(playerToken, 'new-socket');
    vi.advanceTimersByTime(25_000);
    expect(room.players[0].isAfk).toBe(false);
  });

  // --- kickPlayer ---

  it('host can kick another player', () => {
    const { room, playerToken: hostToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 8 }
    );
    rm.joinRoom(room.code, 'Bob');
    const bobId = rm.getRoom(room.code)!.players.find(p => p.nickname === 'Bob')!.id;
    const result = rm.kickPlayer(hostToken, bobId);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.room.players).toHaveLength(1);
      expect(result.kickedPlayerToken).toBeTruthy();
    }
  });

  it('non-host cannot kick', () => {
    const { room } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 8 }
    );
    const { playerToken: bobToken } = rm.joinRoom(room.code, 'Bob') as { room: any; playerToken: string };
    const aliceId = room.players[0].id;
    const result = rm.kickPlayer(bobToken, aliceId);
    expect('error' in result).toBe(true);
  });

  // --- host transfer ---

  it('transfers host to next non-AFK player when host leaves', () => {
    const { room, playerToken: hostToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 8 }
    );
    rm.joinRoom(room.code, 'Bob');
    rm.leaveRoom(hostToken);
    const updated = rm.getRoom(room.code)!;
    expect(updated.players).toHaveLength(1);
    expect(updated.players[0].nickname).toBe('Bob');
    expect(updated.hostId).toBe(updated.players[0].id);
  });

  it('deletes room when last player leaves', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 8 }
    );
    rm.leaveRoom(playerToken);
    expect(rm.getRoom(room.code)).toBeNull();
  });

  // --- updateSettings ---

  it('host can update settings', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 8 }
    );
    const result = rm.updateSettings(playerToken, { name: 'Nova', maxPlayers: 8 });
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.room.name).toBe('Nova');
      expect(result.room.maxPlayers).toBe(8);
    }
  });

  it('rejects maxPlayers below current player count', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 8 }
    );
    rm.joinRoom(room.code, 'Bob');
    rm.joinRoom(room.code, 'Charlie');
    const result = rm.updateSettings(playerToken, { maxPlayers: 2 });
    expect('error' in result).toBe(true);
  });

  it('updates win condition via updateSettings', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 10, specialRules: [] }
    );
    expect(room.winCondition).toBe('score');

    const result = rm.updateSettings(playerToken, { winCondition: 'rounds', targetRounds: 15 });
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.room.winCondition).toBe('rounds');
      expect(result.room.targetRounds).toBe(15);
    }
  });

  // --- startGame ---

  it('rejects startGame with fewer than 3 players', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 8 }
    );
    rm.joinRoom(room.code, 'Bob');
    const result = rm.startGame(playerToken);
    expect('error' in result).toBe(true);
  });

  it('starts game with 3+ players', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 8 }
    );
    rm.joinRoom(room.code, 'Bob');
    rm.joinRoom(room.code, 'Charlie');
    const result = rm.startGame(playerToken);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.room.status).toBe('SELECTION');
    }
  });

  it('rejects startGame when no card sets selected', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [], maxPlayers: 6, nickname: 'Alice', targetScore: 8 }
    );
    rm.joinRoom(room.code, 'Bob');
    rm.joinRoom(room.code, 'Charlie');
    const result = rm.startGame(playerToken);
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error).toContain('sada');
  });

  // --- getPublicRooms ---

  it('lists only public rooms with status LOBBY', () => {
    rm.createRoom({ name: 'Public', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'A', targetScore: 8 });
    rm.createRoom({ name: 'Private', isPublic: false, selectedSetIds: [1], maxPlayers: 6, nickname: 'B', targetScore: 8 });
    const list = rm.getPublicRooms();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Public');
  });

  // --- endGame ---

  it('endGame returns error for non-host', () => {
    const { room } = rm.createRoom(
      { name: 'T', isPublic: false, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 8 }
    );
    const bobResult = rm.joinRoom(room.code, 'Bob');
    if ('error' in bobResult) throw new Error('join failed');
    // startGame requires 3 active players but we just need to test error path
    const result = rm.endGame(bobResult.playerToken);
    expect('error' in result).toBe(true);
  });

  it('endGame returns error when game is in LOBBY', () => {
    const { playerToken } = rm.createRoom(
      { name: 'T', isPublic: false, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 8 }
    );
    const result = rm.endGame(playerToken);
    expect('error' in result).toBe(true);
  });

  it('endGame sets status to FINISHED and clears engine', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'T', isPublic: false, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 8 }
    );
    rm.joinRoom(room.code, 'Bob');
    rm.joinRoom(room.code, 'Charlie');
    rm.startGame(playerToken);
    // Simulate engine
    rm.setGameEngine(room.code, {} as any);

    const result = rm.endGame(playerToken);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.room.status).toBe('FINISHED');
      expect(result.room.roundDeadline).toBeNull();
      expect(rm.getGameEngine(room.code)).toBeNull();
    }
  });

  // --- timer methods ---

  it('setRoundTimer fires callback after delay', () => {
    const cb = vi.fn();
    const { room } = rm.createRoom(
      { name: 'T', isPublic: false, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 8 }
    );
    rm.setRoundTimer(room.code, cb, 45_000);
    vi.advanceTimersByTime(44_999);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledOnce();
  });

  it('clearRoundTimer cancels callback', () => {
    const cb = vi.fn();
    const { room } = rm.createRoom(
      { name: 'T', isPublic: false, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 8 }
    );
    rm.setRoundTimer(room.code, cb, 45_000);
    rm.clearRoundTimer(room.code);
    vi.advanceTimersByTime(60_000);
    expect(cb).not.toHaveBeenCalled();
  });

  it('setJudgingTimer fires callback after delay', () => {
    const cb = vi.fn();
    const { room } = rm.createRoom(
      { name: 'T', isPublic: false, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 8 }
    );
    rm.setJudgingTimer(room.code, cb, 60_000);
    vi.advanceTimersByTime(60_000);
    expect(cb).toHaveBeenCalledOnce();
  });

  it('clearAllGameTimers cancels both timers', () => {
    const cbR = vi.fn();
    const cbJ = vi.fn();
    const { room } = rm.createRoom(
      { name: 'T', isPublic: false, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 8 }
    );
    rm.setRoundTimer(room.code, cbR, 45_000);
    rm.setJudgingTimer(room.code, cbJ, 60_000);
    rm.clearAllGameTimers(room.code);
    vi.advanceTimersByTime(120_000);
    expect(cbR).not.toHaveBeenCalled();
    expect(cbJ).not.toHaveBeenCalled();
  });
});

describe('finishGame', () => {
  function setupRoom() {
    const rm = new RoomManager();
    const { room, playerToken: hostToken } = rm.createRoom({
      name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6,
      nickname: 'Alice', targetScore: 10,
    });
    const r2 = rm.joinRoom(room.code, 'Bob');
    const r3 = rm.joinRoom(room.code, 'Charlie');
    const bobToken = 'error' in r2 ? '' : r2.playerToken;
    const charlieToken = 'error' in r3 ? '' : r3.playerToken;
    // Set scores
    const bobId = rm.getPlayerIdByToken(bobToken)!;
    const charlieId = rm.getPlayerIdByToken(charlieToken)!;
    room.players.find(p => p.id === bobId)!.score = 10;
    room.players.find(p => p.id === charlieId)!.score = 5;
    return { rm, room, hostToken, bobToken, charlieToken, bobId, charlieId };
  }

  it('returns GameOverPayload with sorted final scores', () => {
    const { rm, room } = setupRoom();
    const result = rm.finishGame(room.code);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.payload.roomCode).toBe(room.code);
    expect(result.payload.finalScores[0].rank).toBe(1);
    expect(result.payload.finalScores[0].score).toBe(10); // Bob wins
  });

  it('kicks all non-host players from room', () => {
    const { rm, room, bobToken, charlieToken } = setupRoom();
    rm.finishGame(room.code);
    expect(rm.getRoomByPlayerToken(bobToken)).toBeNull();
    expect(rm.getRoomByPlayerToken(charlieToken)).toBeNull();
    expect(room.players).toHaveLength(1); // jen host
  });

  it('returns kicked player tokens', () => {
    const { rm, room, bobToken, charlieToken } = setupRoom();
    const result = rm.finishGame(room.code);
    if ('error' in result) return;
    expect(result.kickedTokens).toContain(bobToken);
    expect(result.kickedTokens).toContain(charlieToken);
    expect(result.kickedTokens).toHaveLength(2);
  });

  it('resets room to LOBBY with zeroed scores', () => {
    const { rm, room } = setupRoom();
    rm.finishGame(room.code);
    expect(room.status).toBe('LOBBY');
    for (const p of room.players) {
      expect(p.score).toBe(0);
    }
  });

  it('returns error for unknown room code', () => {
    const rm = new RoomManager();
    const result = rm.finishGame('xxxxxx');
    expect('error' in result).toBe(true);
  });
});

describe('updateActivity', () => {
  it('updates lastActivityAt', () => {
    vi.useFakeTimers();
    const rm = new RoomManager();
    const { room } = rm.createRoom({
      name: 'T', isPublic: false, selectedSetIds: [1], maxPlayers: 4,
      nickname: 'A', targetScore: 10,
    });
    const before = room.lastActivityAt;
    vi.advanceTimersByTime(1000);
    rm.updateActivity(room.code);
    expect(room.lastActivityAt).toBeGreaterThan(before);
    vi.useRealTimers();
  });
});

describe('serialize / restore', () => {
  it('restores rooms and player token maps from snapshot', () => {
    const rm = new RoomManager();
    const { room, playerToken } = rm.createRoom({
      name: 'Test', isPublic: true, selectedSetIds: [1],
      maxPlayers: 6, nickname: 'Alice', targetScore: 8,
    });
    const joinResult = rm.joinRoom(room.code, 'Bob');
    expect('error' in joinResult).toBe(false);

    const snapshot = rm.serialize();
    const rm2 = new RoomManager();
    rm2.restore(snapshot);

    expect(rm2.getRoom(room.code)).not.toBeNull();
    expect(rm2.getRoomByPlayerToken(playerToken)).not.toBeNull();
    expect(rm2.getPlayerIdByToken(playerToken)).toBeTruthy();
  });

  it('marks all restored players as offline', () => {
    const rm = new RoomManager();
    const { room } = rm.createRoom({
      name: 'Test', isPublic: true, selectedSetIds: [1],
      maxPlayers: 6, nickname: 'Alice', targetScore: 8,
    });
    // Simuluj online stav před snapshotem
    room.players[0].isOnline = true;

    const snapshot = rm.serialize();
    const rm2 = new RoomManager();
    rm2.restore(snapshot);

    const restored = rm2.getRoom(room.code)!;
    expect(restored.players[0].isOnline).toBe(false);
  });

  it('restores game engine for rooms with active game', () => {
    const rm = new RoomManager();
    const { room } = rm.createRoom({
      name: 'Test', isPublic: true, selectedSetIds: [1],
      maxPlayers: 6, nickname: 'Alice', targetScore: 8,
    });
    const fakeEngine = new GameEngine(
      room.players,
      [{ id: 1, text: 'Black ____', pick: 1 }],
      [{ id: 1, text: 'White 1' }, { id: 2, text: 'White 2' }],
    );
    rm.setGameEngine(room.code, fakeEngine);
    room.status = 'SELECTION';

    const snapshot = rm.serialize();
    const rm2 = new RoomManager();
    rm2.restore(snapshot);

    expect(rm2.getGameEngine(room.code)).not.toBeNull();
  });
});

// --- guestId identity ---

describe('guestId identity', () => {
  let rm: RoomManager;
  const GUEST_A = '11111111-1111-4111-8111-111111111111';
  const GUEST_B = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    vi.useFakeTimers();
    rm = new RoomManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createHostedRoom(guestId?: string) {
    return rm.createRoom({
      name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6,
      nickname: 'Alice', targetScore: 8, specialRules: [], guestId,
    });
  }

  it('joinRoom with guestId but no token reconnects to the existing instance', () => {
    const { room } = createHostedRoom();
    const first = rm.joinRoom(room.code, 'Bob', undefined, null, GUEST_A);
    expect('error' in first).toBe(false);
    if ('error' in first) return;

    // Token ztracen (jiné localStorage klíče apod.) — pošle se jen guestId
    const second = rm.joinRoom(room.code, 'Bob', undefined, null, GUEST_A);
    expect('error' in second).toBe(false);
    if ('error' in second) return;
    expect(second.wasReconnect).toBe(true);
    expect(second.playerToken).toBe(first.playerToken);
    expect(second.room.players).toHaveLength(2);
  });

  it('guestId reconnect works even when the nickname changed meanwhile', () => {
    const { room } = createHostedRoom();
    const first = rm.joinRoom(room.code, 'Bob', undefined, null, GUEST_A);
    if ('error' in first) throw new Error('join failed');

    const second = rm.joinRoom(room.code, 'Bobik', undefined, null, GUEST_A);
    expect('error' in second).toBe(false);
    if ('error' in second) return;
    expect(second.wasReconnect).toBe(true);
    expect(second.room.players).toHaveLength(2);
    // Přezdívka změněná v mezičase se při reconnectu propíše do místnosti
    const playerId = rm.getPlayerIdByToken(second.playerToken)!;
    expect(second.room.players.find(p => p.id === playerId)!.nickname).toBe('Bobik');
  });

  it('guestId reconnect is not blocked by the duplicate-nickname check', () => {
    const { room } = createHostedRoom();
    const first = rm.joinRoom(room.code, 'Bob', undefined, null, GUEST_A);
    if ('error' in first) throw new Error('join failed');
    rm.handleDisconnect(first.playerToken);
    vi.advanceTimersByTime(31_000); // mrtvá instance je AFK

    const second = rm.joinRoom(room.code, 'Bob', undefined, null, GUEST_A);
    expect('error' in second).toBe(false);
    if ('error' in second) return;
    expect(second.wasReconnect).toBe(true);
    expect(second.room.players).toHaveLength(2);
  });

  it('different guestId with a taken nickname is still rejected', () => {
    const { room } = createHostedRoom();
    rm.joinRoom(room.code, 'Bob', undefined, null, GUEST_A);
    const result = rm.joinRoom(room.code, 'Bob', undefined, null, GUEST_B);
    expect('error' in result).toBe(true);
  });

  it('same guestId can be in two different rooms at once', () => {
    const { room: room1 } = createHostedRoom();
    const { room: room2 } = rm.createRoom({
      name: 'Other', isPublic: true, selectedSetIds: [1], maxPlayers: 6,
      nickname: 'Cecil', targetScore: 8, specialRules: [],
    });
    const j1 = rm.joinRoom(room1.code, 'Bob', undefined, null, GUEST_A);
    const j2 = rm.joinRoom(room2.code, 'Bob', undefined, null, GUEST_A);
    expect('error' in j1).toBe(false);
    expect('error' in j2).toBe(false);
    if ('error' in j1 || 'error' in j2) return;
    expect(j1.wasReconnect).toBe(false);
    expect(j2.wasReconnect).toBe(false);
    // Reconnect v room1 najde instanci v room1, ne v room2
    const again = rm.joinRoom(room1.code, '', undefined, null, GUEST_A);
    if ('error' in again) throw new Error('reconnect failed');
    expect(again.playerToken).toBe(j1.playerToken);
  });

  it('createRoom registers host guestId for later reconnect', () => {
    const { room, playerToken } = createHostedRoom(GUEST_A);
    const rejoin = rm.joinRoom(room.code, '', undefined, null, GUEST_A);
    expect('error' in rejoin).toBe(false);
    if ('error' in rejoin) return;
    expect(rejoin.wasReconnect).toBe(true);
    expect(rejoin.playerToken).toBe(playerToken);
  });

  it('leaveRoom clears the guestId mapping — rejoin is a fresh join', () => {
    const { room } = createHostedRoom();
    const first = rm.joinRoom(room.code, 'Bob', undefined, null, GUEST_A);
    if ('error' in first) throw new Error('join failed');
    rm.leaveRoom(first.playerToken);

    const second = rm.joinRoom(room.code, 'Bob', undefined, null, GUEST_A);
    expect('error' in second).toBe(false);
    if ('error' in second) return;
    expect(second.wasReconnect).toBe(false);
    expect(second.playerToken).not.toBe(first.playerToken);
  });

  it('finishGame clears guestId mappings of kicked non-host players', () => {
    const { room, playerToken: hostToken } = createHostedRoom(GUEST_A);
    const bob = rm.joinRoom(room.code, 'Bob', undefined, null, GUEST_B);
    rm.joinRoom(room.code, 'Charlie');
    if ('error' in bob) throw new Error('join failed');
    rm.finishGame(room.code);

    // Bob je vyhozen — guestId reconnect nesmí najít mrtvou mapu
    const rejoin = rm.joinRoom(room.code, 'Bob', undefined, null, GUEST_B);
    expect('error' in rejoin).toBe(false);
    if ('error' in rejoin) return;
    expect(rejoin.wasReconnect).toBe(false);

    // Host mapping přežívá
    const hostRejoin = rm.joinRoom(room.code, '', undefined, null, GUEST_A);
    if ('error' in hostRejoin) throw new Error('host reconnect failed');
    expect(hostRejoin.wasReconnect).toBe(true);
    expect(hostRejoin.playerToken).toBe(hostToken);
  });

  it('legacy playerToken still reconnects when guestId is unknown', () => {
    const { room } = createHostedRoom();
    const first = rm.joinRoom(room.code, 'Bob'); // starý klient bez guestId
    if ('error' in first) throw new Error('join failed');
    const second = rm.joinRoom(room.code, '', first.playerToken, null, GUEST_A);
    expect('error' in second).toBe(false);
    if ('error' in second) return;
    expect(second.wasReconnect).toBe(true);
    // Migrace: příště stačí samotné guestId
    const third = rm.joinRoom(room.code, '', undefined, null, GUEST_A);
    if ('error' in third) throw new Error('guestId reconnect failed');
    expect(third.wasReconnect).toBe(true);
    expect(third.playerToken).toBe(first.playerToken);
  });

  it('serialize/restore preserves guestId mappings', () => {
    const { room } = createHostedRoom();
    const first = rm.joinRoom(room.code, 'Bob', undefined, null, GUEST_A);
    if ('error' in first) throw new Error('join failed');

    const rm2 = new RoomManager();
    rm2.restore(rm.serialize());

    const rejoin = rm2.joinRoom(room.code, 'Bob', undefined, null, GUEST_A);
    expect('error' in rejoin).toBe(false);
    if ('error' in rejoin) return;
    expect(rejoin.wasReconnect).toBe(true);
    expect(rejoin.playerToken).toBe(first.playerToken);
  });
});

// --- syncProfileByGuestId ---

describe('syncProfileByGuestId', () => {
  let rm: RoomManager;
  const GUEST_A = '11111111-1111-4111-8111-111111111111';
  const GUEST_B = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    rm = new RoomManager();
  });

  function createRoomWithHost(name = 'Test') {
    return rm.createRoom({
      name, isPublic: true, selectedSetIds: [1], maxPlayers: 6,
      nickname: 'Alice', targetScore: 8, specialRules: [],
    });
  }

  it('renames the player instance in the room where the guest sits', () => {
    const { room } = createRoomWithHost();
    rm.joinRoom(room.code, 'Bob', undefined, null, GUEST_A);

    const result = rm.syncProfileByGuestId(GUEST_A, 'Bobik');
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.rooms.map(r => r.code)).toEqual([room.code]);
    expect(room.players.find(p => p.nickname === 'Bobik')).toBeTruthy();
    expect(room.players.find(p => p.nickname === 'Bob')).toBeUndefined();
  });

  it('renames instances in all rooms the guest sits in', () => {
    const { room: r1 } = createRoomWithHost('One');
    const { room: r2 } = createRoomWithHost('Two');
    rm.joinRoom(r1.code, 'Bob', undefined, null, GUEST_A);
    rm.joinRoom(r2.code, 'Bob', undefined, null, GUEST_A);

    const result = rm.syncProfileByGuestId(GUEST_A, 'Bobik');
    if ('error' in result) throw new Error('sync failed');
    expect(result.rooms).toHaveLength(2);
    expect(r1.players.some(p => p.nickname === 'Bobik')).toBe(true);
    expect(r2.players.some(p => p.nickname === 'Bobik')).toBe(true);
  });

  it('rejects atomically when the new nickname collides in any room', () => {
    const { room: r1 } = createRoomWithHost('One');
    const { room: r2 } = createRoomWithHost('Two');
    rm.joinRoom(r1.code, 'Bob', undefined, null, GUEST_A);
    rm.joinRoom(r2.code, 'Bob', undefined, null, GUEST_A);
    rm.joinRoom(r2.code, 'Cyril', undefined, null, GUEST_B);

    const result = rm.syncProfileByGuestId(GUEST_A, 'cyril'); // case-insensitive
    expect('error' in result).toBe(true);
    // Nic se nesmí změnit — ani v místnosti bez kolize
    expect(r1.players.some(p => p.nickname === 'Bob')).toBe(true);
    expect(r2.players.some(p => p.nickname === 'Bob')).toBe(true);
  });

  it('returns empty rooms for a guest sitting nowhere', () => {
    const result = rm.syncProfileByGuestId(GUEST_A, 'Bobik');
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.rooms).toHaveLength(0);
  });

  it('renaming to own current nickname is a no-op success', () => {
    const { room } = createRoomWithHost();
    rm.joinRoom(room.code, 'Bob', undefined, null, GUEST_A);
    const result = rm.syncProfileByGuestId(GUEST_A, 'Bob');
    expect('error' in result).toBe(false);
  });
});

// --- rename při reconnectu ---

describe('reconnect nickname sync', () => {
  let rm: RoomManager;
  const GUEST_A = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    rm = new RoomManager();
  });

  function setup() {
    const { room } = rm.createRoom({
      name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6,
      nickname: 'Alice', targetScore: 8, specialRules: [],
    });
    const bob = rm.joinRoom(room.code, 'Bob', undefined, null, GUEST_A);
    if ('error' in bob) throw new Error('join failed');
    return { room, bobToken: bob.playerToken };
  }

  it('applies the changed nickname on token reconnect', () => {
    const { room, bobToken } = setup();
    const result = rm.joinRoom(room.code, 'Bobik', bobToken);
    if ('error' in result) throw new Error('reconnect failed');
    expect(result.wasReconnect).toBe(true);
    expect(room.players.some(p => p.nickname === 'Bobik')).toBe(true);
    expect(room.players.some(p => p.nickname === 'Bob')).toBe(false);
  });

  it('applies the changed nickname on guestId reconnect', () => {
    const { room } = setup();
    const result = rm.joinRoom(room.code, 'Bobik', undefined, null, GUEST_A);
    if ('error' in result) throw new Error('reconnect failed');
    expect(result.wasReconnect).toBe(true);
    expect(room.players.some(p => p.nickname === 'Bobik')).toBe(true);
  });

  it('keeps the old nickname when the new one collides in the room', () => {
    const { room, bobToken } = setup();
    const result = rm.joinRoom(room.code, 'Alice', bobToken); // kolize s hostem
    if ('error' in result) throw new Error('reconnect failed');
    expect(result.wasReconnect).toBe(true);
    expect(room.players.filter(p => p.nickname.toLowerCase() === 'alice')).toHaveLength(1);
    expect(room.players.some(p => p.nickname === 'Bob')).toBe(true);
  });

  it('empty nickname on reconnect keeps the current one', () => {
    const { room, bobToken } = setup();
    const result = rm.joinRoom(room.code, '', bobToken);
    if ('error' in result) throw new Error('reconnect failed');
    expect(room.players.some(p => p.nickname === 'Bob')).toBe(true);
  });
});

// --- removeStalePlayers (GC offline hráčů v LOBBY) ---

describe('removeStalePlayers', () => {
  let rm: RoomManager;

  beforeEach(() => {
    vi.useFakeTimers();
    rm = new RoomManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    const { room, playerToken: hostToken } = rm.createRoom({
      name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6,
      nickname: 'Alice', targetScore: 8, specialRules: [],
    });
    const bob = rm.joinRoom(room.code, 'Bob');
    if ('error' in bob) throw new Error('join failed');
    return { room, hostToken, bobToken: bob.playerToken };
  }

  it('removes players offline longer than the threshold from LOBBY rooms', () => {
    const { room, bobToken } = setup();
    rm.handleDisconnect(bobToken);
    vi.advanceTimersByTime(10 * 60 * 1000);

    const affected = rm.removeStalePlayers(10 * 60 * 1000);
    expect(affected.map(r => r.code)).toContain(room.code);
    expect(rm.getRoom(room.code)!.players).toHaveLength(1);
    expect(rm.getRoomByPlayerToken(bobToken)).toBeNull();
  });

  it('keeps players offline for less than the threshold', () => {
    const { room, bobToken } = setup();
    rm.handleDisconnect(bobToken);
    vi.advanceTimersByTime(5 * 60 * 1000);

    const affected = rm.removeStalePlayers(10 * 60 * 1000);
    expect(affected).toHaveLength(0);
    expect(rm.getRoom(room.code)!.players).toHaveLength(2);
  });

  it('does not touch offline players while a game is running', () => {
    const { room, bobToken } = setup();
    rm.getRoom(room.code)!.status = 'SELECTION';
    rm.handleDisconnect(bobToken);
    vi.advanceTimersByTime(30 * 60 * 1000);

    const affected = rm.removeStalePlayers(10 * 60 * 1000);
    expect(affected).toHaveLength(0);
    expect(rm.getRoom(room.code)!.players).toHaveLength(2);
  });

  it('reconnect resets the offline clock', () => {
    const { room, bobToken } = setup();
    rm.handleDisconnect(bobToken);
    vi.advanceTimersByTime(9 * 60 * 1000);
    rm.reconnect(bobToken);
    rm.handleDisconnect(bobToken);
    vi.advanceTimersByTime(2 * 60 * 1000);

    const affected = rm.removeStalePlayers(10 * 60 * 1000);
    expect(affected).toHaveLength(0);
    expect(rm.getRoom(room.code)!.players).toHaveLength(2);
  });

  it('deletes the room when the last player is stale', () => {
    const { room, hostToken, bobToken } = setup();
    rm.handleDisconnect(hostToken);
    rm.handleDisconnect(bobToken);
    vi.advanceTimersByTime(15 * 60 * 1000);

    rm.removeStalePlayers(10 * 60 * 1000);
    expect(rm.getRoom(room.code)).toBeNull();
  });
});

// --- specialRules ---

describe('specialRules', () => {
  let manager: RoomManager;

  beforeEach(() => {
    manager = new RoomManager();
  });

  it('createRoom stores specialRules on room', () => {
    const { room } = manager.createRoom({
      name: 'Test', isPublic: false, selectedSetIds: [1],
      maxPlayers: 5, nickname: 'Host', targetScore: 8,
      specialRules: ['god_mode', 'meritocracy'],
    });
    expect(room.specialRules).toEqual(['god_mode', 'meritocracy']);
  });

  it('createRoom defaults specialRules to []', () => {
    const { room } = manager.createRoom({
      name: 'Test', isPublic: false, selectedSetIds: [1],
      maxPlayers: 5, nickname: 'Host', targetScore: 8,
      specialRules: [],
    });
    expect(room.specialRules).toEqual([]);
  });

  it('updateSettings can change specialRules', () => {
    const { playerToken, room } = manager.createRoom({
      name: 'Test', isPublic: false, selectedSetIds: [1],
      maxPlayers: 5, nickname: 'Host', targetScore: 8,
      specialRules: [],
    });
    const result = manager.updateSettings(playerToken, { specialRules: ['high_stakes'] });
    expect('error' in result).toBe(false);
    expect(room.specialRules).toEqual(['high_stakes']);
  });

  // --- setPlayerOAuthUserId ---

  describe('setPlayerOAuthUserId', () => {
    it('sets oauthUserId on the player matching the given token', () => {
      const rm = new RoomManager();
      const { room, playerToken } = rm.createRoom({
        nickname: 'Alice',
        name: 'TestRoom',
        isPublic: false,
        selectedSetIds: [1],
        maxPlayers: 6,
        specialRules: [],
        czarMode: 'classic',
        winCondition: 'score',
        targetScore: 8,
        targetRounds: 20,
        gameTimeLimit: 15,
        avatarUrl: null,
      });
      rm.setPlayerOAuthUserId(playerToken, 42);
      const player = rm.getRoom(room.code)!.players[0];
      expect(player.oauthUserId).toBe(42);
    });

    it('is a no-op for unknown token', () => {
      const rm = new RoomManager();
      expect(() => rm.setPlayerOAuthUserId('unknown-token', 1)).not.toThrow();
    });
  });
});
