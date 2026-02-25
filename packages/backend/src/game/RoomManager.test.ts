import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RoomManager } from './RoomManager.js';

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

  it('creates a room with a 6-char hex code', () => {
    const { room } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    expect(room.code).toMatch(/^[a-f0-9]{6}$/);
  });

  it('creates a room with the host as first player', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    expect(room.players).toHaveLength(1);
    expect(room.players[0].nickname).toBe('Alice');
    expect(room.hostId).toBe(room.players[0].id);
    expect(typeof playerToken).toBe('string');
  });

  // --- joinRoom ---

  it('joins an existing room and returns playerToken', () => {
    const { room } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
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
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 2, nickname: 'Alice' }
    );
    rm.joinRoom(room.code, 'Bob');
    const result = rm.joinRoom(room.code, 'Charlie');
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error).toContain('plná');
  });

  it('returns error on duplicate nickname', () => {
    const { room } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    const result = rm.joinRoom(room.code, 'Alice');
    expect('error' in result).toBe(true);
  });

  it('returns error when game already started', () => {
    const { room } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    const r = rm.getRoom(room.code)!;
    r.status = 'SELECTION';
    const result = rm.joinRoom(room.code, 'Bob');
    expect('error' in result).toBe(true);
  });

  it('joinRoom returns wasReconnect: false on a fresh join', () => {
    const { room } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    const result = rm.joinRoom(room.code, 'Bob');
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.wasReconnect).toBe(false);
    }
  });

  it('joinRoom returns wasReconnect: true when playerToken matches the room', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
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
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    const result = rm.joinRoom(room.code, 'Bob', 'non-existent-token');
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.wasReconnect).toBe(false);
    }
  });

  it('reconnects player by playerToken, restores socketId', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
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
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    rm.handleDisconnect(playerToken);
    expect(room.players[0].isAfk).toBe(false);
    vi.advanceTimersByTime(30_000);
    expect(room.players[0].isAfk).toBe(true);
  });

  it('does not mark AFK if player reconnects before 30s', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
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
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
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
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    const { playerToken: bobToken } = rm.joinRoom(room.code, 'Bob') as { room: any; playerToken: string };
    const aliceId = room.players[0].id;
    const result = rm.kickPlayer(bobToken, aliceId);
    expect('error' in result).toBe(true);
  });

  // --- host transfer ---

  it('transfers host to next non-AFK player when host leaves', () => {
    const { room, playerToken: hostToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
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
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    rm.leaveRoom(playerToken);
    expect(rm.getRoom(room.code)).toBeNull();
  });

  // --- updateSettings ---

  it('host can update settings', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
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
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    rm.joinRoom(room.code, 'Bob');
    rm.joinRoom(room.code, 'Charlie');
    const result = rm.updateSettings(playerToken, { maxPlayers: 2 });
    expect('error' in result).toBe(true);
  });

  // --- startGame ---

  it('rejects startGame with fewer than 3 players', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    rm.joinRoom(room.code, 'Bob');
    const result = rm.startGame(playerToken);
    expect('error' in result).toBe(true);
  });

  it('starts game with 3+ players', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
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
      { name: 'Test', isPublic: true, selectedSetIds: [], maxPlayers: 6, nickname: 'Alice' }
    );
    rm.joinRoom(room.code, 'Bob');
    rm.joinRoom(room.code, 'Charlie');
    const result = rm.startGame(playerToken);
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error).toContain('sada');
  });

  // --- getPublicRooms ---

  it('lists only public rooms with status LOBBY', () => {
    rm.createRoom({ name: 'Public', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'A' });
    rm.createRoom({ name: 'Private', isPublic: false, selectedSetIds: [1], maxPlayers: 6, nickname: 'B' });
    const list = rm.getPublicRooms();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Public');
  });

  // --- endGame ---

  it('endGame returns error for non-host', () => {
    const { room } = rm.createRoom(
      { name: 'T', isPublic: false, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    const bobResult = rm.joinRoom(room.code, 'Bob');
    if ('error' in bobResult) throw new Error('join failed');
    // startGame requires 3 active players but we just need to test error path
    const result = rm.endGame(bobResult.playerToken);
    expect('error' in result).toBe(true);
  });

  it('endGame returns error when game is in LOBBY', () => {
    const { playerToken } = rm.createRoom(
      { name: 'T', isPublic: false, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    const result = rm.endGame(playerToken);
    expect('error' in result).toBe(true);
  });

  it('endGame sets status to FINISHED and clears engine', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'T', isPublic: false, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
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

  // --- returnToLobby ---

  it('returnToLobby returns error when not FINISHED', () => {
    const { playerToken } = rm.createRoom(
      { name: 'T', isPublic: false, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    const result = rm.returnToLobby(playerToken);
    expect('error' in result).toBe(true);
  });

  it('returnToLobby resets room state', () => {
    const { room, playerToken } = rm.createRoom(
      { name: 'T', isPublic: false, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    rm.joinRoom(room.code, 'Bob');
    rm.joinRoom(room.code, 'Charlie');
    rm.startGame(playerToken);
    rm.endGame(playerToken);

    // Give players some score to verify reset
    room.players[0].score = 5;
    room.players[1].score = 3;

    const result = rm.returnToLobby(playerToken);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.room.status).toBe('LOBBY');
      expect(result.room.roundNumber).toBe(0);
      expect(result.room.currentBlackCard).toBeNull();
      expect(result.room.players.every(p => p.score === 0)).toBe(true);
    }
  });

  // --- timer methods ---

  it('setRoundTimer fires callback after delay', () => {
    const cb = vi.fn();
    const { room } = rm.createRoom(
      { name: 'T', isPublic: false, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
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
      { name: 'T', isPublic: false, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    rm.setRoundTimer(room.code, cb, 45_000);
    rm.clearRoundTimer(room.code);
    vi.advanceTimersByTime(60_000);
    expect(cb).not.toHaveBeenCalled();
  });

  it('setJudgingTimer fires callback after delay', () => {
    const cb = vi.fn();
    const { room } = rm.createRoom(
      { name: 'T', isPublic: false, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    rm.setJudgingTimer(room.code, cb, 60_000);
    vi.advanceTimersByTime(60_000);
    expect(cb).toHaveBeenCalledOnce();
  });

  it('clearAllGameTimers cancels both timers', () => {
    const cbR = vi.fn();
    const cbJ = vi.fn();
    const { room } = rm.createRoom(
      { name: 'T', isPublic: false, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice' }
    );
    rm.setRoundTimer(room.code, cbR, 45_000);
    rm.setJudgingTimer(room.code, cbJ, 60_000);
    rm.clearAllGameTimers(room.code);
    vi.advanceTimersByTime(120_000);
    expect(cbR).not.toHaveBeenCalled();
    expect(cbJ).not.toHaveBeenCalled();
  });
});
