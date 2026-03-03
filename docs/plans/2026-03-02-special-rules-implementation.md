# Special Rules (House Rules Packages) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implementovat 6 volitelných balíčků speciálních pravidel (Rando Cardrissian, God Mode, Wheaton's Law, Rebooting the Universe, Meritocracy, High Stakes) s výběrem při vytváření stolu.

**Architecture:** `SpecialRule` typ v shared; `specialRules: SpecialRule[]` a `blackCardCandidates: BlackCard[] | null` na `GameRoom`; `GameEngine` dostane pravidla v konstruktoru a implementuje každé pravidlo jako guard/override v příslušné metodě; nová Socket.io events pro Wheaton's Law (`game:chooseBlackCard`) a High Stakes (`game:placeBet`); CreateTableModal rozšíří na 2-krokový (mobil) / 2-sloupcový (desktop) layout.

**Tech Stack:** TypeScript, Vitest (backend testy), Vue 3 Composition API, Tailwind v4, Zod (validace), Socket.io

---

## Task 1: Shared types — SpecialRule + GameRoom rozšíření

**Files:**
- Modify: `packages/shared/src/index.ts`

**Step 1: Přidej `SpecialRule` typ a rozšiř `GameRoom`, `PublicRoomSummary` a Socket events**

V `packages/shared/src/index.ts` přidej za `export type GameStatus`:

```ts
export type SpecialRule =
  | 'rando_cardrissian'
  | 'god_mode'
  | 'wheatons_law'
  | 'rebooting_universe'
  | 'meritocracy'
  | 'high_stakes';
```

Do `GameRoom` přidej dvě pole za `targetScore`:
```ts
specialRules: SpecialRule[];              // [] = žádná speciální pravidla
blackCardCandidates: BlackCard[] | null;  // Wheaton's Law: czar vybírá černou kartu
```

Do `PublicRoomSummary` přidej:
```ts
specialRules: SpecialRule[];
```

Do `ServerToClientEvents` přidej:
```ts
'game:blackCardCandidates': (cards: BlackCard[]) => void;
```

Do `ClientToServerEvents` přidej:
```ts
'game:chooseBlackCard': (cardId: number) => void;
'game:placeBet': (amount: number, callback: (result: { ok: true } | { error: string }) => void) => void;
```

Do `lobby:create` settings přidej `specialRules: SpecialRule[]`.
Do `lobby:updateSettings` settings přidej `specialRules?: SpecialRule[]`.

**Step 2: Build shared balíčku**

```bash
cd /Users/wanacu/Documents/www/kpl-wnc
npm run build --workspace=packages/shared
```

Očekávané: build proběhne bez chyb (TypeScript kompilace).

**Step 3: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): add SpecialRule type, extend GameRoom + socket events"
```

---

## Task 2: Backend — Zod validace pro specialRules

**Files:**
- Modify: `packages/backend/src/socket/validation.ts`

**Step 1: Přidej `SpecialRuleSchema` a rozšiř existující schémata**

Za existující importy přidej:
```ts
import type { SpecialRule } from '@kpl/shared';

const VALID_RULES: SpecialRule[] = [
  'rando_cardrissian', 'god_mode', 'wheatons_law',
  'rebooting_universe', 'meritocracy', 'high_stakes',
];

const specialRules = z.array(z.enum(VALID_RULES as [SpecialRule, ...SpecialRule[]])).default([]);
```

V `CreateRoomSchema` přidej pole `specialRules`:
```ts
specialRules,
```

V `UpdateSettingsSchema` přidej:
```ts
specialRules: specialRules.optional(),
```

Přidej nová schémata:
```ts
export const ChooseBlackCardSchema = z.number().int().positive();
export const PlaceBetSchema = z.number().int().min(0).max(100);
```

**Step 2: Spusť existující testy**

```bash
npm test --workspace=packages/backend
```

Očekávané: 71 testů pass (žádné nebyly rozbity).

**Step 3: Commit**

```bash
git add packages/backend/src/socket/validation.ts
git commit -m "feat(backend): add specialRules validation schemas"
```

---

## Task 3: Backend — RoomManager rozšíření

**Files:**
- Modify: `packages/backend/src/game/RoomManager.ts`
- Test: `packages/backend/src/game/RoomManager.test.ts`

**Step 1: Napiš failing testy**

V `RoomManager.test.ts` přidej describe blok `'specialRules'`:
```ts
describe('specialRules', () => {
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
```

**Step 2: Spusť testy (musí selhat)**

```bash
npm test --workspace=packages/backend -- --reporter=verbose 2>&1 | head -30
```

Očekávané: FAIL — `specialRules` property chybí.

**Step 3: Implementace v RoomManager.ts**

Přidej `specialRules` do `CreateRoomSettings`:
```ts
export interface CreateRoomSettings {
  name: string;
  isPublic: boolean;
  selectedSetIds: number[];
  maxPlayers: number;
  nickname: string;
  targetScore: number;
  specialRules: SpecialRule[];
}
```

Přidej do `UpdateSettingsData`:
```ts
specialRules?: SpecialRule[];
```

V `createRoom()` — do `room` objektu přidej:
```ts
specialRules: settings.specialRules,
blackCardCandidates: null,
```

V `updateSettings()` přidej podmínku:
```ts
if (settings.specialRules !== undefined) room.specialRules = settings.specialRules;
```

V `getPublicRooms()` přidej `specialRules: room.specialRules` do objektu v `result.push({...})`.

V `finishGame()` — reset místnosti přidej:
```ts
room.specialRules = room.specialRules; // zachová pravidla pro příští hru
room.blackCardCandidates = null;
```

Import `SpecialRule` z `@kpl/shared` v hlavičce souboru.

**Step 4: Spusť testy**

```bash
npm test --workspace=packages/backend
```

Očekávané: 71 + 3 nové = 74 testů pass.

**Step 5: Commit**

```bash
git add packages/backend/src/game/RoomManager.ts packages/backend/src/game/RoomManager.test.ts
git commit -m "feat(backend): RoomManager supports specialRules"
```

---

## Task 4: GameEngine — foundation + jednoduché rules

**Files:**
- Modify: `packages/backend/src/game/GameEngine.ts`
- Test: `packages/backend/src/game/GameEngine.test.ts`

### 4a: Konstruktor + god_mode + meritocracy + rebooting_universe gate

**Step 1: Napiš failing testy**

```ts
describe('specialRules', () => {
  it('god_mode: czar is always host across multiple rounds', () => {
    const hostId = 'p1';
    const eng = new GameEngine(players, makeBlackCards(5), makeWhiteCards(50), ['god_mode'], hostId);
    for (let i = 0; i < 3; i++) {
      eng.startRound();
      expect(players.find(p => p.isCardCzar)!.id).toBe(hostId);
    }
  });

  it('meritocracy: winner of round becomes czar next round', () => {
    const eng = new GameEngine(players, makeBlackCards(5), makeWhiteCards(50), ['meritocracy'], 'p1');
    eng.startRound();
    // p2 je czar, p1 a p3 hrají
    const nonCzar = players.filter(p => !p.isCardCzar);
    for (const p of nonCzar) {
      eng.submitCards(p.id, [eng.getPlayerHand(p.id)[0].id]);
    }
    const subs = eng.getAnonymousSubmissions();
    // p1 wins
    const p1SubId = subs.find(s => {
      // findByPlayerId is not exposed, so we check via selectWinner result
      const res = eng.selectWinner(players.find(p => p.isCardCzar)!.id, s.submissionId);
      if ('error' in res) return false;
      return res.winnerId === 'p1';
    })?.submissionId;
    if (p1SubId) {
      eng.selectWinner(players.find(p => p.isCardCzar)!.id, p1SubId);
    }
    eng.startRound();
    expect(players.find(p => p.isCardCzar)!.id).toBe('p1');
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
```

**Step 2: Spusť testy (musí selhat)**

```bash
npm test --workspace=packages/backend -- --reporter=verbose 2>&1 | grep -E "FAIL|PASS|✓|✗" | head -20
```

**Step 3: Implementace**

Změny v `GameEngine.ts`:

Přidej import:
```ts
import type { SpecialRule } from '@kpl/shared';
```

Přidej private pole:
```ts
private specialRules: Set<SpecialRule>;
private hostId: string;
private lastRoundWinnerId: string | null = null;
```

Uprav konstruktor:
```ts
constructor(
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
```

Uprav `pickNextCzar()`:
```ts
private pickNextCzar(): Player {
  // god_mode: host je vždy czar
  if (this.specialRules.has('god_mode')) {
    const host = this.players.find(p => p.id === this.hostId && !p.isAfk);
    if (host) { this.czarPointer = this.players.indexOf(host); return host; }
  }
  // meritocracy: vítěz minulého kola se stane czarem
  if (this.specialRules.has('meritocracy') && this.lastRoundWinnerId) {
    const winner = this.players.find(p => p.id === this.lastRoundWinnerId && !p.isAfk);
    if (winner) { this.czarPointer = this.players.indexOf(winner); return winner; }
  }
  // defaultní rotace
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
```

Na začátek `tradeHand()` přidej guard:
```ts
if (!this.specialRules.has('rebooting_universe')) {
  return { error: 'Pravidlo Rebooting the Universe není aktivní.' };
}
```

V `selectWinner()` — před `return { winnerId, ... }` přidej:
```ts
this.lastRoundWinnerId = winnerId;
```

Přidej helper metodu:
```ts
hasRule(rule: SpecialRule): boolean {
  return this.specialRules.has(rule);
}
```

Přidej `lastRoundWinnerId` do `EngineSnapshot` a `toSnapshot()`/`fromSnapshot()`:
```ts
// v EngineSnapshot interface:
lastRoundWinnerId: string | null;

// v toSnapshot():
lastRoundWinnerId: this.lastRoundWinnerId,

// v fromSnapshot():
engine.lastRoundWinnerId = snap.lastRoundWinnerId ?? null;
```

**Step 4: Spusť testy**

```bash
npm test --workspace=packages/backend
```

Očekávané: 74 + nové testy pass.

**Step 5: Commit**

```bash
git add packages/backend/src/game/GameEngine.ts packages/backend/src/game/GameEngine.test.ts
git commit -m "feat(backend): GameEngine supports god_mode, meritocracy, rebooting_universe"
```

---

## Task 5: GameEngine — Wheaton's Law

**Files:**
- Modify: `packages/backend/src/game/GameEngine.ts`
- Test: `packages/backend/src/game/GameEngine.test.ts`

**Step 1: Napiš failing testy**

```ts
describe('wheatons_law', () => {
  it('startRound returns blackCardCandidates when rule active', () => {
    const eng = new GameEngine(players, makeBlackCards(10), makeWhiteCards(50), ['wheatons_law'], 'p1');
    const result = eng.startRound();
    expect(result.blackCardCandidates).toHaveLength(2);
    expect(eng.currentBlackCard).toBeNull(); // ještě není vybráno
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
```

**Step 2: Spusť testy (musí selhat)**

```bash
npm test --workspace=packages/backend -- --reporter=verbose 2>&1 | grep -E "wheatons" | head -10
```

**Step 3: Implementace**

Přidej public pole `blackCardCandidates: BlackCard[] | null = null` do třídy.

Uprav návratový typ `startRound()`:
```ts
startRound(): { czarId: string; blackCardCandidates?: BlackCard[] }
```

Na konec `startRound()` — místo přímého nastavení černé karty:
```ts
// Wheaton's Law: vytáhni 2 kandidáty, nechej czara vybrat
if (this.specialRules.has('wheatons_law')) {
  const candidate2 = this.blackDeck.pop();
  if (!candidate2) throw new Error('Došly černé karty.');
  this.blackCardCandidates = [blackCard, candidate2];
  this.currentBlackCard = null; // ještě není vybráno
  return { czarId: czar.id, blackCardCandidates: this.blackCardCandidates };
}

this.currentBlackCard = blackCard;
this.blackCardCandidates = null;
return { czarId: czar.id };
```

Přidej novou metodu `chooseBlackCard()`:
```ts
chooseBlackCard(czarId: string, cardId: number): { ok: true } | { error: string } {
  const czar = this.players.find(p => p.id === czarId);
  if (!czar?.isCardCzar) return { error: 'Nejsi Card Czar.' };
  if (!this.blackCardCandidates) return { error: 'Není aktivní výběr černé karty.' };

  const chosen = this.blackCardCandidates.find(c => c.id === cardId);
  if (!chosen) return { error: 'Neplatná černá karta.' };

  // Vrať nevybranou kartu zpět do balíčku
  const rejected = this.blackCardCandidates.find(c => c.id !== cardId)!;
  this.blackDeck.unshift(rejected); // na konec (bude posledním vytaženým)

  this.currentBlackCard = chosen;
  this.blackCardCandidates = null;
  return { ok: true };
}
```

Přidej `blackCardCandidates` do `EngineSnapshot` a `toSnapshot()`/`fromSnapshot()`.

**Step 4: Spusť testy**

```bash
npm test --workspace=packages/backend
```

Očekávané: všechny testy pass.

**Step 5: Commit**

```bash
git add packages/backend/src/game/GameEngine.ts packages/backend/src/game/GameEngine.test.ts
git commit -m "feat(backend): GameEngine implements Wheaton's Law (blackCardCandidates)"
```

---

## Task 6: GameEngine — Rando Cardrissian

**Files:**
- Modify: `packages/backend/src/game/GameEngine.ts`
- Test: `packages/backend/src/game/GameEngine.test.ts`

**Step 1: Napiš failing testy**

```ts
describe('rando_cardrissian', () => {
  it('startRound auto-submits a card for Rando', () => {
    const eng = new GameEngine(players, makeBlackCards(10), makeWhiteCards(50), ['rando_cardrissian'], 'p1');
    eng.startRound();
    const subs = eng.getAnonymousSubmissions();
    // 3 hráči minus czar = 2 normální, + 1 Rando
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
      // Žádný hráč nezískal bod
      expect(Object.values(result.scores).every(s => s === 0)).toBe(true);
    }
  });
});
```

**Step 2: Spusť testy (musí selhat)**

```bash
npm test --workspace=packages/backend -- --reporter=verbose 2>&1 | grep -E "rando" | head -10
```

**Step 3: Implementace**

Přidej private pole:
```ts
public static readonly RANDO_ID = 'rando_cardrissian';
private randoSubmission: { submissionId: 'rando_cardrissian'; cards: WhiteCard[] } | null = null;
```

Na konec `startRound()` (po rozdání karet, před return) — přidej rando logiku:
```ts
// Rando Cardrissian: auto-submit náhodné karty
if (this.specialRules.has('rando_cardrissian')) {
  if (this.whiteDeck.length === 0 && this.usedWhiteCards.length > 0) {
    this.whiteDeck = shuffle(this.usedWhiteCards);
    this.usedWhiteCards = [];
  }
  const randoCards: WhiteCard[] = [];
  for (let i = 0; i < (this.currentBlackCard?.pick ?? 1); i++) {
    const card = this.whiteDeck.pop();
    if (card) randoCards.push(card);
  }
  if (randoCards.length > 0) {
    this.randoSubmission = { submissionId: 'rando_cardrissian', cards: randoCards };
  }
}
```

V `getAnonymousSubmissions()` — za sestavením `result`:
```ts
if (this.randoSubmission) {
  result.push({ submissionId: this.randoSubmission.submissionId, cards: this.randoSubmission.cards });
}
return shuffle(result);
```

V `selectWinner()` — před hledáním winnerId v submissions:
```ts
// Rando Cardrissian výhra
if (submissionId === 'rando_cardrissian' && this.randoSubmission) {
  const scores: Record<string, number> = {};
  for (const p of this.players) scores[p.id] = p.score;
  this.lastRoundWinnerId = null; // Rando vyhrál → meritocracy fallback na rotaci
  return {
    winnerId: 'rando_cardrissian',
    winnerNickname: 'Rando Cardrissian',
    winningCards: this.randoSubmission.cards,
    scores,
  };
}
```

V `startRound()` — na začátku metody:
```ts
this.randoSubmission = null;
```

Přidej `randoSubmission` do `EngineSnapshot`:
```ts
randoSubmission: { submissionId: 'rando_cardrissian'; cards: WhiteCard[] } | null;
```

**Step 4: Spusť testy**

```bash
npm test --workspace=packages/backend
```

Očekávané: všechny testy pass.

**Step 5: Commit**

```bash
git add packages/backend/src/game/GameEngine.ts packages/backend/src/game/GameEngine.test.ts
git commit -m "feat(backend): GameEngine implements Rando Cardrissian"
```

---

## Task 7: GameEngine — High Stakes (sázky)

**Files:**
- Modify: `packages/backend/src/game/GameEngine.ts`
- Test: `packages/backend/src/game/GameEngine.test.ts`

**Step 1: Napiš failing testy**

```ts
describe('high_stakes', () => {
  let eng: GameEngine;
  let nonCzar1: Player;
  let nonCzar2: Player;
  let czar: Player;

  beforeEach(() => {
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

  it('winner gains bet points, loser loses them', () => {
    eng.placeBet(nonCzar1.id, 2); // vsadí 2
    eng.placeBet(nonCzar2.id, 1); // vsadí 1
    eng.submitCards(nonCzar1.id, [eng.getPlayerHand(nonCzar1.id)[0].id]);
    eng.submitCards(nonCzar2.id, [eng.getPlayerHand(nonCzar2.id)[0].id]);
    const subs = eng.getAnonymousSubmissions();
    // Najdi nonCzar1 submision
    // Musíme otestovat přes scores — winner dostane +1 (base) + bet, ostatní -bet
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
```

**Step 2: Spusť testy (musí selhat)**

```bash
npm test --workspace=packages/backend -- --reporter=verbose 2>&1 | grep -E "high_stakes" | head -10
```

**Step 3: Implementace**

Přidej private pole:
```ts
private bets = new Map<string, number>(); // playerId → vsazené body
```

Přidej novou metodu `placeBet()`:
```ts
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
```

V `selectWinner()` — za `winner.score++` přidej logiku sázek:
```ts
// High Stakes: aplikuj sázky
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
```

V `startRound()` — na začátku:
```ts
this.bets.clear();
```

Přidej `bets` do `EngineSnapshot`:
```ts
bets: Record<string, number>;
```

Do `toSnapshot()`:
```ts
bets: Object.fromEntries(this.bets),
```

Do `fromSnapshot()`:
```ts
engine.bets = new Map(Object.entries(snap.bets ?? {}));
```

**Step 4: Spusť testy**

```bash
npm test --workspace=packages/backend
```

Očekávané: všechny testy pass.

**Step 5: Commit**

```bash
git add packages/backend/src/game/GameEngine.ts packages/backend/src/game/GameEngine.test.ts
git commit -m "feat(backend): GameEngine implements High Stakes (bets)"
```

---

## Task 8: Backend — Socket handlers aktualizace

**Files:**
- Modify: `packages/backend/src/socket/lobbyHandlers.ts`
- Modify: `packages/backend/src/socket/roundUtils.ts`
- Modify: `packages/backend/src/socket/gameHandlers.ts`

**Step 1: lobbyHandlers.ts — předej specialRules + hostId do GameEngine**

V `lobby:startGame` handleru najdi řádek:
```ts
engine = new GameEngine(room.players, blackCards, whiteCards);
```
Změň na:
```ts
engine = new GameEngine(room.players, blackCards, whiteCards, room.specialRules, room.hostId);
```

**Step 2: roundUtils.ts — Wheaton's Law flow v startNewRound**

Aktualizuj `startNewRound()` tak, aby po `engine.startRound()` zkontroloval, zda jsou `blackCardCandidates`:

```ts
export function startNewRound(room: GameRoom, engine: GameEngine, io: IO): void {
  const roomCode = room.code;
  roomManager.clearAllGameTimers(roomCode);

  for (const player of room.players) {
    if (player.isAfk && player.socketId !== null) player.isAfk = false;
  }

  const { czarId, blackCardCandidates } = engine.startRound();
  room.status = 'SELECTION';
  room.roundNumber = engine.roundNumber;

  // Wheaton's Law: čeká se na výběr černé karty czarem
  if (blackCardCandidates) {
    room.currentBlackCard = null;
    room.blackCardCandidates = blackCardCandidates;
    room.roundDeadline = null;
    io.to(`room:${roomCode}`).emit('lobby:stateUpdate', toPublicRoom(room));
    // Pošli kandidáty pouze czarovi
    const czar = room.players.find(p => p.id === czarId);
    if (czar?.socketId) {
      const czarSocket = io.sockets.sockets.get(czar.socketId);
      if (czarSocket) czarSocket.emit('game:blackCardCandidates', blackCardCandidates);
    }
    return; // deadline a game:roundStart se odešlou až po chooseBlackCard
  }

  // Normální flow
  room.currentBlackCard = engine.currentBlackCard;
  room.blackCardCandidates = null;
  room.roundDeadline = Date.now() + SELECTION_TIMEOUT_MS;

  io.to(`room:${roomCode}`).emit('lobby:stateUpdate', toPublicRoom(room));

  for (const player of room.players) {
    if (!player.socketId) continue;
    const playerSocket = io.sockets.sockets.get(player.socketId);
    if (playerSocket) {
      playerSocket.emit('game:roundStart', {
        blackCard: engine.currentBlackCard!,
        hand: engine.getPlayerHand(player.id),
        czarId,
        roundNumber: engine.roundNumber,
      });
    }
  }

  roomManager.setRoundTimer(roomCode, () => {}, SELECTION_TIMEOUT_MS);
}

export function finalizeRoundStart(room: GameRoom, engine: GameEngine, io: IO): void {
  const roomCode = room.code;
  const czarId = room.players.find(p => p.isCardCzar)?.id ?? '';
  room.blackCardCandidates = null;
  room.currentBlackCard = engine.currentBlackCard;
  room.roundDeadline = Date.now() + SELECTION_TIMEOUT_MS;

  io.to(`room:${roomCode}`).emit('lobby:stateUpdate', toPublicRoom(room));

  for (const player of room.players) {
    if (!player.socketId) continue;
    const playerSocket = io.sockets.sockets.get(player.socketId);
    if (playerSocket) {
      playerSocket.emit('game:roundStart', {
        blackCard: engine.currentBlackCard!,
        hand: engine.getPlayerHand(player.id),
        czarId,
        roundNumber: engine.roundNumber,
      });
    }
  }

  roomManager.setRoundTimer(roomCode, () => {}, SELECTION_TIMEOUT_MS);
}
```

**Step 3: gameHandlers.ts — přidej game:chooseBlackCard a game:placeBet**

Na konec `registerGameHandlers()` přidej:

```ts
// Czar vybírá černou kartu (Wheaton's Law)
socket.on('game:chooseBlackCard', (cardId) => {
  const playerToken = socketToToken.get(socket.id);
  if (!playerToken) return;

  const room = roomManager.getRoomByPlayerToken(playerToken);
  if (!room || room.status !== 'SELECTION' || !room.blackCardCandidates) {
    socket.emit('game:error', 'Výběr černé karty není aktuálně možný.');
    return;
  }

  const engine = roomManager.getGameEngine(room.code);
  if (!engine) { socket.emit('game:error', 'Herní engine nenalezen.'); return; }

  const czarId = roomManager.getPlayerIdByToken(playerToken)!;
  const id = validate(ChooseBlackCardSchema, cardId);
  if (!id) { socket.emit('game:error', 'Neplatné ID karty.'); return; }

  const result = engine.chooseBlackCard(czarId, id);
  if ('error' in result) { socket.emit('game:error', result.error); return; }

  roomManager.updateActivity(room.code);
  finalizeRoundStart(room, engine, io);
});

// Hráč sází body (High Stakes)
socket.on('game:placeBet', (amount, callback) => {
  const playerToken = socketToToken.get(socket.id);
  if (!playerToken) { callback({ error: 'Nejsi přihlášen.' }); return; }

  const room = roomManager.getRoomByPlayerToken(playerToken);
  if (!room || room.status !== 'SELECTION') {
    callback({ error: 'Sázky jsou možné jen ve fázi výběru karet.' });
    return;
  }

  const engine = roomManager.getGameEngine(room.code);
  if (!engine) { callback({ error: 'Herní engine nenalezen.' }); return; }

  const bet = validate(PlaceBetSchema, amount, callback);
  if (bet === null) return;

  const playerId = roomManager.getPlayerIdByToken(playerToken)!;
  const result = engine.placeBet(playerId, bet);
  if ('error' in result) { callback(result); return; }

  callback({ ok: true });
});
```

Přidej importy `ChooseBlackCardSchema`, `PlaceBetSchema`, `finalizeRoundStart`.

**Step 4: Spusť testy**

```bash
npm test --workspace=packages/backend
```

Očekávané: všechny testy pass.

**Step 5: Commit**

```bash
git add packages/backend/src/socket/lobbyHandlers.ts packages/backend/src/socket/roundUtils.ts packages/backend/src/socket/gameHandlers.ts
git commit -m "feat(backend): socket handlers for specialRules (chooseBlackCard, placeBet, Wheaton's Law flow)"
```

---

## Task 9: Frontend — SpecialRulesPanel komponenta

**Files:**
- Create: `packages/frontend/src/components/SpecialRulesPanel.vue`

**Step 1: Vytvoř komponentu**

```vue
<script setup lang="ts">
import type { SpecialRule } from '@kpl/shared';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  modelValue: SpecialRule[];
  readonly?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [rules: SpecialRule[]] }>();

const { t } = useI18n();

interface RuleInfo {
  id: SpecialRule;
  icon: string;
}

const RULES: RuleInfo[] = [
  { id: 'rando_cardrissian', icon: '🎲' },
  { id: 'god_mode', icon: '👑' },
  { id: 'wheatons_law', icon: '🃏' },
  { id: 'rebooting_universe', icon: '♻️' },
  { id: 'meritocracy', icon: '🏆' },
  { id: 'high_stakes', icon: '💰' },
];

function toggle(id: SpecialRule) {
  if (props.readonly) return;
  const current = new Set(props.modelValue);
  if (current.has(id)) current.delete(id);
  else current.add(id);
  emit('update:modelValue', Array.from(current));
}

function isActive(id: SpecialRule) {
  return props.modelValue.includes(id);
}
</script>

<template>
  <div class="space-y-2">
    <button
      v-for="rule in RULES"
      :key="rule.id"
      type="button"
      :disabled="readonly"
      @click="toggle(rule.id)"
      :class="[
        'w-full text-left px-4 py-3 rounded-xl border transition-all',
        isActive(rule.id)
          ? 'bg-yellow-400/10 border-yellow-400/40 text-white'
          : 'bg-slate-900/40 border-white/5 text-slate-400',
        !readonly && 'hover:border-white/20 cursor-pointer',
        readonly && 'cursor-default',
      ]"
    >
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-lg shrink-0">{{ rule.icon }}</span>
          <div class="min-w-0">
            <div class="text-sm font-bold truncate">{{ t(`specialRules.${rule.id}.name`) }}</div>
            <div class="text-xs text-slate-500 mt-0.5 leading-snug">{{ t(`specialRules.${rule.id}.desc`) }}</div>
          </div>
        </div>
        <div
          v-if="!readonly"
          :class="[
            'shrink-0 w-10 h-6 rounded-full transition-colors flex items-center',
            isActive(rule.id) ? 'bg-yellow-400' : 'bg-slate-700',
          ]"
        >
          <div :class="[
            'w-4 h-4 rounded-full bg-white shadow transition-transform mx-1',
            isActive(rule.id) ? 'translate-x-4' : 'translate-x-0',
          ]" />
        </div>
        <span v-else-if="isActive(rule.id)" class="shrink-0 text-xs font-bold text-yellow-400 uppercase tracking-widest">
          {{ t('specialRules.active') }}
        </span>
      </div>
    </button>
  </div>
</template>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/SpecialRulesPanel.vue
git commit -m "feat(frontend): add SpecialRulesPanel component"
```

---

## Task 10: Frontend — i18n překlady

**Files:**
- Modify: `packages/frontend/src/i18n/locales/cs.json`
- Modify: `packages/frontend/src/i18n/locales/en.json`

**Step 1: Přidej klíče do cs.json**

Přidej objekt `"specialRules"` (vyhledej konec souboru):
```json
"specialRules": {
  "active": "Aktivní",
  "button": "Rozšířená pravidla",
  "rando_cardrissian": {
    "name": "Rando Cardrissian",
    "desc": "Bot přidává náhodnou bílou kartu do každého kola. Pokud vyhraje, všichni prohrají."
  },
  "god_mode": {
    "name": "God Mode",
    "desc": "Hostitel zůstává Czarem po celou dobu hry a ostatní ho baví."
  },
  "wheatons_law": {
    "name": "Wheaton's Law",
    "desc": "Před každým kolem si Card Czar vybere, která ze dvou černých karet se bude hrát."
  },
  "rebooting_universe": {
    "name": "Rebooting the Universe",
    "desc": "Hráč může zahodit celou ruku a dobrat 10 nových karet za cenu 1 bodu."
  },
  "meritocracy": {
    "name": "Meritocracy",
    "desc": "Czarem se vždy stává vítěz minulého kola. Pokud vyhraje Rando, czar zůstane stejný."
  },
  "high_stakes": {
    "name": "High Stakes",
    "desc": "Před výběrem karty lze vsadit body. Výhra přináší vsazené body navíc, prohra je bere."
  },
  "randoWon": "Rando Cardrissian vyhrál — všichni prohráli!",
  "czarPicksBlackCard": "Card Czar vybírá černou kartu...",
  "pickBlackCardTitle": "Vyber černou kartu pro toto kolo",
  "placeBet": "Vsadit body",
  "betLabel": "Vaše sázka",
  "betConfirm": "Potvrdit sázku",
  "betPlaced": "Sázka {amount} bodů uložena"
}
```

**Step 2: Přidej klíče do en.json** (stejná struktura, přeložené hodnoty):
```json
"specialRules": {
  "active": "Active",
  "button": "House Rules",
  "rando_cardrissian": {
    "name": "Rando Cardrissian",
    "desc": "A bot randomly plays a white card each round. If it wins, everyone loses."
  },
  "god_mode": {
    "name": "God Mode",
    "desc": "The host remains Card Czar for the entire game while everyone entertains them."
  },
  "wheatons_law": {
    "name": "Wheaton's Law",
    "desc": "Before each round, the Card Czar picks which of two black cards to play."
  },
  "rebooting_universe": {
    "name": "Rebooting the Universe",
    "desc": "A player can discard their hand and draw 10 new cards at the cost of 1 point."
  },
  "meritocracy": {
    "name": "Meritocracy",
    "desc": "The winner of the previous round becomes the next Card Czar. If Rando wins, the Czar stays."
  },
  "high_stakes": {
    "name": "High Stakes",
    "desc": "Before playing, wager points. Win and collect, lose and forfeit."
  },
  "randoWon": "Rando Cardrissian wins — everyone loses!",
  "czarPicksBlackCard": "Card Czar is picking a black card...",
  "pickBlackCardTitle": "Pick the black card for this round",
  "placeBet": "Place a bet",
  "betLabel": "Your bet",
  "betConfirm": "Confirm bet",
  "betPlaced": "{amount} point bet placed"
}
```

**Step 3: Commit**

```bash
git add packages/frontend/src/i18n/locales/cs.json packages/frontend/src/i18n/locales/en.json
git commit -m "feat(frontend): i18n keys for special rules"
```

---

## Task 11: Frontend — CreateTableModal UI

**Files:**
- Modify: `packages/frontend/src/components/CreateTableModal.vue`

**Step 1: Implementace**

Klíčové změny v `<script setup>`:
```ts
import type { SpecialRule } from '@kpl/shared';
import SpecialRulesPanel from './SpecialRulesPanel.vue';

// Přidej do emit:
// create event dostane i specialRules

const selectedRules = ref<SpecialRule[]>([]);
const step = ref<'main' | 'rules'>('main');
const isDesktop = () => window.innerWidth >= 768;

// Uprav submit():
emit('create', {
  name: name.value.trim(),
  isPublic: isPublic.value,
  selectedSetIds: [selectedSetId.value!],
  maxPlayers: maxPlayers.value,
  targetScore: targetScore.value,
  specialRules: selectedRules.value,
});
```

V `<template>` — přidej podmíněné renderování dvou kroků (mobile) a dvou sloupců (desktop).

**Struktura šablony (zjednodušeně):**

```vue
<template>
  <Teleport to="body">
    <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" @click.self="$emit('close')">
      <div :class="[
        'bg-[#0d1117] border border-white/10 rounded-2xl w-full max-h-[90vh] overflow-hidden',
        'md:flex md:max-w-2xl',  // desktop: 2 sloupce
        'max-w-md',              // mobil: 1 sloupec
      ]">

        <!-- Hlavní obsah (krok 1 na mobilu, levý sloupec na desktopu) -->
        <div v-show="step === 'main' || isDesktop()" class="overflow-y-auto md:flex-1 md:border-r md:border-white/5">
          <div class="p-6 space-y-5">
            <!-- Existující obsah: header, name, cardSets, maxPlayers, targetScore, public toggle -->
            <!-- ... stejné jako dnes ... -->

            <!-- Tlačítko Rozšířená pravidla (jen na mobilu) -->
            <button
              type="button"
              class="md:hidden w-full text-left px-4 py-3 bg-slate-900/40 border border-white/10 rounded-xl text-slate-300 text-sm font-bold flex items-center justify-between hover:border-white/20 transition-colors"
              @click="step = 'rules'"
            >
              <span>{{ t('specialRules.button') }}</span>
              <div class="flex items-center gap-2">
                <span v-if="selectedRules.length > 0" class="bg-yellow-400 text-black text-xs font-black px-2 py-0.5 rounded-full">
                  {{ selectedRules.length }}
                </span>
                <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>

            <!-- Actions -->
            <div class="flex gap-3 pt-1">
              <button @click="$emit('close')" class="flex-1 py-3.5 bg-slate-800 border border-white/10 text-slate-300 text-sm font-black uppercase tracking-widest rounded-2xl active:scale-95 transition-all">
                {{ t('common.cancel') }}
              </button>
              <button @click="submit" :disabled="!canSubmit" class="flex-1 py-3.5 bg-white text-black text-sm font-black uppercase tracking-widest rounded-2xl shadow-[0_4px_0_rgb(60,60,60)] active:shadow-none active:translate-y-1 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                {{ t('common.create') }}
              </button>
            </div>
          </div>
        </div>

        <!-- Pravý sloupec / krok 2: Rozšířená pravidla -->
        <div v-show="step === 'rules' || isDesktop()" class="overflow-y-auto md:w-72 md:flex-shrink-0">
          <div class="p-6">
            <!-- Header pro mobil (zpět šipka) -->
            <div class="flex items-center gap-3 mb-4 md:hidden">
              <button @click="step = 'main'" class="text-slate-500 hover:text-white transition-colors p-1">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h3 class="text-sm font-black uppercase tracking-[0.15em] text-slate-400">{{ t('specialRules.button') }}</h3>
            </div>
            <!-- Desktop header -->
            <h3 class="hidden md:block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-4">{{ t('specialRules.button') }}</h3>

            <SpecialRulesPanel v-model="selectedRules" />
          </div>
        </div>

      </div>
    </div>
  </Teleport>
</template>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/CreateTableModal.vue
git commit -m "feat(frontend): CreateTableModal 2-step mobile + 2-column desktop for special rules"
```

---

## Task 12: Frontend — roomStore + lobbyStore aktualizace

**Files:**
- Modify: `packages/frontend/src/stores/roomStore.ts`
- Modify: `packages/frontend/src/stores/lobbyStore.ts`

**Step 1: roomStore.ts — nové computed + akce**

Přidej import `SpecialRule` z `@kpl/shared`.

Přidej computed:
```ts
const specialRules = computed(() => room.value?.specialRules ?? []);
const hasRule = (rule: SpecialRule) => specialRules.value.includes(rule);
const blackCardCandidates = computed(() => room.value?.blackCardCandidates ?? null);
```

Přidej akce:
```ts
function chooseBlackCard(cardId: number) {
  socket.emit('game:chooseBlackCard', cardId);
}

async function placeBet(amount: number): Promise<{ error: string } | null> {
  return new Promise(resolve => {
    socket.emit('game:placeBet', amount, (result) => {
      if ('error' in result) resolve(result);
      else resolve(null);
    });
  });
}
```

Přidej reaktivní stav pro sázku:
```ts
const myBet = ref<number | null>(null);
```

V `lobby:stateUpdate` handleru — room update už zahrnuje `blackCardCandidates`, protože se mapuje přes `toPublicRoom()` → automaticky dostupné.

Přidej handler pro `game:blackCardCandidates`:
```ts
socket.on('game:blackCardCandidates', (cards) => {
  if (room.value) room.value.blackCardCandidates = cards;
});
```

Return z `useRoomStore`:
```ts
return {
  // ... existující ...
  specialRules, hasRule, blackCardCandidates,
  myBet, chooseBlackCard, placeBet,
};
```

**Step 2: lobbyStore.ts — specialRules v createRoom**

V `createRoom()` funkci — přidej `specialRules` do settings parametru a pošli ho dál:
```ts
async function createRoom(settings: { ..., specialRules: SpecialRule[] }) {
  // ...
  socket.emit('lobby:create', { ...settings }, callback);
}
```

**Step 3: Commit**

```bash
git add packages/frontend/src/stores/roomStore.ts packages/frontend/src/stores/lobbyStore.ts
git commit -m "feat(frontend): roomStore/lobbyStore support for special rules actions"
```

---

## Task 13: Frontend — LobbyPanel — zobrazení aktivních pravidel

**Files:**
- Modify: `packages/frontend/src/components/LobbyPanel.vue`

**Step 1: Implementace**

Přidej import `SpecialRulesPanel` a `useRoomStore`.

Za záhlavím stolu (po `<div class="flex items-center justify-between...">`) přidej chips aktivních pravidel:

```vue
<!-- Aktivní speciální pravidla -->
<div v-if="roomStore.specialRules.length > 0" class="flex flex-wrap gap-1.5 pb-4 border-b border-white/5">
  <span
    v-for="rule in roomStore.specialRules"
    :key="rule"
    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-400/10 border border-yellow-400/20 text-yellow-400 text-xs font-bold"
  >
    {{ RULE_ICONS[rule] }} {{ t(`specialRules.${rule}.name`) }}
  </span>
</div>
```

Kde `RULE_ICONS` je const objekt `{ rando_cardrissian: '🎲', ... }`.

**Step 2: Commit**

```bash
git add packages/frontend/src/components/LobbyPanel.vue
git commit -m "feat(frontend): LobbyPanel shows active special rules chips"
```

---

## Task 14: Frontend — RoomPreviewModal — zobrazení pravidel

**Files:**
- Modify: `packages/frontend/src/components/RoomPreviewModal.vue`

**Step 1: Přidej zobrazení pravidel**

Přečti aktuální stav souboru, najdi vhodné místo (za player listem) a přidej:
```vue
<div v-if="room.specialRules?.length" class="mt-3">
  <p class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1.5">{{ t('specialRules.button') }}</p>
  <div class="flex flex-wrap gap-1.5">
    <span
      v-for="rule in room.specialRules"
      :key="rule"
      class="text-xs px-2 py-0.5 rounded-full bg-yellow-400/10 border border-yellow-400/20 text-yellow-400 font-bold"
    >
      {{ t(`specialRules.${rule}.name`) }}
    </span>
  </div>
</div>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/RoomPreviewModal.vue
git commit -m "feat(frontend): RoomPreviewModal shows active special rules"
```

---

## Task 15: Frontend — SelectionPhase — Wheaton's Law + High Stakes

**Files:**
- Modify: `packages/frontend/src/components/SelectionPhase.vue`

**Step 1: Implementace — přidej Wheaton's Law waiting screen a High Stakes bet UI**

V `<script setup>` přidej:
```ts
import BlackCard from './game/atoms/BlackCard.vue';

const roomStore = useRoomStore();
const betAmount = ref(0);
const betPlaced = ref(false);
const betError = ref('');

async function confirmBet() {
  betError.value = '';
  const err = await roomStore.placeBet(betAmount.value);
  if (err) betError.value = err.error;
  else { betPlaced.value = true; roomStore.myBet = betAmount.value; }
}

const maxBet = computed(() => roomStore.me?.score ?? 0);
const showBetUI = computed(() =>
  roomStore.hasRule('high_stakes') && !roomStore.isCardCzar && !betPlaced.value && !roomStore.me?.hasPlayed
);
const waitingForBlackCard = computed(() => !!roomStore.blackCardCandidates && !roomStore.isCardCzar);
```

V `<template>` přidej na začátek (před existující podmíněné layouty):
```vue
<!-- Wheaton's Law: non-czar čeká -->
<div v-if="waitingForBlackCard" class="flex flex-col items-center justify-center min-h-[300px] text-center px-6">
  <div class="text-4xl mb-4">🃏</div>
  <p class="text-slate-400 font-semibold text-lg">{{ t('specialRules.czarPicksBlackCard') }}</p>
</div>

<!-- Wheaton's Law: czar vybírá -->
<div v-else-if="roomStore.isCardCzar && roomStore.blackCardCandidates" class="p-6 space-y-4">
  <h2 class="text-sm font-black uppercase tracking-[0.15em] text-yellow-400">{{ t('specialRules.pickBlackCardTitle') }}</h2>
  <div class="grid gap-3">
    <button
      v-for="card in roomStore.blackCardCandidates"
      :key="card.id"
      @click="roomStore.chooseBlackCard(card.id)"
      class="text-left p-4 bg-black border-2 border-white/20 rounded-2xl hover:border-white/60 transition-colors"
    >
      <BlackCard :card="card" />
    </button>
  </div>
</div>

<!-- Normální flow + High Stakes bet -->
<template v-else>
  <!-- High Stakes: bet UI (jen pokud se ještě nevybírají karty) -->
  <div v-if="showBetUI" class="px-4 pt-4">
    <div class="bg-yellow-400/5 border border-yellow-400/20 rounded-xl p-4 space-y-3">
      <p class="text-xs font-black uppercase tracking-[0.15em] text-yellow-400">{{ t('specialRules.placeBet') }}</p>
      <div class="flex items-center gap-3">
        <input
          v-model.number="betAmount"
          type="range" min="0" :max="maxBet" step="1"
          class="flex-1 accent-yellow-400"
        />
        <span class="text-white font-black text-lg w-8 text-right">{{ betAmount }}</span>
      </div>
      <button
        @click="confirmBet"
        class="w-full py-2 bg-yellow-400 text-black font-black text-sm rounded-xl"
      >
        {{ t('specialRules.betConfirm') }}
      </button>
      <p v-if="betError" class="text-red-400 text-xs">{{ betError }}</p>
    </div>
  </div>
  <!-- Existující CzarWaiting/PlayerSubmitted/PlayerSelecting layouty -->
  <!-- ... beze změny ... -->
</template>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/SelectionPhase.vue
git commit -m "feat(frontend): SelectionPhase Wheaton's Law waiting + High Stakes bet UI"
```

---

## Task 16: Frontend — PlayerList — Rando Cardrissian

**Files:**
- Modify: `packages/frontend/src/components/PlayerList.vue`

**Step 1: Přečti aktuální soubor a přidej Rando row**

Přečti `packages/frontend/src/components/PlayerList.vue`, najdi místo kde se renderují hráči, a přidej za seznam hráčů:

```vue
<!-- Rando Cardrissian virtual player -->
<li
  v-if="hasRando"
  class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-900/30"
>
  <div class="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-base shrink-0">🎲</div>
  <div class="flex-1 min-w-0">
    <span class="text-sm font-bold text-slate-400">Rando Cardrissian</span>
  </div>
  <span class="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">BOT</span>
</li>
```

Přidej prop `hasRando: boolean` nebo computed z `roomStore.hasRule('rando_cardrissian')`.

**Step 2: Commit**

```bash
git add packages/frontend/src/components/PlayerList.vue
git commit -m "feat(frontend): PlayerList shows Rando Cardrissian virtual player"
```

---

## Task 17: Frontend — HomeView + ResultsPhase — Rando výhra

**Files:**
- Modify: `packages/frontend/src/components/ResultsPhase.vue`

**Step 1: Přidej Rando výhru do ResultsPhase**

Přečti soubor. Najdi místo kde se zobrazuje výsledek kola (vítěz, vítězné karty). Přidej podmíněné zobrazení pro Rando výhru:

```vue
<div v-if="roundResult?.winnerId === 'rando_cardrissian'" class="text-center py-6 space-y-3">
  <div class="text-5xl">🎲</div>
  <p class="text-2xl font-black text-red-400">{{ t('specialRules.randoWon') }}</p>
</div>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/ResultsPhase.vue
git commit -m "feat(frontend): ResultsPhase shows Rando Cardrissian win state"
```

---

## Task 18: Finální build + smoke test

**Step 1: Build obou balíčků**

```bash
npm run build --workspace=packages/shared && npm run build --workspace=packages/backend && npm run build --workspace=packages/frontend
```

Očekávané: build bez TypeScript chyb.

**Step 2: Spusť všechny testy**

```bash
npm test --workspace=packages/backend
```

Očekávané: všechny testy pass (původní 71 + nové).

**Step 3: Manuální smoke test**

1. Spusť `npm run dev:backend` a `npm run dev:frontend`
2. Vytvoř stůl s pravidlem "Rando Cardrissian" + "God Mode"
3. Ověř, že se pravidla zobrazují v LobbyPanel
4. Spusť hru — ověř, že host zůstává Czarem (God Mode)
5. Vytvoř stůl s "Wheaton's Law" — ověř, že se czarovi zobrazí 2 černé karty na výběr
6. Ověř, že "Rebooting the Universe" jde použít jen s aktivním pravidlem

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: special rules packages complete — Rando, God Mode, Wheaton's Law, Rebooting, Meritocracy, High Stakes"
```
