import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from './GameEngine.js';
import type { Player, BlackCard, WhiteCard } from '@kpl/shared';

function makePlayer(id: string, nickname: string): Player {
  return { id, socketId: 'socket-' + id, nickname, score: 0, isCardCzar: false, hasPlayed: false, tradedThisRound: false, isAfk: false } as Player;
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

  // --- Reshuffle mechanic ---

  it('moves submitted cards to used pile and reshuffles when deck depletes', () => {
    // 3 players × 10 = 30 cards needed for first deal; deck has exactly 30
    // After round 1: 2 non-czar players each submit 1 card → 2 cards in usedPile
    // Round 2 needs to replenish 2 cards but deck is empty → must reshuffle
    const players3 = [makePlayer('a', 'A'), makePlayer('b', 'B'), makePlayer('c', 'C')];
    const eng = new GameEngine(players3, makeBlackCards(20), makeWhiteCards(30));
    eng.startRound();
    const nonCzars = players3.filter(p => !p.isCardCzar);
    for (const p of nonCzars) {
      eng.submitCards(p.id, [eng.getPlayerHand(p.id)[0].id]);
    }
    // Round 2: should NOT throw even though deck is exhausted
    expect(() => eng.startRound()).not.toThrow();
    // All non-AFK players should have hands replenished to 10
    for (const p of players3.filter(p => !p.isAfk)) {
      expect(eng.getPlayerHand(p.id)).toHaveLength(10);
    }
  });

  it('does not reshuffle when deck still has enough cards', () => {
    // 100 white cards for 3 players — deck will not deplete in one round
    const players3 = [makePlayer('a', 'A'), makePlayer('b', 'B'), makePlayer('c', 'C')];
    const eng = new GameEngine(players3, makeBlackCards(20), makeWhiteCards(100));
    eng.startRound();
    const nonCzars = players3.filter(p => !p.isCardCzar);
    for (const p of nonCzars) {
      eng.submitCards(p.id, [eng.getPlayerHand(p.id)[0].id]);
    }
    expect(() => eng.startRound()).not.toThrow();
    for (const p of players3) {
      expect(eng.getPlayerHand(p.id)).toHaveLength(10);
    }
  });

  describe('snapshot', () => {
    it('round-trips player hands and deck state', () => {
      engine.startRound();
      const nonCzars = players.filter(p => !p.isCardCzar);
      for (const p of nonCzars) {
        engine.submitCards(p.id, [engine.getPlayerHand(p.id)[0].id]);
      }

      const snap = engine.toSnapshot();
      const restored = GameEngine.fromSnapshot(snap, players);

      for (const p of players) {
        expect(restored.getPlayerHand(p.id)).toEqual(engine.getPlayerHand(p.id));
      }
      expect(restored.roundNumber).toBe(engine.roundNumber);
      expect(restored.currentBlackCard).toEqual(engine.currentBlackCard);
    });

    it('fromSnapshot engine can continue play — selectWinner works', () => {
      engine.startRound();
      const czar = players.find(p => p.isCardCzar)!;
      const nonCzars = players.filter(p => !p.isCardCzar);
      for (const p of nonCzars) {
        engine.submitCards(p.id, [engine.getPlayerHand(p.id)[0].id]);
      }

      const snap = engine.toSnapshot();
      const restored = GameEngine.fromSnapshot(snap, players);

      const subs = restored.getAnonymousSubmissions();
      const result = restored.selectWinner(czar.id, subs[0].submissionId);
      expect('error' in result).toBe(false);
    });
  });

  // --- tradeHand ---

  describe('tradeHand', () => {
    beforeEach(() => {
      // tradeHand requires rebooting_universe rule
      engine = new GameEngine(players, makeBlackCards(20), makeWhiteCards(100), ['rebooting_universe']);
    });

    it('returns error if player not found', () => {
      engine.startRound();
      const result = engine.tradeHand('nonexistent');
      expect(result).toHaveProperty('error');
    });

    it('returns error if player is card czar', () => {
      engine.startRound();
      const czar = players.find(p => p.isCardCzar)!;
      const result = engine.tradeHand(czar.id);
      expect(result).toHaveProperty('error');
    });

    it('returns error if player has already played', () => {
      engine.startRound();
      const nonCzar = players.find(p => !p.isCardCzar)!;
      const cardId = engine.getPlayerHand(nonCzar.id)[0].id;
      engine.submitCards(nonCzar.id, [cardId]);
      const result = engine.tradeHand(nonCzar.id);
      expect(result).toHaveProperty('error');
    });

    it('returns error if player score is 0', () => {
      engine.startRound();
      const nonCzar = players.find(p => !p.isCardCzar)!;
      nonCzar.score = 0;
      const result = engine.tradeHand(nonCzar.id);
      expect(result).toHaveProperty('error');
    });

    it('returns error if player already traded this round', () => {
      engine.startRound();
      const nonCzar = players.find(p => !p.isCardCzar)!;
      nonCzar.score = 2;
      engine.tradeHand(nonCzar.id); // první výměna OK
      const result = engine.tradeHand(nonCzar.id); // druhá — chyba
      expect(result).toHaveProperty('error');
    });

    it('deducts 1 point from player on successful trade', () => {
      engine.startRound();
      const nonCzar = players.find(p => !p.isCardCzar)!;
      nonCzar.score = 3;
      engine.tradeHand(nonCzar.id);
      expect(nonCzar.score).toBe(2);
    });

    it('returns new hand of 10 cards', () => {
      engine.startRound();
      const nonCzar = players.find(p => !p.isCardCzar)!;
      nonCzar.score = 1;
      const result = engine.tradeHand(nonCzar.id);
      expect('newHand' in result && result.newHand).toHaveLength(10);
    });

    it('new hand cards are different from old hand', () => {
      engine.startRound();
      const nonCzar = players.find(p => !p.isCardCzar)!;
      nonCzar.score = 1;
      const oldHand = engine.getPlayerHand(nonCzar.id).map(c => c.id);
      const result = engine.tradeHand(nonCzar.id) as { newHand: import('@kpl/shared').WhiteCard[] };
      const newIds = result.newHand.map(c => c.id);
      expect(newIds.some(id => !oldHand.includes(id))).toBe(true);
    });

    it('resets traded flag at start of new round', () => {
      engine.startRound();
      const nonCzar = players.find(p => !p.isCardCzar)!;
      nonCzar.score = 2;
      engine.tradeHand(nonCzar.id); // kolo 1 — vyměněno
      engine.startRound(); // kolo 2 — reset
      const nonCzar2 = players.find(p => !p.isCardCzar)!;
      nonCzar2.score = 1;
      const result = engine.tradeHand(nonCzar2.id);
      expect(result).not.toHaveProperty('error');
    });
  });
});

// --- specialRules: foundation ---

describe('specialRules', () => {
  let players: Player[];

  beforeEach(() => {
    players = [
      makePlayer('p1', 'Alice'),
      makePlayer('p2', 'Bob'),
      makePlayer('p3', 'Charlie'),
    ];
  });

  it('god_mode: czar is always host across multiple rounds', () => {
    const hostId = 'p1';
    const eng = new GameEngine(players, makeBlackCards(5), makeWhiteCards(50), [], hostId, 'god_mode');
    for (let i = 0; i < 3; i++) {
      eng.startRound();
      expect(players.find(p => p.isCardCzar)!.id).toBe(hostId);
    }
  });

  it('meritocracy: winner of round becomes czar next round', () => {
    const eng = new GameEngine(players, makeBlackCards(5), makeWhiteCards(50), [], 'p1', 'meritocracy');
    eng.startRound();
    const czar = players.find(p => p.isCardCzar)!;
    const nonCzarPlayers = players.filter(p => !p.isCardCzar);
    // Submit cards for all non-czar players
    for (const p of nonCzarPlayers) {
      eng.submitCards(p.id, [eng.getPlayerHand(p.id)[0].id]);
    }
    const subs = eng.getAnonymousSubmissions();
    // Select first submission's winner
    const winResult = eng.selectWinner(czar.id, subs[0].submissionId);
    expect('error' in winResult).toBe(false);
    const winnerId = (winResult as { winnerId: string }).winnerId;
    // Start next round — winner should be czar
    eng.startRound();
    expect(players.find(p => p.isCardCzar)!.id).toBe(winnerId);
  });

  it('rebooting_universe: tradeHand works when rule is active', () => {
    const eng = new GameEngine(players, makeBlackCards(5), makeWhiteCards(50), ['rebooting_universe'], 'p1');
    eng.startRound();
    const nonCzar = players.find(p => !p.isCardCzar)!;
    nonCzar.score = 2;
    const result = eng.tradeHand(nonCzar.id);
    expect('error' in result).toBe(false);
  });

  it('rebooting_universe: tradeHand blocked without rule', () => {
    const eng = new GameEngine(players, makeBlackCards(5), makeWhiteCards(50), [], 'p1');
    eng.startRound();
    const nonCzar = players.find(p => !p.isCardCzar)!;
    nonCzar.score = 2;
    const result = eng.tradeHand(nonCzar.id);
    expect('error' in result).toBe(true);
  });
});

// --- wheatons_law ---

describe('wheatons_law', () => {
  let players: Player[];

  beforeEach(() => {
    players = [
      makePlayer('p1', 'Alice'),
      makePlayer('p2', 'Bob'),
      makePlayer('p3', 'Charlie'),
    ];
  });

  it('startRound returns blackCardCandidates when rule active', () => {
    const eng = new GameEngine(players, makeBlackCards(10), makeWhiteCards(50), ['wheatons_law'], 'p1');
    const result = eng.startRound();
    expect(result.blackCardCandidates).toHaveLength(2);
    expect(eng.currentBlackCard).toBeNull();
  });

  it('chooseBlackCard sets currentBlackCard and clears candidates', () => {
    const eng = new GameEngine(players, makeBlackCards(10), makeWhiteCards(50), ['wheatons_law'], 'p1');
    const { czarId, blackCardCandidates } = eng.startRound();
    const chosen = blackCardCandidates![0];
    const result = eng.chooseBlackCard(czarId, chosen.id);
    expect('error' in result).toBe(false);
    expect(eng.currentBlackCard?.id).toBe(chosen.id);
    expect(eng.blackCardCandidates).toBeNull();
  });

  it('chooseBlackCard rejects non-czar', () => {
    const eng = new GameEngine(players, makeBlackCards(10), makeWhiteCards(50), ['wheatons_law'], 'p1');
    const { blackCardCandidates } = eng.startRound();
    const nonCzar = players.find(p => !p.isCardCzar)!;
    const result = eng.chooseBlackCard(nonCzar.id, blackCardCandidates![0].id);
    expect('error' in result).toBe(true);
  });

  it('without wheatons_law, startRound returns no candidates', () => {
    const eng = new GameEngine(players, makeBlackCards(10), makeWhiteCards(50), [], 'p1');
    const result = eng.startRound();
    expect(result.blackCardCandidates).toBeUndefined();
    expect(eng.currentBlackCard).not.toBeNull();
  });
});

// --- rando_cardrissian ---

describe('rando_cardrissian', () => {
  let players: Player[];

  beforeEach(() => {
    players = [
      makePlayer('p1', 'Alice'),
      makePlayer('p2', 'Bob'),
      makePlayer('p3', 'Charlie'),
    ];
  });

  it('startRound auto-submits a card for Rando', () => {
    const eng = new GameEngine(players, makeBlackCards(10), makeWhiteCards(50), ['rando_cardrissian'], 'p1');
    eng.startRound();
    const nonCzar = players.filter(p => !p.isCardCzar);
    for (const p of nonCzar) {
      eng.submitCards(p.id, [eng.getPlayerHand(p.id)[0].id]);
    }
    const subs = eng.getAnonymousSubmissions();
    // 2 normal non-czar players + 1 Rando
    expect(subs.length).toBe(3);
  });

  it('Rando submission has submissionId rando_cardrissian', () => {
    const eng = new GameEngine(players, makeBlackCards(10), makeWhiteCards(50), ['rando_cardrissian'], 'p1');
    eng.startRound();
    const nonCzar = players.filter(p => !p.isCardCzar);
    for (const p of nonCzar) {
      eng.submitCards(p.id, [eng.getPlayerHand(p.id)[0].id]);
    }
    const subs = eng.getAnonymousSubmissions();
    expect(subs.some(s => s.submissionId === 'rando_cardrissian')).toBe(true);
  });

  it('selectWinner with rando submissionId returns winnerId rando_cardrissian', () => {
    const eng = new GameEngine(players, makeBlackCards(10), makeWhiteCards(50), ['rando_cardrissian'], 'p1');
    eng.startRound();
    const nonCzar = players.filter(p => !p.isCardCzar);
    for (const p of nonCzar) {
      eng.submitCards(p.id, [eng.getPlayerHand(p.id)[0].id]);
    }
    const czar = players.find(p => p.isCardCzar)!;
    const result = eng.selectWinner(czar.id, 'rando_cardrissian');
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.winnerId).toBe('rando_cardrissian');
      // No real player gains a point
      expect(Object.values(result.scores).every(s => s === 0)).toBe(true);
    }
  });

  it('Rando win with meritocracy keeps the same czar next round', () => {
    const eng = new GameEngine(players, makeBlackCards(20), makeWhiteCards(100), ['rando_cardrissian'], 'p1', 'meritocracy');
    eng.startRound();
    const czarRound1 = players.find(p => p.isCardCzar)!;
    const nonCzar = players.filter(p => !p.isCardCzar);
    for (const p of nonCzar) eng.submitCards(p.id, [eng.getPlayerHand(p.id)[0].id]);
    eng.selectWinner(czarRound1.id, 'rando_cardrissian');

    eng.startRound();
    const czarRound2 = players.find(p => p.isCardCzar)!;
    expect(czarRound2.id).toBe(czarRound1.id);
  });
});

// --- high_stakes ---

describe('high_stakes', () => {
  let players: Player[];
  let eng: GameEngine;
  let nonCzar1: Player;
  let nonCzar2: Player;
  let czar: Player;

  beforeEach(() => {
    players = [
      makePlayer('p1', 'Alice'),
      makePlayer('p2', 'Bob'),
      makePlayer('p3', 'Charlie'),
    ];
    eng = new GameEngine(players, makeBlackCards(10), makeWhiteCards(50), ['high_stakes'], 'p1');
    eng.startRound();
    czar = players.find(p => p.isCardCzar)!;
    [nonCzar1, nonCzar2] = players.filter(p => !p.isCardCzar);
    nonCzar1.score = 3;
    nonCzar2.score = 2;
  });

  it('placeBet stores bet', () => {
    const result = eng.placeBet(nonCzar1.id, 2);
    expect('error' in result).toBe(false);
  });

  it('placeBet rejects bet > score', () => {
    const result = eng.placeBet(nonCzar1.id, 5);
    expect('error' in result).toBe(true);
  });

  it('placeBet rejects negative amount', () => {
    const result = eng.placeBet(nonCzar1.id, -1);
    expect('error' in result).toBe(true);
  });

  it('placeBet allows updating an existing bet', () => {
    eng.placeBet(nonCzar1.id, 2);
    const result = eng.placeBet(nonCzar1.id, 1);
    expect('error' in result).toBe(false);
  });

  it('winner gains bet points, loser loses them', () => {
    eng.placeBet(nonCzar1.id, 2); // bets 2
    eng.placeBet(nonCzar2.id, 1); // bets 1
    eng.submitCards(nonCzar1.id, [eng.getPlayerHand(nonCzar1.id)[0].id]);
    eng.submitCards(nonCzar2.id, [eng.getPlayerHand(nonCzar2.id)[0].id]);
    const subs = eng.getAnonymousSubmissions();
    const result = eng.selectWinner(czar.id, subs[0].submissionId);
    if ('error' in result) return;
    const winnerId = result.winnerId!;
    const loserId = winnerId === nonCzar1.id ? nonCzar2.id : nonCzar1.id;
    const winnerBet = winnerId === nonCzar1.id ? 2 : 1;
    const loserBet = loserId === nonCzar1.id ? 2 : 1;
    const winnerInitial = winnerId === nonCzar1.id ? 3 : 2;
    const loserInitial = loserId === nonCzar1.id ? 3 : 2;
    expect(result.scores[winnerId]).toBe(winnerInitial + 1 + winnerBet);
    expect(result.scores[loserId]).toBe(Math.max(0, loserInitial - loserBet));
  });
});

// --- czarMode ---

describe('czarMode', () => {
  let players: Player[];

  beforeEach(() => {
    players = [
      makePlayer('p1', 'Alice'),
      makePlayer('p2', 'Bob'),
      makePlayer('p3', 'Charlie'),
    ];
  });

  it('classic: rotates czar as usual', () => {
    const e = new GameEngine(players, makeBlackCards(20), makeWhiteCards(100), [], 'p1', 'classic');
    e.startRound();
    expect(players.filter(p => p.isCardCzar)).toHaveLength(1);
  });

  it('god_mode: host is always czar', () => {
    const e = new GameEngine(players, makeBlackCards(20), makeWhiteCards(100), [], 'p1', 'god_mode');
    e.startRound();
    expect(players.find(p => p.id === 'p1')?.isCardCzar).toBe(true);
    e.startRound();
    expect(players.find(p => p.id === 'p1')?.isCardCzar).toBe(true);
  });

  it('meritocracy: winner of last round becomes czar', () => {
    const e = new GameEngine(players, makeBlackCards(20), makeWhiteCards(100), [], 'p1', 'meritocracy');
    e.startRound();
    // set last round winner manually
    (e as any).lastRoundWinnerId = 'p2';
    e.startRound();
    expect(players.find(p => p.id === 'p2')?.isCardCzar).toBe(true);
  });

  it('czar_is_dead: no player gets isCardCzar=true', () => {
    const e = new GameEngine(players, makeBlackCards(20), makeWhiteCards(100), [], 'p1', 'czar_is_dead');
    e.startRound();
    expect(players.filter(p => p.isCardCzar)).toHaveLength(0);
  });

  it('czar_is_dead: all players can submit cards', () => {
    const e = new GameEngine(players, makeBlackCards(20), makeWhiteCards(100), [], 'p1', 'czar_is_dead');
    e.startRound();
    for (const p of players) {
      const cardId = e.getPlayerHand(p.id)[0].id;
      const result = e.submitCards(p.id, [cardId]);
      expect(result).toEqual({ ok: true, allSubmitted: expect.any(Boolean) });
    }
  });
});

describe('czar_is_dead voting', () => {
  let players: Player[];
  let engine: GameEngine;

  beforeEach(() => {
    players = [
      makePlayer('p1', 'Alice'),
      makePlayer('p2', 'Bob'),
      makePlayer('p3', 'Charlie'),
    ];
    engine = new GameEngine(players, makeBlackCards(20), makeWhiteCards(100), [], 'p1', 'czar_is_dead');
    engine.startRound();
    // submit cards for all players
    for (const p of players) {
      const cardId = engine.getPlayerHand(p.id)[0].id;
      engine.submitCards(p.id, [cardId]);
    }
  });

  it('castVote: player can vote for another submission', () => {
    const p1Sub = (engine as any).submissions.get('p1');
    // find a submission not owned by p1
    const p2Sub = (engine as any).submissions.get('p2');
    const result = engine.castVote('p1', p2Sub.submissionId);
    expect(result).toEqual({ ok: true, allVoted: false });
  });

  it('castVote: player cannot vote for own submission', () => {
    const ownSub = (engine as any).submissions.get('p1');
    const result = engine.castVote('p1', ownSub.submissionId);
    expect('error' in result).toBe(true);
  });

  it('resolveVotes: winner has most votes', () => {
    const p3Sub = (engine as any).submissions.get('p3');
    engine.castVote('p1', p3Sub.submissionId);
    engine.castVote('p2', p3Sub.submissionId);
    const result = engine.resolveVotes();
    expect(result.winnerIds).toEqual(['p3']);
    const p3 = players.find(p => p.id === 'p3')!;
    expect(p3.score).toBe(1);
  });

  it('resolveVotes: tie gives all tied players +1', () => {
    const p2Sub = (engine as any).submissions.get('p2');
    const p3Sub = (engine as any).submissions.get('p3');
    // p1 votes for p2, p2 votes for p3 → tie (1 each)
    engine.castVote('p1', p2Sub.submissionId);
    engine.castVote('p2', p3Sub.submissionId);
    const result = engine.resolveVotes();
    expect(result.winnerIds).toHaveLength(2);
    expect(result.winnerIds).toContain('p2');
    expect(result.winnerIds).toContain('p3');
    const p2 = players.find(p => p.id === 'p2')!;
    const p3 = players.find(p => p.id === 'p3')!;
    expect(p2.score).toBe(1);
    expect(p3.score).toBe(1);
  });

  it('resolveVotes: no votes → no winner, winnerIds empty', () => {
    const result = engine.resolveVotes();
    expect(result.winnerIds).toEqual([]);
    expect(result.winnerId).toBeNull();
  });
});
