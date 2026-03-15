import db from '../db/db.js';
import type { GameOverPayload } from '@kpl/shared';

interface TrophyConfig {
  threePlayer: [number, number, number];
  fourPlusPlayer: [number, number, number];
}

const TROPHY_DISTRIBUTION: TrophyConfig = {
  threePlayer: [5, 1, 0],
  fourPlusPlayer: [5, 3, 1],
};

const MIN_ROUNDS = 10;

export async function awardTrophies(
  payload: GameOverPayload,
  roundNumber: number,
  playerTokenMap: Map<string, string>,
): Promise<Record<string, number>> {
  if (roundNumber < MIN_ROUNDS) return {};

  const playerCount = payload.finalScores.length;
  if (playerCount < 3) return {};

  const distribution = playerCount === 3
    ? TROPHY_DISTRIBUTION.threePlayer
    : TROPHY_DISTRIBUTION.fourPlusPlayer;

  // Resolve user_ids for OAuth players via their playerTokens
  const tokenToPlayerId = new Map<string, string>();
  for (const score of payload.finalScores) {
    const token = playerTokenMap.get(score.playerId);
    if (token) tokenToPlayerId.set(token, score.playerId);
  }

  const tokens = [...tokenToPlayerId.keys()];
  if (tokens.length === 0) return {};

  const userTokenRows = await db('user_player_tokens')
    .whereIn('player_token', tokens)
    .where('room_code', payload.roomCode)
    .select('user_id', 'player_token');

  const playerIdToUserId = new Map<string, number>();
  for (const row of userTokenRows) {
    const playerId = tokenToPlayerId.get(row.player_token);
    if (playerId) playerIdToUserId.set(playerId, row.user_id);
  }

  if (playerIdToUserId.size === 0) return {};

  // Calculate trophies with tie handling
  const trophiesAwarded: Record<string, number> = {};
  const scores = payload.finalScores;

  let i = 0;
  while (i < scores.length) {
    // Find all players sharing this rank
    const currentScore = scores[i].score;
    let j = i;
    while (j < scores.length && scores[j].score === currentScore) {
      j++;
    }
    const tiedCount = j - i;

    // Sum up trophy slots for the tied positions (0-indexed: rank 1 = index 0)
    let totalTrophies = 0;
    for (let k = i; k < j; k++) {
      if (k < 3) totalTrophies += distribution[k];
    }
    const perPlayer = Math.floor(totalTrophies / tiedCount);

    // Award to each tied player (only OAuth ones)
    for (let k = i; k < j; k++) {
      const playerId = scores[k].playerId;
      if (perPlayer > 0 && playerIdToUserId.has(playerId)) {
        trophiesAwarded[playerId] = perPlayer;
      }
    }

    i = j;
  }

  // Write to DB
  const writes = Object.entries(trophiesAwarded)
    .map(([playerId, amount]) => {
      const userId = playerIdToUserId.get(playerId)!;
      return db.raw(
        'INSERT INTO user_trophies (user_id, trophies) VALUES (?, ?) ON DUPLICATE KEY UPDATE trophies = trophies + ?, updated_at = NOW()',
        [userId, amount, amount],
      );
    });

  await Promise.all(writes);

  return trophiesAwarded;
}
