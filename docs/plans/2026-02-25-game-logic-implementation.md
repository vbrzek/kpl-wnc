# Game Logic MVP — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the full in-game loop (SELECTION → JUDGING → RESULTS → next round) for the Cards Against Humanity clone.

**Architecture:** Separátní `GameEngine` třída drží in-memory stav kola (balíčky, ruce, submise). `RoomManager` ho vlastní přes Map. Socket handlery v `gameHandlers.ts` řídí flow. Frontend dostane 3 nové Vue komponenty.

**Tech Stack:** TypeScript, Vitest (backend), Vue 3 Composition API, Pinia, Socket.io, Knex/MySQL2

---

### Task 1: Update shared types

**Files:**
- Modify: `packages/shared/src/index.ts`

**Step 1: Add new interfaces after `CardSubmission`**

```typescript
export interface GameRoundStart {
  blackCard: BlackCard;
  hand: WhiteCard[];
  czarId: string;
  roundNumber: number;
}

export interface AnonymousSubmission {
  submissionId: string;
  cards: WhiteCard[];
}

export interface RoundResult {
  winnerId: string;
  winnerNickname: string;
  winningCards: WhiteCard[];
  scores: Record<string, number>;
}
```

**Step 2: Update `ServerToClientEvents` — replace 3 event signatures**

```typescript
// Bylo:
'game:roundStart': (blackCard: BlackCard) => void;
'game:judging': (submissions: CardSubmission[]) => void;
'game:roundEnd': (result: { winnerId: string; winnerCards: WhiteCard[] }) => void;

// Bude:
'game:roundStart': (data: GameRoundStart) => void;
'game:judging': (submissions: AnonymousSubmission[]) => void;
'game:roundEnd': (result: RoundResult) => void;
```

**Step 3: Update `ClientToServerEvents` — opravit `game:judgeSelect`**

```typescript
// Bylo:
'game:judgeSelect': (playerId: string) => void;

// Bude (anonymous submissionId místo playerId):
'game:judgeSelect': (submissionId: string) => void;
```

**Step 4: Build shared**

```bash
npm run build --workspace=packages/shared
```
Expected: no errors

**Step 5: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): add GameRoundStart, AnonymousSubmission, RoundResult; update socket event signatures"
```

---

### Task 2: Extract socketToToken to shared module

**Files:**
- Create: `packages/backend/src/socket/socketState.ts`
- Modify: `packages/backend/src/socket/lobbyHandlers.ts`

**Step 1: Create `socketState.ts`**

```typescript
// Sdílená mapa socket.id → playerToken (používá lobbyHandlers i gameHandlers)
export const socketToToken = new Map<string, string>();
```

**Step 2: Modify `lobbyHandlers.ts`**

Remove the local declaration:
```typescript
// Smazat tento řádek:
const socketToToken = new Map<string, string>();
```

Add import at the top:
```typescript
import { socketToToken } from './socketState.js';
```

**Step 3: Run tests**

```bash
npm test --workspace=packages/backend
```
Expected: 20 tests pass (RoomManager logic unchanged)

**Step 4: Commit**

```bash
git add packages/backend/src/socket/socketState.ts packages/backend/src/socket/lobbyHandlers.ts
git commit -m "refactor(backend): extract socketToToken to shared socketState module"
```

---

### Task 3: Write failing GameEngine tests

**Files:**
- Create: `packages/backend/src/game/GameEngine.test.ts`

**Step 1: Write test file**

```typescript
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
    const hand = engine.getPlayerHand(nonCzar.id);
    engine.submitCards(nonCzar.id, [hand[0].id]);
    const result = engine.submitCards(nonCzar.id, [hand[1].id]);
    expect(result).toHaveProperty('error');
  });

  it('returns error for card not in hand', () => {
    engine.startRound();
    const nonCzar = players.find(p => !p.isCardCzar)!;
    const result = engine.submitCards(nonCzar.id, [99999]);
    expect(result).toHaveProperty('error');
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
```

**Step 2: Run to verify it fails**

```bash
npm test --workspace=packages/backend -- --reporter=verbose
```
Expected: FAIL — "Cannot find module './GameEngine.js'"

**Step 3: Commit**

```bash
git add packages/backend/src/game/GameEngine.test.ts
git commit -m "test(backend): add 15 failing GameEngine unit tests"
```

---

### Task 4: Implement GameEngine

**Files:**
- Create: `packages/backend/src/game/GameEngine.ts`

**Step 1: Write implementation**

```typescript
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
    return this.playerHands.get(playerId) ?? [];
  }
}
```

**Step 2: Run tests**

```bash
npm test --workspace=packages/backend -- --reporter=verbose
```
Expected: 35 tests pass (20 RoomManager + 15 GameEngine)

**Step 3: Commit**

```bash
git add packages/backend/src/game/GameEngine.ts
git commit -m "feat(backend): implement GameEngine — TDD, dealing, submission, judging, round-robin czar"
```

---

### Task 5: Add GameEngine storage to RoomManager

**Files:**
- Modify: `packages/backend/src/game/RoomManager.ts`

**Step 1: Add import at top of file**

```typescript
import { GameEngine } from './GameEngine.js';
```

**Step 2: Add private field to RoomManager class**

After `private afkTimers`:
```typescript
private engines = new Map<string, GameEngine>();
```

**Step 3: Add two public methods before `private removePlayer`**

```typescript
setGameEngine(code: string, engine: GameEngine): void {
  this.engines.set(code, engine);
}

getGameEngine(code: string): GameEngine | null {
  return this.engines.get(code) ?? null;
}
```

**Step 4: Cleanup engine in `removePlayer` when room is deleted**

In `removePlayer`, in the `if (room.players.length === 0)` block, add one line:
```typescript
if (room.players.length === 0) {
  this.rooms.delete(room.code);
  this.engines.delete(room.code);  // ← přidat
  return;
}
```

**Step 5: Run tests**

```bash
npm test --workspace=packages/backend
```
Expected: 35 tests pass

**Step 6: Commit**

```bash
git add packages/backend/src/game/RoomManager.ts
git commit -m "feat(backend): add GameEngine storage to RoomManager (setGameEngine/getGameEngine)"
```

---

### Task 6: Update lobby:startGame to init GameEngine

**Files:**
- Modify: `packages/backend/src/socket/lobbyHandlers.ts`

**Step 1: Add imports at top of file**

```typescript
import db from '../db/db.js';
import { GameEngine } from '../game/GameEngine.js';
import type { BlackCard, WhiteCard } from '@kpl/shared';
```

**Step 2: Replace the `lobby:startGame` handler (was lines 129–139)**

```typescript
// Start game (host only)
socket.on('lobby:startGame', async (callback) => {
  const playerToken = socketToToken.get(socket.id);
  if (!playerToken) { callback({ error: 'Nejsi přihlášen' }); return; }

  const result = roomManager.startGame(playerToken);
  if ('error' in result) { callback(result); return; }

  const room = result.room;

  // Load cards from DB for selected sets
  const [blackCards, whiteCards] = await Promise.all([
    db('black_cards')
      .whereIn('card_set_id', room.selectedSetIds)
      .select<BlackCard[]>('id', 'text', 'pick'),
    db('white_cards')
      .whereIn('card_set_id', room.selectedSetIds)
      .select<WhiteCard[]>('id', 'text'),
  ]);

  // Init GameEngine and start first round
  const engine = new GameEngine(room.players, blackCards, whiteCards);
  roomManager.setGameEngine(room.code, engine);
  const { czarId } = engine.startRound();
  room.currentBlackCard = engine.currentBlackCard;

  // Broadcast status change (SELECTION) to all in room
  io.to(`room:${room.code}`).emit('lobby:stateUpdate', room);
  broadcastPublicRooms(io);
  callback({ ok: true });

  // Send each player their personal hand
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
});
```

**Step 3: Run tests**

```bash
npm test --workspace=packages/backend
```
Expected: 35 tests pass

**Step 4: Commit**

```bash
git add packages/backend/src/socket/lobbyHandlers.ts
git commit -m "feat(backend): startGame loads cards from DB, inits GameEngine, emits game:roundStart per player"
```

---

### Task 7: Create gameHandlers.ts and register it

**Files:**
- Create: `packages/backend/src/socket/gameHandlers.ts`
- Modify: `packages/backend/src/index.ts`

**Step 1: Write `gameHandlers.ts`**

```typescript
import type { Server, Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@kpl/shared';
import { roomManager } from '../game/RoomManager.js';
import { socketToToken } from './socketState.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export function registerGameHandlers(io: IO, socket: AppSocket) {

  // Player submits white cards during SELECTION
  socket.on('game:playCards', (cardIds) => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) return;

    const room = roomManager.getRoomByPlayerToken(playerToken);
    if (!room || room.status !== 'SELECTION') {
      socket.emit('game:error', 'Hra není ve fázi výběru karet.');
      return;
    }

    const engine = roomManager.getGameEngine(room.code);
    if (!engine) { socket.emit('game:error', 'Herní engine nenalezen.'); return; }

    const playerId = roomManager.getPlayerIdByToken(playerToken)!;
    const result = engine.submitCards(playerId, cardIds);

    if ('error' in result) {
      socket.emit('game:error', result.error);
      return;
    }

    if (result.allSubmitted) {
      room.status = 'JUDGING';
      io.to(`room:${room.code}`).emit('lobby:stateUpdate', room);
      io.to(`room:${room.code}`).emit('game:judging', engine.getAnonymousSubmissions());
    }
  });

  // Card Czar selects winner during JUDGING
  socket.on('game:judgeSelect', (submissionId) => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) return;

    const room = roomManager.getRoomByPlayerToken(playerToken);
    if (!room || room.status !== 'JUDGING') {
      socket.emit('game:error', 'Hra není ve fázi souzení.');
      return;
    }

    const engine = roomManager.getGameEngine(room.code);
    if (!engine) { socket.emit('game:error', 'Herní engine nenalezen.'); return; }

    const czarId = roomManager.getPlayerIdByToken(playerToken)!;
    const result = engine.selectWinner(czarId, submissionId);

    if ('error' in result) {
      socket.emit('game:error', result.error);
      return;
    }

    room.status = 'RESULTS';
    io.to(`room:${room.code}`).emit('lobby:stateUpdate', room);
    io.to(`room:${room.code}`).emit('game:roundEnd', result);

    // After 5s: start next round
    const roomCode = room.code;
    setTimeout(() => {
      const currentRoom = roomManager.getRoom(roomCode);
      const currentEngine = roomManager.getGameEngine(roomCode);
      if (!currentRoom || !currentEngine) return;

      const { czarId: newCzarId } = currentEngine.startRound();
      currentRoom.status = 'SELECTION';
      currentRoom.currentBlackCard = currentEngine.currentBlackCard;
      io.to(`room:${roomCode}`).emit('lobby:stateUpdate', currentRoom);

      for (const player of currentRoom.players) {
        if (!player.socketId) continue;
        const playerSocket = io.sockets.sockets.get(player.socketId);
        if (playerSocket) {
          playerSocket.emit('game:roundStart', {
            blackCard: currentEngine.currentBlackCard!,
            hand: currentEngine.getPlayerHand(player.id),
            czarId: newCzarId,
            roundNumber: currentEngine.roundNumber,
          });
        }
      }
    }, 5_000);
  });
}
```

**Step 2: Register in `packages/backend/src/index.ts`**

Add import:
```typescript
import { registerGameHandlers } from './socket/gameHandlers.js';
```

In `io.on('connection', ...)`, after `registerLobbyHandlers(io, socket);`:
```typescript
registerGameHandlers(io, socket);
```

**Step 3: Run tests**

```bash
npm test --workspace=packages/backend
```
Expected: 35 tests pass

**Step 4: Commit**

```bash
git add packages/backend/src/socket/gameHandlers.ts packages/backend/src/index.ts
git commit -m "feat(backend): add game:playCards and game:judgeSelect handlers; wire up in index.ts"
```

---

### Task 8: Update roomStore.ts with game state and listeners

**Files:**
- Modify: `packages/frontend/src/stores/roomStore.ts`

**Step 1: Update imports**

```typescript
import type { GameRoom, BlackCard, WhiteCard, AnonymousSubmission, RoundResult } from '@kpl/shared';
```

**Step 2: Add reactive state inside `defineStore` (after `myPlayerId`)**

```typescript
const hand = ref<WhiteCard[]>([]);
const currentBlackCard = ref<BlackCard | null>(null);
const czarId = ref<string | null>(null);
const submissions = ref<AnonymousSubmission[]>([]);
const roundResult = ref<RoundResult | null>(null);
const selectedCards = ref<WhiteCard[]>([]);
```

**Step 3: Add computed**

```typescript
const isCardCzar = computed(() =>
  myPlayerId.value !== null && czarId.value === myPlayerId.value
);
```

**Step 4: Add socket listeners in `init()` after existing lobby listeners**

```typescript
socket.on('game:roundStart', (data) => {
  hand.value = data.hand;
  currentBlackCard.value = data.blackCard;
  czarId.value = data.czarId;
  submissions.value = [];
  roundResult.value = null;
  selectedCards.value = [];
});

socket.on('game:judging', (subs) => {
  submissions.value = subs;
});

socket.on('game:roundEnd', (result) => {
  roundResult.value = result;
});
```

**Step 5: Add actions**

```typescript
function playCards(cardIds: number[]) {
  socket.emit('game:playCards', cardIds);
  selectedCards.value = [];
}

function judgeSelect(submissionId: string) {
  socket.emit('game:judgeSelect', submissionId);
}

function toggleCardSelection(card: WhiteCard) {
  const idx = selectedCards.value.findIndex(c => c.id === card.id);
  if (idx === -1) {
    selectedCards.value.push(card);
  } else {
    selectedCards.value.splice(idx, 1);
  }
}
```

**Step 6: Add to `cleanup()`**

```typescript
socket.off('game:roundStart');
socket.off('game:judging');
socket.off('game:roundEnd');
hand.value = [];
currentBlackCard.value = null;
czarId.value = null;
submissions.value = [];
roundResult.value = null;
selectedCards.value = [];
```

**Step 7: Add to `return` statement**

```typescript
hand, currentBlackCard, czarId, submissions, roundResult, selectedCards, isCardCzar,
playCards, judgeSelect, toggleCardSelection,
```

**Step 8: Commit**

```bash
git add packages/frontend/src/stores/roomStore.ts
git commit -m "feat(frontend): add game state, socket listeners, and actions to roomStore"
```

---

### Task 9: Create SelectionPhase.vue

**Files:**
- Create: `packages/frontend/src/components/SelectionPhase.vue`

**Step 1: Write component**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useRoomStore } from '../stores/roomStore';

const roomStore = useRoomStore();
const pick = computed(() => roomStore.currentBlackCard?.pick ?? 1);
const canSubmit = computed(() => roomStore.selectedCards.length === pick.value);

function submit() {
  if (!canSubmit.value) return;
  roomStore.playCards(roomStore.selectedCards.map(c => c.id));
}
</script>

<template>
  <div class="space-y-6">
    <!-- Černá karta -->
    <div class="bg-black text-white rounded-xl p-6 max-w-sm text-xl font-bold leading-relaxed shadow-lg">
      {{ roomStore.currentBlackCard?.text ?? '...' }}
      <div class="text-sm font-normal mt-2 text-gray-400">
        Vyber {{ pick }} {{ pick === 1 ? 'kartu' : 'karty' }}
      </div>
    </div>

    <!-- Czar čeká -->
    <p v-if="roomStore.isCardCzar" class="text-yellow-400 font-semibold text-lg">
      Jsi Card Czar — čekej, až ostatní vyberou karty.
    </p>

    <!-- Hráč odeslal -->
    <p v-else-if="roomStore.me?.hasPlayed" class="text-green-400 font-semibold text-lg">
      Karty odeslány — čekáme na ostatní...
    </p>

    <!-- Výběr karet -->
    <template v-else>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <button
          v-for="card in roomStore.hand"
          :key="card.id"
          @click="roomStore.toggleCardSelection(card)"
          :class="[
            'bg-white text-black rounded-lg p-4 text-sm font-medium text-left transition-all border-4',
            roomStore.selectedCards.some(c => c.id === card.id)
              ? 'border-yellow-400 ring-2 ring-yellow-400'
              : 'border-transparent hover:border-gray-300',
          ]"
        >
          {{ card.text }}
        </button>
      </div>

      <button
        @click="submit"
        :disabled="!canSubmit"
        class="bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-8 py-3 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Odeslat {{ roomStore.selectedCards.length }}/{{ pick }} karet
      </button>
    </template>
  </div>
</template>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/SelectionPhase.vue
git commit -m "feat(frontend): add SelectionPhase component"
```

---

### Task 10: Create JudgingPhase.vue

**Files:**
- Create: `packages/frontend/src/components/JudgingPhase.vue`

**Step 1: Write component**

```vue
<script setup lang="ts">
import { useRoomStore } from '../stores/roomStore';

const roomStore = useRoomStore();

function pickWinner(submissionId: string) {
  if (!roomStore.isCardCzar) return;
  roomStore.judgeSelect(submissionId);
}
</script>

<template>
  <div class="space-y-6">
    <!-- Černá karta -->
    <div class="bg-black text-white rounded-xl p-6 max-w-sm text-xl font-bold leading-relaxed shadow-lg">
      {{ roomStore.currentBlackCard?.text ?? '...' }}
    </div>

    <!-- Instrukce -->
    <p v-if="roomStore.isCardCzar" class="text-yellow-400 font-semibold text-lg">
      Jsi Card Czar — vyber nejlepší odpověď!
    </p>
    <p v-else class="text-gray-400 text-lg">
      Card Czar vybírá vítěze...
    </p>

    <!-- Anonymní submise -->
    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      <button
        v-for="submission in roomStore.submissions"
        :key="submission.submissionId"
        @click="pickWinner(submission.submissionId)"
        :disabled="!roomStore.isCardCzar"
        class="bg-white text-black rounded-xl p-5 text-left space-y-2 border-4 border-transparent transition-all"
        :class="roomStore.isCardCzar ? 'hover:border-yellow-400 cursor-pointer' : 'cursor-default'"
      >
        <p v-for="card in submission.cards" :key="card.id" class="font-medium">
          {{ card.text }}
        </p>
      </button>
    </div>
  </div>
</template>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/JudgingPhase.vue
git commit -m "feat(frontend): add JudgingPhase component"
```

---

### Task 11: Create ResultsPhase.vue

**Files:**
- Create: `packages/frontend/src/components/ResultsPhase.vue`

**Step 1: Write component**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useRoomStore } from '../stores/roomStore';

const roomStore = useRoomStore();

const scoreboard = computed(() => {
  const result = roomStore.roundResult;
  const players = roomStore.room?.players ?? [];
  if (!result) return [];
  return players
    .map(p => ({ nickname: p.nickname, score: result.scores[p.id] ?? 0 }))
    .sort((a, b) => b.score - a.score);
});
</script>

<template>
  <div class="space-y-8 text-center">
    <!-- Vítěz kola -->
    <div>
      <p class="text-gray-400 text-lg mb-2">Vítěz kola</p>
      <h2 class="text-4xl font-bold text-yellow-400">
        {{ roomStore.roundResult?.winnerNickname ?? '...' }}
      </h2>
    </div>

    <!-- Vítězné karty -->
    <div class="flex flex-wrap gap-3 justify-center">
      <div
        v-for="card in roomStore.roundResult?.winningCards ?? []"
        :key="card.id"
        class="bg-white text-black rounded-lg p-4 text-sm font-medium max-w-xs text-left"
      >
        {{ card.text }}
      </div>
    </div>

    <!-- Skóre -->
    <div class="max-w-sm mx-auto">
      <h3 class="text-xl font-semibold mb-3 text-left">Skóre</h3>
      <div
        v-for="entry in scoreboard"
        :key="entry.nickname"
        class="flex justify-between py-2 border-b border-gray-700"
      >
        <span>{{ entry.nickname }}</span>
        <span class="font-bold text-yellow-400">{{ entry.score }}</span>
      </div>
    </div>

    <p class="text-gray-500 text-sm">Nové kolo začíná za 5 sekund...</p>
  </div>
</template>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/ResultsPhase.vue
git commit -m "feat(frontend): add ResultsPhase component — winner and scoreboard"
```

---

### Task 12: Wire up game phases in RoomView.vue

**Files:**
- Modify: `packages/frontend/src/views/RoomView.vue`

**Step 1: Add imports to `<script setup>`**

```typescript
import SelectionPhase from '../components/SelectionPhase.vue';
import JudgingPhase from '../components/JudgingPhase.vue';
import ResultsPhase from '../components/ResultsPhase.vue';
```

**Step 2: Replace the `<template v-if="roomStore.room">` block**

```html
<template v-if="roomStore.room">
  <LobbyPanel
    v-if="roomStore.room.status === 'LOBBY'"
    :room="roomStore.room"
  />
  <SelectionPhase v-else-if="roomStore.room.status === 'SELECTION'" />
  <JudgingPhase v-else-if="roomStore.room.status === 'JUDGING'" />
  <ResultsPhase v-else-if="roomStore.room.status === 'RESULTS'" />
</template>
```

**Step 3: Commit**

```bash
git add packages/frontend/src/views/RoomView.vue
git commit -m "feat(frontend): wire up SelectionPhase, JudgingPhase, ResultsPhase in RoomView"
```

---

### Final: Verify

**Step 1: Run all backend tests**

```bash
npm test --workspace=packages/backend
```
Expected: 35 tests pass (20 RoomManager + 15 GameEngine)

**Step 2: Build everything**

```bash
npm run build
```
Expected: no TypeScript errors

**Step 3: Manual smoke test**
1. `npm run dev:backend` + `npm run dev:frontend`
2. Open 3 browser tabs, create room, add 3 players with selected card set
3. Host clicks "Spustit hru" → všichni vidí SelectionPhase s kartami v ruce
4. 2 hráči (ne-czar) vyberou a odešlou karty → JudgingPhase se zobrazí
5. Card Czar klikne na vítěze → ResultsPhase, skóre +1
6. Po 5s automaticky nové kolo → SelectionPhase znovu
