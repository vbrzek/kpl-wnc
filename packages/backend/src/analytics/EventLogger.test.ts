import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GameRoom } from '@kpl/shared';

// All mock state declared inside vi.mock factory — canonical Vitest pattern
vi.mock('../db/db.js', () => {
  const mockInsert = vi.fn().mockResolvedValue([42]);
  // mockTrx is callable: trx('tableName') returns { insert } — mirrors real Knex transaction API
  const mockTrx = Object.assign(
    vi.fn(() => ({ insert: mockInsert })),
    { _mockInsert: mockInsert }
  );
  const mockDb = Object.assign(
    vi.fn(() => ({ insert: mockInsert })),
    {
      transaction: vi.fn((cb: (trx: typeof mockTrx) => Promise<void>) => cb(mockTrx)),
      _mockInsert: mockInsert,
      _mockTrx: mockTrx,
    }
  );
  return { default: mockDb };
});

import db from '../db/db.js';
import { eventLogger } from './EventLogger.js';

// Helper to access internal mock state exposed by the factory
const getMocks = () => {
  const d = db as unknown as {
    _mockInsert: ReturnType<typeof vi.fn>;
    _mockTrx: ReturnType<typeof vi.fn> & { _mockInsert: ReturnType<typeof vi.fn> };
    transaction: ReturnType<typeof vi.fn>;
  };
  return { mockInsert: d._mockInsert, mockTrx: d._mockTrx, transaction: d.transaction };
};

const baseRoom: GameRoom = {
  code: 'ABC123',
  name: 'Test stůl',
  status: 'LOBBY',
  hostId: 'host-1',
  isPublic: true,
  maxPlayers: 6,
  selectedSetIds: [1, 2],
  winCondition: 'score',
  targetScore: 8,
  targetRounds: 20,
  gameTimeLimit: 15,
  specialRules: [],
  players: [
    { id: 'p1', nickname: 'Alice', score: 0, isCardCzar: false, hasPlayed: false, tradedThisRound: false, isAfk: false, isOnline: true, socketId: null },
    { id: 'p2', nickname: 'Bob',   score: 0, isCardCzar: false, hasPlayed: false, tradedThisRound: false, isAfk: false, isOnline: true, socketId: null },
    { id: 'p3', nickname: 'Carol', score: 0, isCardCzar: false, hasPlayed: false, tradedThisRound: false, isAfk: false, isOnline: true, socketId: null },
  ],
  currentBlackCard: null,
  roundNumber: 0,
  roundDeadline: null,
  gameStartedAt: null,
  blackCardCandidates: null,
  lastActivityAt: Date.now(),
};

describe('EventLogger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const { mockInsert, mockTrx, transaction } = getMocks();
    mockInsert.mockResolvedValue([42]);
    // Restore transaction to its original working implementation (error tests mutate this)
    transaction.mockImplementation((cb: (trx: typeof mockTrx) => Promise<void>) => cb(mockTrx));
  });

  describe('logRoomCreated', () => {
    it('inserts into game_events with event_type room_created', async () => {
      const { mockInsert } = getMocks();
      await eventLogger.logRoomCreated(baseRoom, 'Alice');
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ event_type: 'room_created', room_code: 'ABC123' })
      );
    });

    it('inserts detail into game_event_room_created', async () => {
      const { mockInsert } = getMocks();
      await eventLogger.logRoomCreated(baseRoom, 'Alice');
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          event_id: 42,
          host_nickname: 'Alice',
          room_name: 'Test stůl',
          is_public: true,
          max_players: 6,
          win_condition: 'score',
          target_score: 8,
          target_rounds: 20,
          game_time_limit: 15,
          set_ids: JSON.stringify([1, 2]),
          special_rules: JSON.stringify([]),
        })
      );
    });

    it('does not throw on DB error', async () => {
      const { transaction } = getMocks();
      transaction.mockRejectedValueOnce(new Error('DB down'));
      await expect(eventLogger.logRoomCreated(baseRoom, 'Alice')).resolves.not.toThrow();
    });
  });

  describe('logSettingsUpdated', () => {
    it('inserts into game_events with event_type settings_updated', async () => {
      const { mockInsert } = getMocks();
      await eventLogger.logSettingsUpdated(baseRoom, 'Alice');
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ event_type: 'settings_updated', room_code: 'ABC123' })
      );
    });

    it('inserts changed_by and room settings into detail', async () => {
      const { mockInsert } = getMocks();
      await eventLogger.logSettingsUpdated(baseRoom, 'Alice');
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          event_id: 42,
          changed_by: 'Alice',
          room_name: 'Test stůl',
          is_public: true,
          max_players: 6,
          win_condition: 'score',
          target_score: 8,
          target_rounds: 20,
          game_time_limit: 15,
          set_ids: JSON.stringify([1, 2]),
          special_rules: JSON.stringify([]),
        })
      );
    });

    it('does not throw on DB error', async () => {
      const { transaction } = getMocks();
      transaction.mockRejectedValueOnce(new Error('DB down'));
      await expect(eventLogger.logSettingsUpdated(baseRoom, 'Alice')).resolves.not.toThrow();
    });
  });

  describe('logGameStarted', () => {
    it('inserts into game_events with event_type game_started', async () => {
      const { mockInsert } = getMocks();
      await eventLogger.logGameStarted(baseRoom);
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ event_type: 'game_started', room_code: 'ABC123' })
      );
    });

    it('inserts player_count and players JSON into detail', async () => {
      const { mockInsert } = getMocks();
      await eventLogger.logGameStarted(baseRoom);
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          event_id: 42,
          player_count: 3,
          players: JSON.stringify([{ nickname: 'Alice' }, { nickname: 'Bob' }, { nickname: 'Carol' }]),
        })
      );
    });

    it('excludes AFK players from player_count and players', async () => {
      const { mockInsert } = getMocks();
      const roomWithAfk = { ...baseRoom, players: [...baseRoom.players, { id: 'p4', nickname: 'Dave', score: 0, isCardCzar: false, hasPlayed: false, tradedThisRound: false, isAfk: true, isOnline: false, socketId: null }] };
      await eventLogger.logGameStarted(roomWithAfk);
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          player_count: 3,
          players: JSON.stringify([{ nickname: 'Alice' }, { nickname: 'Bob' }, { nickname: 'Carol' }]),
        })
      );
    });

    it('does not throw on DB error', async () => {
      const { transaction } = getMocks();
      transaction.mockRejectedValueOnce(new Error('DB down'));
      await expect(eventLogger.logGameStarted(baseRoom)).resolves.not.toThrow();
    });
  });
});
