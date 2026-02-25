import { randomUUID } from 'crypto';
import type { BlackCard, WhiteCard, Player, AnonymousSubmission, RoundResult } from '@kpl/shared';

const HAND_SIZE = 10;

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

  currentBlackCard: BlackCard | null = null;
  roundNumber = 0;

  constructor(
    // Player objects are shared references with GameRoom.players.
    // Mutations here (score, isCardCzar, hasPlayed) propagate to RoomManager by design.
    private players: Player[],
    blackCards: BlackCard[],
    whiteCards: WhiteCard[],
  ) {
    this.blackDeck = shuffle([...blackCards]);
    this.whiteDeck = shuffle([...whiteCards]);
  }

  startRound(): { czarId: string } {
    this.roundNumber++;
    this.submissions.clear();

    for (const p of this.players) {
      p.hasPlayed = false;
      p.isCardCzar = false;
    }

    const blackCard = this.blackDeck.pop();
    if (!blackCard) throw new Error('Došly černé karty.');
    this.currentBlackCard = blackCard;

    for (const p of this.players.filter(p => !p.isAfk)) {
      const hand = this.playerHands.get(p.id) ?? [];
      while (hand.length < HAND_SIZE) {
        const card = this.whiteDeck.pop();
        if (!card) break;
        hand.push(card);
      }
      this.playerHands.set(p.id, hand);
    }

    const czar = this.pickNextCzar();
    czar.isCardCzar = true;
    return { czarId: czar.id };
  }

  private pickNextCzar(): Player {
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

  getAnonymousSubmissions(): AnonymousSubmission[] {
    const result = Array.from(this.submissions.values()).map(
      ({ submissionId, cards }) => ({ submissionId, cards }),
    );
    return shuffle(result);
  }

  selectWinner(
    czarId: string,
    submissionId: string,
  ): RoundResult | { error: string } {
    const czar = this.players.find(p => p.id === czarId);
    if (!czar?.isCardCzar) return { error: 'Nejsi Card Czar.' };

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

    const scores: Record<string, number> = {};
    for (const p of this.players) scores[p.id] = p.score;

    return { winnerId, winnerNickname: winner.nickname, winningCards, scores };
  }

  getPlayerHand(playerId: string): WhiteCard[] {
    return [...(this.playerHands.get(playerId) ?? [])];
  }
}
