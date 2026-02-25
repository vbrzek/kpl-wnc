import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from './GameEngine.js';
import type { Player, BlackCard, WhiteCard } from '@kpl/shared';

function makePlayer(id: string, nickname: string): Player {
  return { id, socketId: 'socket-' + id, nickname, score: 0, isCardCzar: false, hasPlayed: false, isAfk: false };
}

function makeBlackCards(n: number, pick = 1): BlackCard[] {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, text: `Black ${i + 1} ____`, pick }));
}

function makeWhiteCards(n: number): WhiteCard[] {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, text: `White ${i + 1}` }));
}

describe('GameEngine', () => {
  let players: Player[];
  let engine: GameEngine;

  beforeEach(() => {
    players = [
      makePlayer('p1', 'Alice'),
      makePlayer('p2', 'Bob'),
      makePlayer('p3', 'Charlie'),
    ];
    engine = new GameEngine(players, makeBlackCards(20), makeWhiteCards(100));
  });

  // --- startRound ---

  it('deals 10 white cards to each player on first round', () => {
    engine.startRound();
    for (const p of players) {
      expect(engine.getPlayerHand(p.id)).toHaveLength(10);
    }
  });

  it('sets currentBlackCard after startRound', () => {
    engine.startRound();
    expect(engine.currentBlackCard).not.toBeNull();
  });

  it('sets exactly one player as czar after startRound', () => {
    engine.startRound();
    expect(players.filter(p => p.isCardCzar)).toHaveLength(1);
  });

  it('increments roundNumber on each startRound', () => {
    expect(engine.roundNumber).toBe(0);
    engine.startRound();
    expect(engine.roundNumber).toBe(1);
    engine.startRound();
    expect(engine.roundNumber).toBe(2);
  });

  it('round-robin: czar is different player on second round', () => {
    engine.startRound();
    const czar1 = players.find(p => p.isCardCzar)!.id;
    engine.startRound();
    const czar2 = players.find(p => p.isCardCzar)!.id;
    expect(czar1).not.toBe(czar2);
  });

  it('round-robin: skips AFK players when choosing czar', () => {
    players[1].isAfk = true; // Bob je AFK
    engine.startRound();
    engine.startRound();
    const czar2 = players.find(p => p.isCardCzar)!;
    expect(czar2.id).not.toBe('p2');
  });

  it('replenishes hand back to 10 cards on next round after submission', () => {
    engine.startRound();
    const nonCzar = players.find(p => !p.isCardCzar)!;
    const cardId = engine.getPlayerHand(nonCzar.id)[0].id;
    engine.submitCards(nonCzar.id, [cardId]);
    engine.startRound();
    expect(engine.getPlayerHand(nonCzar.id)).toHaveLength(10);
  });

  // --- submitCards ---

  it('returns allSubmitted=false when only one non-czar player submitted', () => {
    engine.startRound();
    const nonCzar = players.filter(p => !p.isCardCzar)[0];
    const result = engine.submitCards(nonCzar.id, [engine.getPlayerHand(nonCzar.id)[0].id]);
    expect(result).toEqual(expect.objectContaining({ ok: true, allSubmitted: false }));
  });

  it('returns allSubmitted=true when all non-czar players submitted', () => {
    engine.startRound();
    const nonCzars = players.filter(p => !p.isCardCzar);
    let last: ReturnType<typeof engine.submitCards> | undefined;
    for (const p of nonCzars) {
      last = engine.submitCards(p.id, [engine.getPlayerHand(p.id)[0].id]);
    }
    expect(last).toEqual(expect.objectContaining({ ok: true, allSubmitted: true }));
  });

  it('returns error when czar tries to play cards', () => {
    engine.startRound();
    const czar = players.find(p => p.isCardCzar)!;
    const result = engine.submitCards(czar.id, [engine.getPlayerHand(czar.id)[0].id]);
    expect(result).toHaveProperty('error');
  });

  it('returns error when player submits twice in one round', () => {
    engine.startRound();
    const nonCzar = players.find(p => !p.isCardCzar)!;
    const firstCard = engine.getPlayerHand(nonCzar.id)[0].id;
    engine.submitCards(nonCzar.id, [firstCard]);
    // Re-fetch hand after first submission to avoid relying on internal mutability
    const secondCard = engine.getPlayerHand(nonCzar.id)[0].id;
    const result = engine.submitCards(nonCzar.id, [secondCard]);
    expect(result).toHaveProperty('error');
  });

  it('returns error for card not in hand', () => {
    engine.startRound();
    const nonCzar = players.find(p => !p.isCardCzar)!;
    const result = engine.submitCards(nonCzar.id, [99999]);
    expect(result).toHaveProperty('error');
  });


  // --- retractCards ---

  it('returns cards to hand after retract', () => {
    engine.startRound();
    const nonCzar = players.find(p => !p.isCardCzar)!;
    const cardId = engine.getPlayerHand(nonCzar.id)[0].id;
    engine.submitCards(nonCzar.id, [cardId]);
    expect(engine.getPlayerHand(nonCzar.id)).toHaveLength(9);
    engine.retractCards(nonCzar.id);
    expect(engine.getPlayerHand(nonCzar.id)).toHaveLength(10);
  });

  it('resets hasPlayed to false after retract', () => {
    engine.startRound();
    const nonCzar = players.find(p => !p.isCardCzar)!;
    const cardId = engine.getPlayerHand(nonCzar.id)[0].id;
    engine.submitCards(nonCzar.id, [cardId]);
    expect(nonCzar.hasPlayed).toBe(true);
    engine.retractCards(nonCzar.id);
    expect(nonCzar.hasPlayed).toBe(false);
  });

  it('allows resubmission after retract', () => {
    engine.startRound();
    const nonCzar = players.find(p => !p.isCardCzar)!;
    const originalCardId = engine.getPlayerHand(nonCzar.id)[0].id;
    engine.submitCards(nonCzar.id, [originalCardId]);
    engine.retractCards(nonCzar.id);
    const newCardId = engine.getPlayerHand(nonCzar.id)[0].id;
    const result = engine.submitCards(nonCzar.id, [newCardId]);
    expect(result).toEqual(expect.objectContaining({ ok: true }));
  });

  it('returns error when retracting without having submitted', () => {
    engine.startRound();
    const nonCzar = players.find(p => !p.isCardCzar)!;
    const result = engine.retractCards(nonCzar.id);
    expect(result).toHaveProperty('error');
  });

  it('retract preserves submissions of other players', () => {
    engine.startRound();
    const nonCzars = players.filter(p => !p.isCardCzar);
    const p1 = nonCzars[0];
    engine.submitCards(p1.id, [engine.getPlayerHand(p1.id)[0].id]);
    const p2 = nonCzars[1];
    engine.submitCards(p2.id, [engine.getPlayerHand(p2.id)[0].id]);
    engine.retractCards(p1.id);
    expect(p2.hasPlayed).toBe(true);
  });

  // --- getAnonymousSubmissions ---

  it('returns submissions without playerId, with submissionId', () => {
    engine.startRound();
    const nonCzars = players.filter(p => !p.isCardCzar);
    for (const p of nonCzars) {
      engine.submitCards(p.id, [engine.getPlayerHand(p.id)[0].id]);
    }
    const subs = engine.getAnonymousSubmissions();
    expect(subs).toHaveLength(nonCzars.length);
    for (const s of subs) {
      expect(s).toHaveProperty('submissionId');
      expect(s).toHaveProperty('cards');
      expect(s).not.toHaveProperty('playerId');
    }
  });

  // --- selectWinner ---

  it('increments winner score by 1', () => {
    engine.startRound();
    const nonCzars = players.filter(p => !p.isCardCzar);
    for (const p of nonCzars) {
      engine.submitCards(p.id, [engine.getPlayerHand(p.id)[0].id]);
    }
    const czar = players.find(p => p.isCardCzar)!;
    const subs = engine.getAnonymousSubmissions();
    const result = engine.selectWinner(czar.id, subs[0].submissionId);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.scores[result.winnerId]).toBe(1);
    }
  });

  it('returns error for invalid submissionId', () => {
    engine.startRound();
    const nonCzars = players.filter(p => !p.isCardCzar);
    for (const p of nonCzars) {
      engine.submitCards(p.id, [engine.getPlayerHand(p.id)[0].id]);
    }
    const czar = players.find(p => p.isCardCzar)!;
    const result = engine.selectWinner(czar.id, 'neexistujici-id');
    expect(result).toHaveProperty('error');
  });

  it('returns error when caller is not the czar', () => {
    engine.startRound();
    const nonCzars = players.filter(p => !p.isCardCzar);
    for (const p of nonCzars) {
      engine.submitCards(p.id, [engine.getPlayerHand(p.id)[0].id]);
    }
    const subs = engine.getAnonymousSubmissions();
    const result = engine.selectWinner(nonCzars[0].id, subs[0].submissionId);
    expect(result).toHaveProperty('error');
  });
});
