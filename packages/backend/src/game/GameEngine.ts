import { randomUUID } from 'crypto';
import type { BlackCard, WhiteCard, Player, AnonymousSubmission, RoundResult, SpecialRule } from '@kpl/shared';

const HAND_SIZE = 10;

export interface EngineSnapshot {
  blackDeck: BlackCard[];
  whiteDeck: WhiteCard[];
  playerHands: Record<string, WhiteCard[]>;
  submissions: Record<string, { submissionId: string; cards: WhiteCard[] }>;
  czarPointer: number;
  usedWhiteCards: WhiteCard[];
  roundNumber: number;
  tradedThisRound: string[];
  currentBlackCard: BlackCard | null;
  specialRules: SpecialRule[];
  hostId: string;
  lastRoundWinnerId: string | null;
  blackCardCandidates: BlackCard[] | null;
  randoSubmission: { submissionId: 'rando_cardrissian'; cards: WhiteCard[] } | null;
  bets: Record<string, number>;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export class GameEngine {
  private blackDeck: BlackCard[];
  private whiteDeck: WhiteCard[];
  private playerHands = new Map<string, WhiteCard[]>();
  private submissions = new Map<string, { submissionId: string; cards: WhiteCard[] }>();
  private czarPointer = -1;
  private usedWhiteCards: WhiteCard[] = [];
  private tradedThisRound = new Set<string>();
  private specialRules: Set<SpecialRule>;
  private hostId: string;
  private lastRoundWinnerId: string | null = null;
  public blackCardCandidates: BlackCard[] | null = null;
  public static readonly RANDO_ID = 'rando_cardrissian';
  private randoSubmission: { submissionId: 'rando_cardrissian'; cards: WhiteCard[] } | null = null;
  private bets = new Map<string, number>();

  currentBlackCard: BlackCard | null = null;
  roundNumber = 0;

  constructor(
    // Player objects are shared references with GameRoom.players.
    // Mutations here (score, isCardCzar, hasPlayed) propagate to RoomManager by design.
    private players: Player[],
    blackCards: BlackCard[],
    whiteCards: WhiteCard[],
    specialRules: SpecialRule[] = [],
    hostId: string = '',
  ) {
    this.blackDeck = shuffle([...blackCards]);
    this.whiteDeck = shuffle([...whiteCards]);
    this.specialRules = new Set(specialRules);
    this.hostId = hostId;
  }

  hasRule(rule: SpecialRule): boolean {
    return this.specialRules.has(rule);
  }

  startRound(): { czarId: string; blackCardCandidates?: BlackCard[] } {
    this.roundNumber++;
    this.randoSubmission = null;
    this.bets.clear();

    // Move last round's submitted cards to the used pile before clearing
    for (const sub of this.submissions.values()) {
      this.usedWhiteCards.push(...sub.cards);
    }
    this.submissions.clear();
    this.tradedThisRound.clear();

    for (const p of this.players) {
      p.hasPlayed = false;
      p.isCardCzar = false;
      p.tradedThisRound = false;
    }

    const blackCard = this.blackDeck.pop();
    if (!blackCard) throw new Error('Došly černé karty.');

    for (const p of this.players.filter(p => !p.isAfk)) {
      const hand = this.playerHands.get(p.id) ?? [];
      while (hand.length < HAND_SIZE) {
        // Reshuffle used cards into deck if current deck is empty
        if (this.whiteDeck.length === 0 && this.usedWhiteCards.length > 0) {
          this.whiteDeck = shuffle(this.usedWhiteCards);
          this.usedWhiteCards = [];
        }
        const card = this.whiteDeck.pop();
        if (!card) break;
        hand.push(card);
      }
      this.playerHands.set(p.id, hand);
    }

    const czar = this.pickNextCzar();
    czar.isCardCzar = true;

    // Rando Cardrissian: auto-submit random cards
    if (this.specialRules.has('rando_cardrissian')) {
      if (this.whiteDeck.length === 0 && this.usedWhiteCards.length > 0) {
        this.whiteDeck = shuffle(this.usedWhiteCards);
        this.usedWhiteCards = [];
      }
      const randoCards: WhiteCard[] = [];
      for (let i = 0; i < (blackCard.pick ?? 1); i++) {
        const card = this.whiteDeck.pop();
        if (card) randoCards.push(card);
      }
      if (randoCards.length > 0) {
        this.randoSubmission = { submissionId: 'rando_cardrissian', cards: randoCards };
      }
    }

    // Wheaton's Law: czar picks from 2 black card candidates
    if (this.specialRules.has('wheatons_law')) {
      const candidate2 = this.blackDeck.pop();
      if (!candidate2) throw new Error('Došly černé karty.');
      this.blackCardCandidates = [blackCard, candidate2];
      this.currentBlackCard = null;
      return { czarId: czar.id, blackCardCandidates: this.blackCardCandidates };
    }

    this.currentBlackCard = blackCard;
    this.blackCardCandidates = null;
    return { czarId: czar.id };
  }

  private pickNextCzar(): Player {
    // god_mode: host is always czar
    if (this.specialRules.has('god_mode')) {
      const host = this.players.find(p => p.id === this.hostId && !p.isAfk);
      if (host) { this.czarPointer = this.players.indexOf(host); return host; }
    }
    // meritocracy: winner of last round becomes czar
    if (this.specialRules.has('meritocracy') && this.lastRoundWinnerId) {
      const winner = this.players.find(p => p.id === this.lastRoundWinnerId && !p.isAfk);
      if (winner) { this.czarPointer = this.players.indexOf(winner); return winner; }
    }
    // default rotation
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const idx = (this.czarPointer + i) % n;
      if (!this.players[idx].isAfk) {
        this.czarPointer = idx;
        return this.players[idx];
      }
    }
    throw new Error('Žádní aktivní hráči.');
  }

  submitCards(
    playerId: string,
    cardIds: number[],
  ): { ok: true; allSubmitted: boolean } | { error: string } {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return { error: 'Hráč nenalezen.' };
    if (player.isCardCzar) return { error: 'Card Czar nemůže hrát karty.' };
    if (player.hasPlayed) return { error: 'Již jsi odeslal karty v tomto kole.' };
    if (!this.currentBlackCard) return { error: 'Žádná aktivní černá karta.' };

    const required = this.currentBlackCard.pick;
    if (cardIds.length !== required) {
      return { error: `Musíš vybrat přesně ${required} karet.` };
    }

    const hand = this.playerHands.get(playerId) ?? [];
    const selectedCards: WhiteCard[] = [];
    for (const id of cardIds) {
      const idx = hand.findIndex(c => c.id === id);
      if (idx === -1) return { error: 'Karta není v tvé ruce.' };
      selectedCards.push(hand.splice(idx, 1)[0]);
    }
    this.playerHands.set(playerId, hand);

    this.submissions.set(playerId, { submissionId: randomUUID(), cards: selectedCards });
    player.hasPlayed = true;

    const nonCzarActive = this.players.filter(p => !p.isAfk && !p.isCardCzar);
    const allSubmitted = nonCzarActive.every(p => p.hasPlayed);
    return { ok: true, allSubmitted };
  }


  retractCards(playerId: string): { ok: true } | { error: string } {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return { error: 'Hráč nenalezen.' };
    if (!player.hasPlayed) return { error: 'Dosud jsi žádné karty neodeslal.' };

    const submission = this.submissions.get(playerId);
    if (!submission) return { error: 'Odeslání nebylo nalezeno.' };

    const hand = this.playerHands.get(playerId) ?? [];
    hand.push(...submission.cards);
    this.playerHands.set(playerId, hand);
    this.submissions.delete(playerId);

    player.hasPlayed = false;
    return { ok: true };
  }

  tradeHand(playerId: string): { ok: true; newHand: WhiteCard[] } | { error: string } {
    if (!this.specialRules.has('rebooting_universe')) {
      return { error: 'Pravidlo Rebooting the Universe není aktivní.' };
    }
    const player = this.players.find(p => p.id === playerId);
    if (!player) return { error: 'Hráč nenalezen.' };
    if (player.isCardCzar) return { error: 'Card Czar nemůže vyměňovat karty.' };
    if (player.hasPlayed) return { error: 'Nelze vyměnit karty po odevzdání.' };
    if (player.score < 1) return { error: 'Nemáš dostatek bodů pro výměnu karet.' };
    if (this.tradedThisRound.has(playerId)) return { error: 'V tomto kole jsi už karty vyměnil.' };

    const oldHand = this.playerHands.get(playerId) ?? [];
    this.usedWhiteCards.push(...oldHand);
    this.playerHands.set(playerId, []);

    const newHand: WhiteCard[] = [];
    while (newHand.length < HAND_SIZE) {
      if (this.whiteDeck.length === 0 && this.usedWhiteCards.length > 0) {
        this.whiteDeck = shuffle(this.usedWhiteCards);
        this.usedWhiteCards = [];
      }
      const card = this.whiteDeck.pop();
      if (!card) break;
      newHand.push(card);
    }
    this.playerHands.set(playerId, newHand);
    player.score--;
    this.tradedThisRound.add(playerId);
    player.tradedThisRound = true;
    return { ok: true, newHand: [...newHand] };
  }

  chooseBlackCard(czarId: string, cardId: number): { ok: true } | { error: string } {
    const czar = this.players.find(p => p.id === czarId);
    if (!czar?.isCardCzar) return { error: 'Nejsi Card Czar.' };
    if (!this.blackCardCandidates) return { error: 'Není aktivní výběr černé karty.' };

    const chosen = this.blackCardCandidates.find(c => c.id === cardId);
    if (!chosen) return { error: 'Neplatná černá karta.' };

    // Return rejected card to deck
    const rejected = this.blackCardCandidates.find(c => c.id !== cardId)!;
    this.blackDeck.unshift(rejected);

    this.currentBlackCard = chosen;
    this.blackCardCandidates = null;
    return { ok: true };
  }

  placeBet(playerId: string, amount: number): { ok: true } | { error: string } {
    if (!this.specialRules.has('high_stakes')) return { error: 'Pravidlo High Stakes není aktivní.' };
    const player = this.players.find(p => p.id === playerId);
    if (!player) return { error: 'Hráč nenalezen.' };
    if (player.isCardCzar) return { error: 'Card Czar nemůže sázet.' };
    if (amount < 0) return { error: 'Sázka nesmí být záporná.' };
    if (amount > player.score) return { error: 'Nemáš dostatek bodů pro tuto sázku.' };
    if (this.bets.has(playerId)) return { error: 'Už jsi v tomto kole sázku podal.' };
    this.bets.set(playerId, amount);
    return { ok: true };
  }

  getAnonymousSubmissions(): AnonymousSubmission[] {
    const result = Array.from(this.submissions.values()).map(
      ({ submissionId, cards }) => ({ submissionId, cards }),
    );
    if (this.randoSubmission) {
      result.push({ submissionId: this.randoSubmission.submissionId, cards: this.randoSubmission.cards });
    }
    return shuffle(result);
  }

  selectWinner(
    czarId: string,
    submissionId: string,
  ): RoundResult | { error: string } {
    const czar = this.players.find(p => p.id === czarId);
    if (!czar?.isCardCzar) return { error: 'Nejsi Card Czar.' };

    // Rando Cardrissian win
    if (submissionId === GameEngine.RANDO_ID && this.randoSubmission) {
      const scores: Record<string, number> = {};
      for (const p of this.players) scores[p.id] = p.score;
      this.lastRoundWinnerId = czar.id; // Rando won → meritocracy keeps the same czar
      return {
        winnerId: GameEngine.RANDO_ID,
        winnerNickname: 'Rando Cardrissian',
        winningCards: this.randoSubmission.cards,
        scores,
      };
    }

    let winnerId: string | null = null;
    let winningCards: WhiteCard[] = [];
    for (const [pid, sub] of this.submissions.entries()) {
      if (sub.submissionId === submissionId) {
        winnerId = pid;
        winningCards = sub.cards;
        break;
      }
    }
    if (!winnerId) return { error: 'Neplatné ID submise.' };

    const winner = this.players.find(p => p.id === winnerId)!;
    winner.score++;

    // High Stakes: apply bets
    if (this.specialRules.has('high_stakes')) {
      for (const [pid, bet] of this.bets.entries()) {
        const betPlayer = this.players.find(p => p.id === pid);
        if (!betPlayer) continue;
        if (pid === winnerId) {
          betPlayer.score += bet;
        } else {
          betPlayer.score = Math.max(0, betPlayer.score - bet);
        }
      }
    }

    const scores: Record<string, number> = {};
    for (const p of this.players) scores[p.id] = p.score;

    this.lastRoundWinnerId = winnerId;

    return { winnerId, winnerNickname: winner.nickname, winningCards, scores };
  }

  getPlayerHand(playerId: string): WhiteCard[] {
    return [...(this.playerHands.get(playerId) ?? [])];
  }

  toSnapshot(): EngineSnapshot {
    return {
      blackDeck: [...this.blackDeck],
      whiteDeck: [...this.whiteDeck],
      playerHands: Object.fromEntries(
        Array.from(this.playerHands.entries()).map(([k, v]) => [k, [...v]])
      ),
      submissions: Object.fromEntries(this.submissions),
      czarPointer: this.czarPointer,
      usedWhiteCards: [...this.usedWhiteCards],
      roundNumber: this.roundNumber,
      tradedThisRound: Array.from(this.tradedThisRound),
      currentBlackCard: this.currentBlackCard,
      specialRules: Array.from(this.specialRules),
      hostId: this.hostId,
      lastRoundWinnerId: this.lastRoundWinnerId,
      blackCardCandidates: this.blackCardCandidates,
      randoSubmission: this.randoSubmission,
      bets: Object.fromEntries(this.bets),
    };
  }

  static fromSnapshot(snap: EngineSnapshot, players: Player[]): GameEngine {
    // Prázdné decky — hned přepíšeme ze snapshotu
    const engine = new GameEngine(players, [], [], snap.specialRules ?? [], snap.hostId ?? '');
    engine.blackDeck = snap.blackDeck;
    engine.whiteDeck = snap.whiteDeck;
    engine.playerHands = new Map(Object.entries(snap.playerHands));
    engine.submissions = new Map(Object.entries(snap.submissions));
    engine.czarPointer = snap.czarPointer;
    engine.usedWhiteCards = snap.usedWhiteCards;
    engine.roundNumber = snap.roundNumber;
    engine.tradedThisRound = new Set(snap.tradedThisRound ?? []);
    engine.currentBlackCard = snap.currentBlackCard;
    engine.lastRoundWinnerId = snap.lastRoundWinnerId ?? null;
    engine.blackCardCandidates = snap.blackCardCandidates ?? null;
    engine.randoSubmission = snap.randoSubmission ?? null;
    engine.bets = new Map(Object.entries(snap.bets ?? {}));
    return engine;
  }
}
