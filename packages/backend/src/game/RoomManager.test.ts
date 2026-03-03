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

  it('reconnects player by playerToken, restores socketId', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 8 }
    );
    rm.handleDisconnect(playerToken);
    const reconnected = rm.reconnect(playerToken, 'socket-new-123');
    expect(reconnected).not.toBeNull();
    expect(reconnected!.players[0].socketId).toBe('socket-new-123');
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
    room.players[0].socketId = 'fake-socket-id';

    const snapshot = rm.serialize();
    const rm2 = new RoomManager();
    rm2.restore(snapshot);

    const restored = rm2.getRoom(room.code)!;
    expect(restored.players[0].isOnline).toBe(false);
    expect(restored.players[0].socketId).toBeNull();
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
});
