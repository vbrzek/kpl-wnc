# Game AFK Timers, Submission Status, End Game, Invalid Room Redirect

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Přidat časovače akcí ve hře (45s výběr / 60s rozsudek), zobrazit stav odevzdání karet, umožnit hostu ukončit hru a přesměrovat hráče z neplatné místnosti do lobby s chybovou hláškou.

**Architecture:** Nové timery jsou spravovány v `RoomManager`. Sdílená helper funkce `startNewRound` v `roundUtils.ts` eliminuje duplicitu mezi `lobbyHandlers` a `gameHandlers`. Nový stav `FINISHED` zajistí finální skóre screen. Chybové přesměrování používá Vue Router query params.

**Tech Stack:** Node.js + TypeScript + Socket.io + Vue 3 + Pinia + Vitest (fake timers)

---

## Pořadí úkolů

1. Shared types (`@kpl/shared`) — základ pro vše ostatní
2. RoomManager — nové metody (timery, endGame, returnToLobby)
3. Testy pro RoomManager
4. `roundUtils.ts` — sdílená helper funkce
5. `gameHandlers.ts` — timery + endGame/returnToLobby handlery
6. `lobbyHandlers.ts` — startGame refactor + endGame/returnToLobby
7. `roomStore.ts` — nové eventy
8. `SelectionPhase.vue` — submission status + countdown
9. `JudgingPhase.vue` — countdown + roundSkipped notifikace
10. `FinishedPhase.vue` — nová komponenta
11. `RoomView.vue` — render FinishedPhase + oprava redirectu
12. `HomeView.vue` — čtení chyby z query params

---

### Task 1: Shared types

**Files:**
- Modify: `packages/shared/src/index.ts`

**Step 1: Uprav GameStatus, GameRoom, RoundResult, přidej nové eventy**

Nahraď celý soubor `packages/shared/src/index.ts`:

```typescript
// Herní stavy
export type GameStatus = 'LOBBY' | 'SELECTION' | 'JUDGING' | 'RESULTS' | 'FINISHED';

// Hráč
export interface Player {
  id: string;
  socketId: string | null;
  nickname: string;
  score: number;
  isCardCzar: boolean;
  hasPlayed: boolean;
  isAfk: boolean;
}

// Karty
export interface BlackCard {
  id: number;
  text: string;
  pick: number;
}

export interface WhiteCard {
  id: number;
  text: string;
}

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
  winnerId: string | null;        // null = kolo přeskočeno
  winnerNickname: string | null;
  winningCards: WhiteCard[];
  scores: Record<string, number>;
}

export interface GameStateSync {
  blackCard: BlackCard;
  czarId: string | null;
  roundNumber: number;
  hand: WhiteCard[];
  submissions: AnonymousSubmission[];
}

// Sada karet
export interface CardSet {
  id: number;
  name: string;
  description: string | null;
  slug: string | null;
  isPublic: boolean;
}

// Herní místnost
export interface GameRoom {
  code: string;
  status: GameStatus;
  hostId: string;
  name: string;
  isPublic: boolean;
  selectedSetIds: number[];
  maxPlayers: number;
  players: Player[];
  currentBlackCard: BlackCard | null;
  roundNumber: number;
  roundDeadline: number | null;   // Unix ms timestamp, null = žádný aktivní timer
}

// Zkrácený přehled pro seznam veřejných stolů
export interface PublicRoomSummary {
  code: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
}

// Socket.io eventy — server → klient
export interface ServerToClientEvents {
  'server:clientCount': (count: number) => void;
  'lobby:stateUpdate': (room: GameRoom) => void;
  'lobby:kicked': () => void;
  'lobby:publicRoomsUpdate': (rooms: PublicRoomSummary[]) => void;
  'game:error': (message: string) => void;
  'game:roundStart': (data: GameRoundStart) => void;
  'game:judging': (submissions: AnonymousSubmission[]) => void;
  'game:roundEnd': (result: RoundResult) => void;
  'game:handUpdate': (hand: WhiteCard[]) => void;
  'game:stateSync': (data: GameStateSync) => void;
  'game:roundSkipped': () => void;  // kolo přeskočeno bez bodu (timeout)
}

// Socket.io eventy — klient → server
export interface ClientToServerEvents {
  'lobby:create': (
    settings: {
      name: string;
      isPublic: boolean;
      selectedSetIds: number[];
      maxPlayers: number;
      nickname: string;
    },
    callback: (result: { room: GameRoom; playerToken: string; playerId: string } | { error: string }) => void
  ) => void;
  'lobby:join': (
    data: { code: string; nickname: string; playerToken?: string },
    callback: (result: { room: GameRoom; playerToken: string; playerId: string } | { error: string }) => void
  ) => void;
  'lobby:subscribePublic': () => void;
  'lobby:unsubscribePublic': () => void;
  'lobby:leave': () => void;
  'lobby:updateSettings': (
    settings: { name?: string; isPublic?: boolean; selectedSetIds?: number[]; maxPlayers?: number },
    callback: (result: { room: GameRoom } | { error: string }) => void
  ) => void;
  'lobby:kickPlayer': (
    playerId: string,
    callback: (result: { ok: true } | { error: string }) => void
  ) => void;
  'lobby:startGame': (
    callback: (result: { ok: true } | { error: string }) => void
  ) => void;
  'lobby:endGame': (
    callback: (result: { ok: true } | { error: string }) => void
  ) => void;
  'lobby:returnToLobby': (
    callback: (result: { ok: true } | { error: string }) => void
  ) => void;
  'game:leave': () => void;
  'game:playCards': (cardIds: number[]) => void;
  'game:judgeSelect': (submissionId: string) => void;
  'game:retractCards': () => void;
}
```

**Step 2: Ověř TypeScript kompilaci**

```bash
npm run build --workspace=packages/shared
```
Očekáváno: úspěšný build bez chyb.

**Step 3: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): add FINISHED status, roundDeadline, roundSkipped event, endGame/returnToLobby events"
```

---

### Task 2: RoomManager — nové timer metody a endGame/returnToLobby

**Files:**
- Modify: `packages/backend/src/game/RoomManager.ts`

**Step 1: Přidej timer mapy a metody**

Za `private engines = new Map<string, GameEngine>();` přidej:
```typescript
  private roundTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private judgingTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
```

Přidej tyto metody za `getGameEngine`:

```typescript
  // ------------------------------------------------------------------ round timer

  setRoundTimer(code: string, callback: () => void, ms: number): void {
    this.clearRoundTimer(code);
    const timer = setTimeout(callback, ms);
    this.roundTimers.set(code, timer);
  }

  clearRoundTimer(code: string): void {
    const t = this.roundTimers.get(code);
    if (t !== undefined) {
      clearTimeout(t);
      this.roundTimers.delete(code);
    }
  }

  // ------------------------------------------------------------------ judging timer

  setJudgingTimer(code: string, callback: () => void, ms: number): void {
    this.clearJudgingTimer(code);
    const timer = setTimeout(callback, ms);
    this.judgingTimers.set(code, timer);
  }

  clearJudgingTimer(code: string): void {
    const t = this.judgingTimers.get(code);
    if (t !== undefined) {
      clearTimeout(t);
      this.judgingTimers.delete(code);
    }
  }

  clearAllGameTimers(code: string): void {
    this.clearRoundTimer(code);
    this.clearJudgingTimer(code);
  }

  // ------------------------------------------------------------------ endGame

  endGame(hostToken: string): ActionResult {
    const code = this.playerRooms.get(hostToken);
    if (!code) return { error: 'Nejsi v žádné místnosti.' };

    const room = this.rooms.get(code);
    if (!room) return { error: 'Místnost nebyla nalezena.' };

    const hostPlayerId = this.tokenToPlayerId.get(hostToken);
    if (hostPlayerId !== room.hostId) {
      return { error: 'Pouze hostitel může ukončit hru.' };
    }

    if (room.status === 'LOBBY' || room.status === 'FINISHED') {
      return { error: 'Hra právě neprobíhá.' };
    }

    this.clearAllGameTimers(code);
    this.engines.delete(code);
    room.status = 'FINISHED';
    room.roundDeadline = null;

    return { room };
  }

  // ------------------------------------------------------------------ returnToLobby

  returnToLobby(hostToken: string): ActionResult {
    const code = this.playerRooms.get(hostToken);
    if (!code) return { error: 'Nejsi v žádné místnosti.' };

    const room = this.rooms.get(code);
    if (!room) return { error: 'Místnost nebyla nalezena.' };

    const hostPlayerId = this.tokenToPlayerId.get(hostToken);
    if (hostPlayerId !== room.hostId) {
      return { error: 'Pouze hostitel může vrátit hru do lobby.' };
    }

    if (room.status !== 'FINISHED') {
      return { error: 'Hru lze vrátit do lobby pouze ze stavu FINISHED.' };
    }

    room.status = 'LOBBY';
    room.roundDeadline = null;
    room.currentBlackCard = null;
    room.roundNumber = 0;

    for (const player of room.players) {
      player.score = 0;
      player.isCardCzar = false;
      player.hasPlayed = false;
      // Zachováme isAfk pro odpojené hráče, resetujeme pro připojené
      if (player.socketId !== null) {
        player.isAfk = false;
      }
    }

    return { room };
  }
```

**Step 2: Přidej `roundDeadline: null` do `createRoom`**

V metodě `createRoom`, do objektu `room`:
```typescript
    roundDeadline: null,
```
(za `roundNumber: 0,`)

**Step 3: Vyčisti timery při mazání místnosti**

V metodě `removePlayer`, za `this.engines.delete(room.code);` přidej:
```typescript
      this.clearAllGameTimers(room.code);
```

**Step 4: Ověř TS kompilaci**

```bash
npm run build --workspace=packages/backend 2>&1 | head -30
```
Očekáváno: 0 chyb (nebo pouze chyby z importů, které opravíme v dalších krocích).

**Step 5: Commit**

```bash
git add packages/backend/src/game/RoomManager.ts
git commit -m "feat(backend): add round/judging timers, endGame and returnToLobby to RoomManager"
```

---

### Task 3: Testy pro nové RoomManager metody

**Files:**
- Modify: `packages/backend/src/game/RoomManager.test.ts`

**Step 1: Přidej testy na konec souboru** (před uzavírací `});`)

```typescript
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
```

**Step 2: Spusť testy**

```bash
npm test --workspace=packages/backend
```
Očekáváno: všechny testy prochází (původních 20 + nové).

**Step 3: Commit**

```bash
git add packages/backend/src/game/RoomManager.test.ts
git commit -m "test(backend): add tests for endGame, returnToLobby, timer methods"
```

---

### Task 4: roundUtils.ts — sdílená helper funkce

**Files:**
- Create: `packages/backend/src/socket/roundUtils.ts`

**Step 1: Vytvoř soubor**

```typescript
import type { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, GameRoom } from '@kpl/shared';
import { roomManager } from '../game/RoomManager.js';
import type { GameEngine } from '../game/GameEngine.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

const SELECTION_TIMEOUT_MS = 45_000;
const JUDGING_TIMEOUT_MS = 60_000;
const SKIP_DELAY_MS = 3_000;

// Přechod do fáze JUDGING + start časovače pro rozsudek cara
export function startJudgingPhase(room: GameRoom, engine: GameEngine, io: IO): void {
  const roomCode = room.code;
  room.status = 'JUDGING';
  room.roundDeadline = Date.now() + JUDGING_TIMEOUT_MS;
  io.to(`room:${roomCode}`).emit('lobby:stateUpdate', room);
  io.to(`room:${roomCode}`).emit('game:judging', engine.getAnonymousSubmissions());

  roomManager.setJudgingTimer(roomCode, () => {
    const r = roomManager.getRoom(roomCode);
    const e = roomManager.getGameEngine(roomCode);
    if (!r || !e || r.status !== 'JUDGING') return;

    // Označit cara jako AFK
    const czar = r.players.find(p => p.isCardCzar);
    if (czar) czar.isAfk = true;

    r.roundDeadline = null;
    io.to(`room:${roomCode}`).emit('lobby:stateUpdate', r);
    io.to(`room:${roomCode}`).emit('game:roundSkipped');

    setTimeout(() => {
      const cr = roomManager.getRoom(roomCode);
      const ce = roomManager.getGameEngine(roomCode);
      if (!cr || !ce || cr.status !== 'JUDGING') return;
      try {
        startNewRound(cr, ce, io);
      } catch {
        io.to(`room:${roomCode}`).emit('game:error', 'Hra skončila — došly karty nebo nejsou aktivní hráči.');
      }
    }, SKIP_DELAY_MS);
  }, JUDGING_TIMEOUT_MS);
}

// Spuštění nového kola: un-AFK připojené hráče, zavolej startRound, rozešli karty, spusť timer
export function startNewRound(room: GameRoom, engine: GameEngine, io: IO): void {
  const roomCode = room.code;

  // Zruš stávající timery
  roomManager.clearAllGameTimers(roomCode);

  // Un-AFK hráče, kteří jsou stále připojeni (akce-AFK je jen per-kolo)
  for (const player of room.players) {
    if (player.isAfk && player.socketId !== null) {
      player.isAfk = false;
    }
  }

  const { czarId } = engine.startRound();
  room.status = 'SELECTION';
  room.currentBlackCard = engine.currentBlackCard;
  room.roundNumber = engine.roundNumber;
  room.roundDeadline = Date.now() + SELECTION_TIMEOUT_MS;

  io.to(`room:${roomCode}`).emit('lobby:stateUpdate', room);

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

  // Spusť 45s timer pro výběr karet
  roomManager.setRoundTimer(roomCode, () => {
    const r = roomManager.getRoom(roomCode);
    const e = roomManager.getGameEngine(roomCode);
    if (!r || !e || r.status !== 'SELECTION') return;

    // Označit připojené hráče, kteří neodeslali, jako AFK
    for (const player of r.players) {
      if (!player.isAfk && !player.isCardCzar && !player.hasPlayed && player.socketId !== null) {
        player.isAfk = true;
      }
    }

    const submissions = e.getAnonymousSubmissions();
    if (submissions.length > 0) {
      // Alespoň jedna odezva — přejdeme do JUDGING
      startJudgingPhase(r, e, io);
    } else {
      // Žádné odezvy — přeskoč kolo
      r.roundDeadline = null;
      io.to(`room:${roomCode}`).emit('lobby:stateUpdate', r);
      io.to(`room:${roomCode}`).emit('game:roundSkipped');

      setTimeout(() => {
        const cr = roomManager.getRoom(roomCode);
        const ce = roomManager.getGameEngine(roomCode);
        if (!cr || !ce || cr.status !== 'SELECTION') return;
        try {
          startNewRound(cr, ce, io);
        } catch {
          io.to(`room:${roomCode}`).emit('game:error', 'Hra skončila — došly karty nebo nejsou aktivní hráči.');
        }
      }, SKIP_DELAY_MS);
    }
  }, SELECTION_TIMEOUT_MS);
}
```

**Step 2: Ověř kompilaci**

```bash
npm run build --workspace=packages/backend 2>&1 | head -20
```

**Step 3: Commit**

```bash
git add packages/backend/src/socket/roundUtils.ts
git commit -m "feat(backend): add roundUtils with startNewRound and startJudgingPhase helpers"
```

---

### Task 5: gameHandlers.ts — timery + endGame/returnToLobby

**Files:**
- Modify: `packages/backend/src/socket/gameHandlers.ts`

**Step 1: Nahraď celý soubor**

```typescript
import type { Server, Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@kpl/shared';
import { roomManager } from '../game/RoomManager.js';
import { socketToToken } from './socketState.js';
import { startNewRound, startJudgingPhase } from './roundUtils.js';

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
      // Zruš round timer a přejdi do JUDGING
      roomManager.clearRoundTimer(room.code);
      startJudgingPhase(room, engine, io);
    } else {
      io.to(`room:${room.code}`).emit('lobby:stateUpdate', room);
    }
  });

  // Player retracts submitted cards to change selection
  socket.on('game:retractCards', () => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) return;

    const room = roomManager.getRoomByPlayerToken(playerToken);
    if (!room || room.status !== 'SELECTION') {
      socket.emit('game:error', 'Karty nelze vzít zpět mimo fázi výběru.');
      return;
    }

    const engine = roomManager.getGameEngine(room.code);
    if (!engine) { socket.emit('game:error', 'Herní engine nenalezen.'); return; }

    const playerId = roomManager.getPlayerIdByToken(playerToken)!;
    const result = engine.retractCards(playerId);

    if ('error' in result) {
      socket.emit('game:error', result.error);
      return;
    }

    io.to(`room:${room.code}`).emit('lobby:stateUpdate', room);
    socket.emit('game:handUpdate', engine.getPlayerHand(playerId));
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

    // Zruš judging timer
    roomManager.clearJudgingTimer(room.code);

    room.status = 'RESULTS';
    room.roundDeadline = null;
    io.to(`room:${room.code}`).emit('lobby:stateUpdate', room);
    io.to(`room:${room.code}`).emit('game:roundEnd', result);

    // After 5s: start next round
    const roomCode = room.code;
    setTimeout(() => {
      const currentRoom = roomManager.getRoom(roomCode);
      const currentEngine = roomManager.getGameEngine(roomCode);
      if (!currentRoom || !currentEngine) return;
      if (currentRoom.status !== 'RESULTS') return; // host mohl ukončit hru

      try {
        startNewRound(currentRoom, currentEngine, io);
      } catch {
        io.to(`room:${roomCode}`).emit('game:error', 'Hra skončila — došly karty nebo nejsou aktivní hráči.');
      }
    }, 5_000);
  });

  // Player explicitly leaves during game
  socket.on('game:leave', () => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) return;

    const roomCode = roomManager.getRoomByPlayerToken(playerToken)?.code;
    roomManager.leaveRoom(playerToken);
    socketToToken.delete(socket.id);

    if (roomCode) {
      socket.leave(`room:${roomCode}`);
      const roomAfter = roomManager.getRoom(roomCode);
      if (roomAfter) {
        io.to(`room:${roomCode}`).emit('lobby:stateUpdate', roomAfter);
      }
    }
  });

  // Host ukončí hru (přechod do FINISHED)
  socket.on('lobby:endGame', (callback) => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) { callback({ error: 'Nejsi přihlášen.' }); return; }

    const result = roomManager.endGame(playerToken);
    if ('error' in result) { callback(result); return; }

    io.to(`room:${result.room.code}`).emit('lobby:stateUpdate', result.room);
    callback({ ok: true });
  });

  // Host vrátí hru do lobby (FINISHED → LOBBY)
  socket.on('lobby:returnToLobby', (callback) => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) { callback({ error: 'Nejsi přihlášen.' }); return; }

    const result = roomManager.returnToLobby(playerToken);
    if ('error' in result) { callback(result); return; }

    io.to(`room:${result.room.code}`).emit('lobby:stateUpdate', result.room);
    callback({ ok: true });
  });
}
```

**Step 2: Ověř kompilaci**

```bash
npm run build --workspace=packages/backend 2>&1 | head -20
```

**Step 3: Commit**

```bash
git add packages/backend/src/socket/gameHandlers.ts
git commit -m "feat(backend): integrate round/judging timers into game handlers, add endGame/returnToLobby"
```

---

### Task 6: lobbyHandlers.ts — refaktor startGame

**Files:**
- Modify: `packages/backend/src/socket/lobbyHandlers.ts`

**Step 1: Přidej import roundUtils**

Za řádek `import { GameEngine } from '../game/GameEngine.js';` přidej:
```typescript
import { startNewRound } from './roundUtils.js';
```

**Step 2: Nahraď blok startGame (řádky 149–209) novým kódem**

Celý handler `socket.on('lobby:startGame', async (callback) => { ... });` nahraď:

```typescript
  // Start game (host only)
  socket.on('lobby:startGame', async (callback) => {
    const playerToken = socketToToken.get(socket.id);
    if (!playerToken) { callback({ error: 'Nejsi přihlášen' }); return; }

    const result = roomManager.startGame(playerToken);
    if ('error' in result) { callback(result); return; }

    const room = result.room;

    // Load cards from DB for selected sets
    let blackCards: BlackCard[];
    let whiteCards: WhiteCard[];
    try {
      [blackCards, whiteCards] = await Promise.all([
        db('black_cards')
          .whereIn('card_set_id', room.selectedSetIds)
          .select<BlackCard[]>('id', 'text', 'pick'),
        db('white_cards')
          .whereIn('card_set_id', room.selectedSetIds)
          .select<WhiteCard[]>('id', 'text'),
      ]);
    } catch {
      room.status = 'LOBBY';
      callback({ error: 'Chyba při načítání karet.' });
      return;
    }

    // Init GameEngine
    let engine: GameEngine;
    try {
      engine = new GameEngine(room.players, blackCards, whiteCards);
      roomManager.setGameEngine(room.code, engine);
    } catch {
      room.status = 'LOBBY';
      callback({ error: 'Chyba při inicializaci hry — zkontroluj sady karet.' });
      return;
    }

    broadcastPublicRooms(io);
    callback({ ok: true });

    // Spusť první kolo (broadcast stateUpdate + game:roundStart + timer)
    try {
      startNewRound(room, engine, io);
    } catch {
      io.to(`room:${room.code}`).emit('game:error', 'Chyba při inicializaci hry — zkontroluj sady karet.');
    }
  });
```

**Poznámka:** Odstraň staré `roundNumber` a `czarId` lokální proměnné — `startNewRound` je nyní spravuje.

**Step 3: Odstraň `'game:error'` ze `serverToClientEvents` pokud se použil import — nic nového nepotřebujeme**

**Step 4: Ověř kompilaci**

```bash
npm run build --workspace=packages/backend 2>&1 | head -20
```

**Step 5: Spusť testy**

```bash
npm test --workspace=packages/backend
```

**Step 6: Commit**

```bash
git add packages/backend/src/socket/lobbyHandlers.ts
git commit -m "refactor(backend): lobby:startGame uses startNewRound helper"
```

---

### Task 7: roomStore.ts — nové eventy a akce

**Files:**
- Modify: `packages/frontend/src/stores/roomStore.ts`

**Step 1: Přidej `roundSkipped` ref a zpracuj nové eventy**

Za `const lastPlayedCards = ref<WhiteCard[]>([]);` přidej:
```typescript
  const roundSkipped = ref(false);
```

V `init()`, za `socket.on('game:stateSync', ...)` přidej:
```typescript
    socket.on('game:roundSkipped', () => {
      roundSkipped.value = true;
    });
```

V `socket.on('game:roundStart', ...)` na začátek handleru přidej:
```typescript
      roundSkipped.value = false;
```

**Step 2: Přidej akce `endGame` a `returnToLobby`**

Za `async function startGame()` přidej:

```typescript
  async function endGame(): Promise<{ error: string } | null> {
    return new Promise((resolve) => {
      socket.emit('lobby:endGame', (result) => {
        resolve('error' in result ? result : null);
      });
    });
  }

  async function returnToLobby(): Promise<{ error: string } | null> {
    return new Promise((resolve) => {
      socket.emit('lobby:returnToLobby', (result) => {
        resolve('error' in result ? result : null);
      });
    });
  }
```

**Step 3: Přidej `roundSkipped` do `cleanup()`**

```typescript
    roundSkipped.value = false;
```

**Step 4: Přidej `game:roundSkipped` do `socket.off(...)` v `cleanup()`**

```typescript
    socket.off('game:roundSkipped');
```

**Step 5: Exportuj `roundSkipped`, `endGame`, `returnToLobby` v `return`**

```typescript
  return {
    room, myPlayerId, isHost, me,
    hand, currentBlackCard, czarId, submissions, roundResult, selectedCards, isCardCzar,
    roundSkipped,
    init, setRoom, setMyPlayerId, leave,
    updateSettings, kickPlayer, startGame, endGame, returnToLobby, cleanup,
    playCards, judgeSelect, toggleCardSelection, retractCards,
  };
```

**Step 6: Ověř TS kompilaci**

```bash
npm run build --workspace=packages/frontend 2>&1 | head -20
```

**Step 7: Commit**

```bash
git add packages/frontend/src/stores/roomStore.ts
git commit -m "feat(frontend): add roundSkipped, endGame, returnToLobby to roomStore"
```

---

### Task 8: SelectionPhase.vue — submission status + countdown

**Files:**
- Modify: `packages/frontend/src/components/SelectionPhase.vue`

**Step 1: Nahraď celý soubor**

```vue
<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue';
import { useRoomStore } from '../stores/roomStore';
import { socket } from '../socket';

const roomStore = useRoomStore();
const pick = computed(() => roomStore.currentBlackCard?.pick ?? 1);
const canSubmit = computed(() => roomStore.selectedCards.length === pick.value);
const retracting = ref(false);

// --- Countdown ---
const secondsLeft = ref(0);
let countdownInterval: ReturnType<typeof setInterval> | null = null;

watch(
  () => roomStore.room?.roundDeadline,
  (deadline) => {
    if (countdownInterval) clearInterval(countdownInterval);
    if (!deadline) { secondsLeft.value = 0; return; }
    const update = () => {
      secondsLeft.value = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    };
    update();
    countdownInterval = setInterval(update, 1000);
  },
  { immediate: true }
);

onUnmounted(() => {
  if (countdownInterval) clearInterval(countdownInterval);
});

// --- Submission status ---
const players = computed(() => roomStore.room?.players ?? []);
const czar = computed(() => players.value.find(p => p.isCardCzar));
const waitingFor = computed(() => players.value.filter(p => !p.isCardCzar && !p.isAfk && !p.hasPlayed));
const submitted = computed(() => players.value.filter(p => !p.isCardCzar && p.hasPlayed));
const afkPlayers = computed(() => players.value.filter(p => !p.isCardCzar && p.isAfk));

// --- Submit / retract ---
function submit() {
  if (!canSubmit.value) return;
  roomStore.playCards(roomStore.selectedCards.map(c => c.id));
}

function retract() {
  retracting.value = true;
  roomStore.retractCards();
}

watch(() => roomStore.hand, () => { retracting.value = false; });

function onGameError() { retracting.value = false; }
socket.on('game:error', onGameError);
onUnmounted(() => { socket.off('game:error', onGameError); });
</script>

<template>
  <div class="space-y-6">
    <!-- Notifikace: kolo přeskočeno -->
    <div v-if="roomStore.roundSkipped" class="bg-orange-900 border border-orange-500 text-orange-200 rounded-lg px-4 py-3 text-sm">
      Kolo bylo přeskočeno — časový limit vypršel.
    </div>

    <!-- Countdown -->
    <div v-if="secondsLeft > 0" class="flex items-center gap-2">
      <div class="flex-1 bg-gray-700 rounded-full h-2">
        <div
          class="h-2 rounded-full transition-all"
          :class="secondsLeft <= 10 ? 'bg-red-500' : 'bg-yellow-400'"
          :style="{ width: `${(secondsLeft / 45) * 100}%` }"
        />
      </div>
      <span class="text-sm font-mono" :class="secondsLeft <= 10 ? 'text-red-400' : 'text-gray-300'">
        {{ secondsLeft }}s
      </span>
    </div>

    <!-- Černá karta -->
    <div class="bg-black text-white rounded-xl p-6 max-w-sm text-xl font-bold leading-relaxed shadow-lg">
      {{ roomStore.currentBlackCard?.text ?? '...' }}
      <div class="text-sm font-normal mt-2 text-gray-400">
        Vyber {{ pick }} {{ pick === 1 ? 'kartu' : 'karty' }}
      </div>
    </div>

    <!-- Stav odevzdání -->
    <div class="text-sm space-y-1 bg-gray-800 rounded-lg px-4 py-3">
      <div v-if="czar" class="text-yellow-400">
        🎴 {{ czar.nickname }} — Card Czar
      </div>
      <div v-for="p in submitted" :key="p.id" class="text-green-400">
        ✓ {{ p.nickname }}
      </div>
      <div v-for="p in waitingFor" :key="p.id" class="text-gray-400">
        ⏳ {{ p.nickname }}
      </div>
      <div v-for="p in afkPlayers" :key="p.id" class="text-gray-600">
        💤 {{ p.nickname }} (AFK)
      </div>
    </div>

    <!-- Czar čeká -->
    <p v-if="roomStore.isCardCzar" class="text-yellow-400 font-semibold text-lg">
      Jsi Card Czar — čekej, až ostatní vyberou karty.
    </p>

    <!-- Hráč odeslal — může změnit výběr -->
    <div v-else-if="roomStore.me?.hasPlayed" class="space-y-3">
      <p class="text-green-400 font-semibold text-lg">
        Karty odeslány — čekáme na ostatní...
      </p>
      <button
        @click="retract"
        :disabled="retracting"
        class="bg-gray-700 hover:bg-gray-600 text-white font-semibold px-6 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Změnit výběr
      </button>
    </div>

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
git commit -m "feat(frontend): add submission status, countdown timer and skip notification to SelectionPhase"
```

---

### Task 9: JudgingPhase.vue — countdown + notifikace

**Files:**
- Modify: `packages/frontend/src/components/JudgingPhase.vue`

**Step 1: Nahraď celý soubor**

```vue
<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue';
import { useRoomStore } from '../stores/roomStore';

const roomStore = useRoomStore();

// --- Countdown (60s pro JUDGING) ---
const secondsLeft = ref(0);
let countdownInterval: ReturnType<typeof setInterval> | null = null;

watch(
  () => roomStore.room?.roundDeadline,
  (deadline) => {
    if (countdownInterval) clearInterval(countdownInterval);
    if (!deadline) { secondsLeft.value = 0; return; }
    const update = () => {
      secondsLeft.value = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    };
    update();
    countdownInterval = setInterval(update, 1000);
  },
  { immediate: true }
);

onUnmounted(() => {
  if (countdownInterval) clearInterval(countdownInterval);
});

function pickWinner(submissionId: string) {
  if (!roomStore.isCardCzar) return;
  roomStore.judgeSelect(submissionId);
}
</script>

<template>
  <div class="space-y-6">
    <!-- Notifikace: kolo přeskočeno -->
    <div v-if="roomStore.roundSkipped" class="bg-orange-900 border border-orange-500 text-orange-200 rounded-lg px-4 py-3 text-sm">
      Kolo bylo přeskočeno — časový limit vypršel.
    </div>

    <!-- Countdown (pouze pro cara) -->
    <div v-if="roomStore.isCardCzar && secondsLeft > 0" class="flex items-center gap-2">
      <div class="flex-1 bg-gray-700 rounded-full h-2">
        <div
          class="h-2 rounded-full transition-all"
          :class="secondsLeft <= 10 ? 'bg-red-500' : 'bg-yellow-400'"
          :style="{ width: `${(secondsLeft / 60) * 100}%` }"
        />
      </div>
      <span class="text-sm font-mono" :class="secondsLeft <= 10 ? 'text-red-400' : 'text-gray-300'">
        {{ secondsLeft }}s
      </span>
    </div>

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
      <span v-if="secondsLeft > 0" class="ml-2 text-sm text-gray-500">({{ secondsLeft }}s)</span>
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
git commit -m "feat(frontend): add countdown timer and skip notification to JudgingPhase"
```

---

### Task 10: ResultsPhase.vue — tlačítko Ukončit hru pro hosta

**Files:**
- Modify: `packages/frontend/src/components/ResultsPhase.vue`

**Step 1: Přidej endGame logiku a tlačítko**

Nahraď `<script setup>`:
```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoomStore } from '../stores/roomStore';

const roomStore = useRoomStore();
const endingGame = ref(false);
const endGameError = ref('');

const scoreboard = computed(() => {
  const result = roomStore.roundResult;
  const players = roomStore.room?.players ?? [];
  if (!result) return [];
  return players
    .map(p => ({ nickname: p.nickname, score: result.scores[p.id] ?? 0 }))
    .sort((a, b) => b.score - a.score);
});

async function onEndGame() {
  endingGame.value = true;
  const err = await roomStore.endGame();
  if (err) {
    endGameError.value = err.error;
    endingGame.value = false;
  }
}
</script>
```

Na konec `<template>`, před uzavírající `</div>`, přidej:
```vue
    <!-- Host: ukončit hru -->
    <div v-if="roomStore.isHost" class="pt-4 border-t border-gray-700">
      <p v-if="endGameError" class="text-red-400 text-sm mb-2">{{ endGameError }}</p>
      <button
        @click="onEndGame"
        :disabled="endingGame"
        class="bg-red-700 hover:bg-red-600 text-white font-semibold px-6 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Ukončit hru
      </button>
    </div>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/ResultsPhase.vue
git commit -m "feat(frontend): add end game button for host in ResultsPhase"
```

---

### Task 11: FinishedPhase.vue — nová komponenta

**Files:**
- Create: `packages/frontend/src/components/FinishedPhase.vue`

**Step 1: Vytvoř soubor**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoomStore } from '../stores/roomStore';

const roomStore = useRoomStore();
const returning = ref(false);
const returnError = ref('');

const scoreboard = computed(() => {
  const players = roomStore.room?.players ?? [];
  return [...players]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ rank: i + 1, id: p.id, nickname: p.nickname, score: p.score }));
});

async function onReturnToLobby() {
  returning.value = true;
  const err = await roomStore.returnToLobby();
  if (err) {
    returnError.value = err.error;
    returning.value = false;
  }
}
</script>

<template>
  <div class="space-y-8 text-center max-w-md mx-auto">
    <div>
      <h2 class="text-4xl font-bold text-yellow-400 mb-1">Hra skončila!</h2>
      <p class="text-gray-400">Finální výsledky</p>
    </div>

    <!-- Podium: top 3 -->
    <div v-if="scoreboard.length > 0" class="flex items-end justify-center gap-4">
      <div v-if="scoreboard[1]" class="text-center">
        <div class="bg-gray-600 rounded-t-lg px-4 py-6 w-24">
          <p class="font-bold truncate">{{ scoreboard[1].nickname }}</p>
          <p class="text-2xl font-bold text-gray-300">{{ scoreboard[1].score }}</p>
        </div>
        <div class="bg-gray-500 text-center py-1 rounded-b-sm text-sm">2.</div>
      </div>
      <div v-if="scoreboard[0]" class="text-center">
        <div class="bg-yellow-700 rounded-t-lg px-4 py-8 w-28">
          <p class="text-2xl">🏆</p>
          <p class="font-bold truncate">{{ scoreboard[0].nickname }}</p>
          <p class="text-2xl font-bold text-yellow-300">{{ scoreboard[0].score }}</p>
        </div>
        <div class="bg-yellow-600 text-center py-1 rounded-b-sm text-sm font-bold">1.</div>
      </div>
      <div v-if="scoreboard[2]" class="text-center">
        <div class="bg-gray-700 rounded-t-lg px-4 py-4 w-24">
          <p class="font-bold truncate">{{ scoreboard[2].nickname }}</p>
          <p class="text-2xl font-bold text-gray-400">{{ scoreboard[2].score }}</p>
        </div>
        <div class="bg-gray-600 text-center py-1 rounded-b-sm text-sm">3.</div>
      </div>
    </div>

    <!-- Kompletní tabulka -->
    <div class="text-left">
      <div
        v-for="entry in scoreboard"
        :key="entry.id"
        class="flex justify-between items-center py-2 border-b border-gray-700"
      >
        <span class="text-gray-400 w-6">{{ entry.rank }}.</span>
        <span class="flex-1 ml-2">{{ entry.nickname }}</span>
        <span class="font-bold text-yellow-400">{{ entry.score }}</span>
      </div>
    </div>

    <!-- Akce -->
    <div class="pt-2">
      <p v-if="returnError" class="text-red-400 text-sm mb-2">{{ returnError }}</p>

      <button
        v-if="roomStore.isHost"
        @click="onReturnToLobby"
        :disabled="returning"
        class="bg-green-600 hover:bg-green-500 text-white font-bold px-8 py-3 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Návrat do lobby
      </button>
      <p v-else class="text-gray-500 text-sm">
        Čekáme na hostitele...
      </p>
    </div>
  </div>
</template>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/FinishedPhase.vue
git commit -m "feat(frontend): add FinishedPhase component with podium and return to lobby"
```

---

### Task 12: RoomView.vue — FinishedPhase + oprava redirectu

**Files:**
- Modify: `packages/frontend/src/views/RoomView.vue`

**Step 1: Přidej import FinishedPhase**

Za `import ResultsPhase from '../components/ResultsPhase.vue';` přidej:
```typescript
import FinishedPhase from '../components/FinishedPhase.vue';
```

**Step 2: Přidej render FinishedPhase do template**

Za:
```vue
<ResultsPhase v-else-if="roomStore.room.status === 'RESULTS'" />
```
Přidej:
```vue
<FinishedPhase v-else-if="roomStore.room.status === 'FINISHED'" />
```

**Step 3: Oprav přesměrování při chybě — bez delay, s query parametrem**

Nahraď oba bloky s `errorMsg` + `setTimeout` redirect:

V `onMounted`, nahraď:
```typescript
      errorMsg.value = result.error;
      setTimeout(() => router.push('/'), 2000);
      return;
```
novým kódem:
```typescript
      router.push({ path: '/', query: { error: result.error } });
      return;
```

V `onNicknameSubmit`, nahraď:
```typescript
    errorMsg.value = result.error;
    return;
```
novým kódem:
```typescript
    // Pro případ, že chyba nastane při zadání přezdívky (např. místnost mezitím zanikla)
    router.push({ path: '/', query: { error: result.error } });
    return;
```

**Poznámka:** `errorMsg` ref a `<p v-if="errorMsg">` v template lze ponechat pro případy, kde nevyžadujeme redirect (např. budoucí rozšíření), ale primárně redirect nahrazuje zobrazení chyby v RoomView.

**Step 4: Commit**

```bash
git add packages/frontend/src/views/RoomView.vue
git commit -m "feat(frontend): render FinishedPhase, redirect to lobby with error on invalid room"
```

---

### Task 13: HomeView.vue — čtení chyby z query params

**Files:**
- Modify: `packages/frontend/src/views/HomeView.vue`

**Step 1: Přidej import useRoute**

Za `import { useRouter } from 'vue-router';` přidej:
```typescript
import { useRoute } from 'vue-router';
```

**Step 2: Přidej instanci route**

Za `const router = useRouter();` přidej:
```typescript
const route = useRoute();
```

**Step 3: Čti chybu z query v onMounted**

Nahraď:
```typescript
onMounted(() => lobbyStore.subscribe());
```
novým kódem:
```typescript
onMounted(() => {
  lobbyStore.subscribe();
  if (route.query.error) {
    errorMsg.value = route.query.error as string;
  }
});
```

**Step 4: Ověř kompilaci**

```bash
npm run build --workspace=packages/frontend 2>&1 | head -20
```

**Step 5: Spusť všechny testy**

```bash
npm test --workspace=packages/backend
```

**Step 6: Commit**

```bash
git add packages/frontend/src/views/HomeView.vue
git commit -m "feat(frontend): show redirect error message in HomeView from query param"
```

---

## Finální ověření

```bash
# Kompletní build všech balíčků
npm run build

# Testy backendu
npm test --workspace=packages/backend
```

Očekáváno: 0 TS chyb, všechny testy zelené.
