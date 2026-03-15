import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GameOverPayload } from '@kpl/shared';

vi.mock('../db/db.js', () => {
  const fn = vi.fn();
  (fn as any).raw = vi.fn();
  return { default: fn };
});

import db from '../db/db.js';
const mockDb = db as unknown as ReturnType<typeof vi.fn> & { raw: ReturnType<typeof vi.fn> };

import { awardTrophies } from './trophyService.js';

function makePayload(scores: Array<{ id: string; score: number }>): GameOverPayload {
  return {
    roomCode: 'ABCDEF',
    finalScores: scores.map((s, i) => ({
      playerId: s.id,
      nickname: `Player ${i + 1}`,
      avatarUrl: null,
      score: s.score,
      rank: i + 1,
    })),
  };
}

function makeTokenMap(playerIds: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const id of playerIds) {
    map.set(id, `token-${id}`);
  }
  return map;
}

describe('trophyService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockDb.raw.mockReturnValue(Promise.resolve());
  });

  it('returns empty object when roundNumber < 10', async () => {
    const result = await awardTrophies(makePayload([
      { id: 'p1', score: 10 },
      { id: 'p2', score: 5 },
      { id: 'p3', score: 3 },
    ]), 9, makeTokenMap(['p1', 'p2', 'p3']));

    expect(result).toEqual({});
    expect(mockDb).not.toHaveBeenCalled();
  });

  it('returns empty object when fewer than 3 players', async () => {
    const result = await awardTrophies(makePayload([
      { id: 'p1', score: 10 },
      { id: 'p2', score: 5 },
    ]), 12, makeTokenMap(['p1', 'p2']));

    expect(result).toEqual({});
  });

  it('awards 5/1/0 for 3 players (all OAuth)', async () => {
    const payload = makePayload([
      { id: 'p1', score: 10 },
      { id: 'p2', score: 5 },
      { id: 'p3', score: 3 },
    ]);

    mockDb.mockReturnValue({
      whereIn: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue([
        { user_id: 101, player_token: 'token-p1' },
        { user_id: 102, player_token: 'token-p2' },
        { user_id: 103, player_token: 'token-p3' },
      ]),
    });

    const result = await awardTrophies(payload, 12, makeTokenMap(['p1', 'p2', 'p3']));

    expect(result).toEqual({ p1: 5, p2: 1 });
    // p3 gets 0, so not included
    expect(mockDb.raw).toHaveBeenCalledTimes(2);
  });

  it('awards 5/3/1 for 4+ players (all OAuth)', async () => {
    const payload = makePayload([
      { id: 'p1', score: 10 },
      { id: 'p2', score: 7 },
      { id: 'p3', score: 5 },
      { id: 'p4', score: 2 },
    ]);

    mockDb.mockReturnValue({
      whereIn: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue([
        { user_id: 101, player_token: 'token-p1' },
        { user_id: 102, player_token: 'token-p2' },
        { user_id: 103, player_token: 'token-p3' },
        { user_id: 104, player_token: 'token-p4' },
      ]),
    });

    const result = await awardTrophies(payload, 15, makeTokenMap(['p1', 'p2', 'p3', 'p4']));

    expect(result).toEqual({ p1: 5, p2: 3, p3: 1 });
    expect(mockDb.raw).toHaveBeenCalledTimes(3);
  });

  it('handles tie at 2nd-3rd place (4+ players)', async () => {
    const payload = makePayload([
      { id: 'p1', score: 10 },
      { id: 'p2', score: 5 },
      { id: 'p3', score: 5 },
      { id: 'p4', score: 2 },
    ]);

    mockDb.mockReturnValue({
      whereIn: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue([
        { user_id: 101, player_token: 'token-p1' },
        { user_id: 102, player_token: 'token-p2' },
        { user_id: 103, player_token: 'token-p3' },
        { user_id: 104, player_token: 'token-p4' },
      ]),
    });

    const result = await awardTrophies(payload, 10, makeTokenMap(['p1', 'p2', 'p3', 'p4']));

    // Tie at 2nd-3rd: floor((3+1)/2) = 2 each
    expect(result).toEqual({ p1: 5, p2: 2, p3: 2 });
  });

  it('handles tie at 1st place (4+ players)', async () => {
    const payload = makePayload([
      { id: 'p1', score: 10 },
      { id: 'p2', score: 10 },
      { id: 'p3', score: 5 },
      { id: 'p4', score: 2 },
    ]);

    mockDb.mockReturnValue({
      whereIn: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue([
        { user_id: 101, player_token: 'token-p1' },
        { user_id: 102, player_token: 'token-p2' },
        { user_id: 103, player_token: 'token-p3' },
        { user_id: 104, player_token: 'token-p4' },
      ]),
    });

    const result = await awardTrophies(payload, 10, makeTokenMap(['p1', 'p2', 'p3', 'p4']));

    // Tie at 1st-2nd: floor((5+3)/2) = 4 each; 3rd gets 1
    expect(result).toEqual({ p1: 4, p2: 4, p3: 1 });
  });

  it('skips non-OAuth players (no user_player_tokens row)', async () => {
    const payload = makePayload([
      { id: 'p1', score: 10 },
      { id: 'p2', score: 5 },
      { id: 'p3', score: 3 },
    ]);

    // Only p1 is an OAuth user
    mockDb.mockReturnValue({
      whereIn: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue([
        { user_id: 101, player_token: 'token-p1' },
      ]),
    });

    const result = await awardTrophies(payload, 10, makeTokenMap(['p1', 'p2', 'p3']));

    expect(result).toEqual({ p1: 5 });
    expect(mockDb.raw).toHaveBeenCalledTimes(1);
  });

  it('returns empty when no OAuth players found', async () => {
    const payload = makePayload([
      { id: 'p1', score: 10 },
      { id: 'p2', score: 5 },
      { id: 'p3', score: 3 },
    ]);

    mockDb.mockReturnValue({
      whereIn: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue([]),
    });

    const result = await awardTrophies(payload, 10, makeTokenMap(['p1', 'p2', 'p3']));

    expect(result).toEqual({});
    expect(mockDb.raw).not.toHaveBeenCalled();
  });
});
