# Code Review Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 6 issues from the code review: remove `socketId` from shared `Player` type, add `tokenToSocketId` reverse map, export timeout constants from `@kpl/shared`, fix GarbageCollector comment, fix `cardSets.ts` subqueries, and add socket handler tests.

**Architecture:**
- `socketId` moves from `Player` interface (shared) into a private map inside `RoomManager` (`_playerSocketIds: Map<playerId, socketId>`). Handlers call `roomManager.getSocketId/setSocketId/clearSocketIdByToken`. `toPublicRoom()` body becomes a pass-through.
- `tokenToSocketId: Map<playerToken, socket.id>` added to `socketState.ts` alongside existing `socketToToken`, maintained in all four places that touch `socketToToken` (create, join, disconnect, leave/game:leave).
- Timeout constants (`SELECTION_TIMEOUT_S = 45`, `JUDGING_TIMEOUT_S = 60`) exported from `@kpl/shared`, imported in `roundUtils.ts` and both phase components.

**Tech Stack:** TypeScript, Node.js, Vitest (unit tests), Socket.io, Vue 3, @kpl/shared (monorepo workspace)

---

## Task 1: Remove `socketId` from shared `Player` — add private map to RoomManager

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/backend/src/game/RoomManager.ts`

### Step 1: Remove `socketId` from `Player` in shared types

In `packages/shared/src/index.ts`, remove the `socketId` line from `Player`:

```ts
export interface Player {
  id: string;
  // socketId: string | null;   ← DELETE this line
  isOnline: boolean;
  nickname: string;
  avatarUrl: string | null;
  score: number;
  isCardCzar: boolean;
  hasPlayed: boolean;
  tradedThisRound: boolean;
  isAfk: boolean;
}
```

### Step 2: Add private map and public API to RoomManager

At the top of the class body (after the existing private fields), add:

```ts
private readonly _playerSocketIds = new Map<string, string>(); // playerId → socket.id
```

Add four new public methods after the existing `getPlayerIdByToken` method:

```ts
getSocketId(playerId: string): string | undefined {
  return this._playerSocketIds.get(playerId);
}

setSocketId(playerId: string, socketId: string): void {
  this._playerSocketIds.set(playerId, socketId);
}

clearSocketId(playerId: string): void {
  this._playerSocketIds.delete(playerId);
}

clearSocketIdByToken(playerToken: string): void {
  const playerId = this.tokenToPlayerId.get(playerToken);
  if (playerId) this._playerSocketIds.delete(playerId);
}
```

### Step 3: Remove all `player.socketId` accesses from RoomManager

**In `createRoom()`** (around line 105): remove `socketId: null` from the Player literal.

**In `joinRoom()`** (around line 195): remove `socketId: null` from the new Player literal.

**In `reconnect()`** (around line 215–235):
- Remove the `socketId: string | null` parameter (simplify to `reconnect(playerToken: string): GameRoom | null`)
- Remove `player.socketId = socketId;`

**In `handleDisconnect()`** (around line 257): replace `player.socketId = null;` with:
```ts
this.clearSocketIdByToken(playerToken);
```

**In `finishGame()`** (around line 596): replace `if (p.socketId !== null) p.isAfk = false;` with:
```ts
if (this._playerSocketIds.has(p.id)) p.isAfk = false;
```

### Step 4: Check TypeScript compiles

```bash
npm run build --workspace=packages/backend 2>&1 | head -50
```

Expected: errors only about callers that still reference `player.socketId` (will fix in Tasks 2–3).

---

## Task 2: Update `lobbyHandlers.ts` — remove `player.socketId` assignments, add socketId map calls

**Files:**
- Modify: `packages/backend/src/socket/lobbyHandlers.ts`

### Step 1: After `lobby:create` — replace `player.socketId = socket.id`

Current code (around line 54–55):
```ts
const player = room.players.find(p => p.id === playerId);
if (player) player.socketId = socket.id;
```

Replace with:
```ts
roomManager.setSocketId(playerId, socket.id);
```

(Remove the `player` variable if it's no longer needed here.)

### Step 2: After `lobby:join` — same replacement (around line 88–89)

```ts
const player = room.players.find(p => p.id === playerId);
if (player) player.socketId = socket.id;
```

Replace with:
```ts
roomManager.setSocketId(playerId, socket.id);
```

Note: The `player` variable is still needed for reconnect state sync below (checking `player?.isCardCzar`), so keep the `room.players.find` but remove the socketId assignment from it:
```ts
const player = room.players.find(p => p.id === playerId);
roomManager.setSocketId(playerId, socket.id);
```

### Step 3: In `disconnect` handler — add `clearSocketIdByToken`

After `socketToToken.delete(socket.id)`, add:
```ts
roomManager.clearSocketIdByToken(playerToken);
```

### Step 4: In `lobby:leave` handler — add `clearSocketIdByToken`

After `socketToToken.delete(socket.id)`, add:
```ts
roomManager.clearSocketIdByToken(playerToken);
```

### Step 5: Build check

```bash
npm run build --workspace=packages/backend 2>&1 | head -50
```

---

## Task 3: Update `gameHandlers.ts` and `roundUtils.ts` — replace `player.socketId` reads

**Files:**
- Modify: `packages/backend/src/socket/roundUtils.ts`
- Modify: `packages/backend/src/socket/gameHandlers.ts`

### Step 1: Fix `roundUtils.ts` — `startNewRound`

Line 33 (`if (player.isAfk && player.socketId !== null)`):
```ts
if (player.isAfk && roomManager.getSocketId(player.id) !== undefined) {
```

Lines 50–52 (Wheaton's Law czar socket lookup):
```ts
const czarSocketId = roomManager.getSocketId(czarId);
if (czarSocketId) {
  const czarSocket = io.sockets.sockets.get(czarSocketId);
```
Replace:
```ts
const czar = room.players.find(p => p.id === czarId);
if (czar?.socketId) {
  const czarSocket = io.sockets.sockets.get(czar.socketId);
```
With:
```ts
const czarSocketId = roomManager.getSocketId(czarId);
if (czarSocketId) {
  const czarSocket = io.sockets.sockets.get(czarSocketId);
```

Lines 64–74 (per-player `game:roundStart` emit loop):
```ts
for (const player of room.players) {
  if (!player.socketId) continue;
  const playerSocket = io.sockets.sockets.get(player.socketId);
```
Replace with:
```ts
for (const player of room.players) {
  const sid = roomManager.getSocketId(player.id);
  if (!sid) continue;
  const playerSocket = io.sockets.sockets.get(sid);
```

### Step 2: Fix `roundUtils.ts` — `finalizeRoundStart`

Lines 93–95 (same per-player loop pattern):
```ts
for (const player of room.players) {
  if (!player.socketId) continue;
  const playerSocket = io.sockets.sockets.get(player.socketId);
```
Replace with:
```ts
for (const player of room.players) {
  const sid = roomManager.getSocketId(player.id);
  if (!sid) continue;
  const playerSocket = io.sockets.sockets.get(sid);
```

### Step 3: Simplify `toPublicRoom`

Since `Player` no longer has `socketId`, the function no longer needs to null it out:

```ts
/** Pass-through — kept for forward-compatibility if server-only fields are added later. */
export function toPublicRoom(room: GameRoom): GameRoom {
  return room;
}
```

### Step 4: Fix `gameHandlers.ts` — `game:czarForceAdvance`

Line 276 (`p.socketId !== null`):
```ts
if (!p.isAfk && !p.isCardCzar && !p.hasPlayed && p.socketId !== null) {
```
Replace with:
```ts
if (!p.isAfk && !p.isCardCzar && !p.hasPlayed && roomManager.getSocketId(p.id) !== undefined) {
```

### Step 5: Fix `game:leave` handler — add `clearSocketIdByToken`

In `gameHandlers.ts`, in the `game:leave` handler after `socketToToken.delete(socket.id)`:
```ts
roomManager.clearSocketIdByToken(playerToken);
```

### Step 6: Build and test

```bash
npm run build --workspace=packages/backend 2>&1 | head -50
npm test --workspace=packages/backend 2>&1 | tail -20
```

Expected: all 119 tests pass, no build errors.

---

## Task 4: Add `tokenToSocketId` reverse map to `socketState.ts`

**Files:**
- Modify: `packages/backend/src/socket/socketState.ts`
- Modify: `packages/backend/src/socket/lobbyHandlers.ts`
- Modify: `packages/backend/src/socket/gameHandlers.ts`

### Step 1: Export reverse map from socketState

```ts
// packages/backend/src/socket/socketState.ts
export const socketToToken = new Map<string, string>();      // socket.id → playerToken
export const tokenToSocketId = new Map<string, string>();   // playerToken → socket.id
```

### Step 2: Import in both handler files

```ts
import { socketToToken, tokenToSocketId } from './socketState.js';
```

### Step 3: Maintain the reverse map in `lobbyHandlers.ts`

Every `socketToToken.set(socket.id, playerToken)` must be paired with `tokenToSocketId.set(playerToken, socket.id)`:

- After `lobby:create` → add `tokenToSocketId.set(playerToken, socket.id)`
- After `lobby:join` → add `tokenToSocketId.set(playerToken, socket.id)`

Every `socketToToken.delete(socket.id)` must be paired with `tokenToSocketId.delete(playerToken)`:

- `disconnect`: After `socketToToken.delete(socket.id)`:
  ```ts
  tokenToSocketId.delete(playerToken);
  ```
- `lobby:leave`: same

### Step 4: Replace O(n) scan in `lobby:kickPlayer` (lobbyHandlers.ts)

Current (lines 175–184):
```ts
for (const [sid, token] of socketToToken.entries()) {
  if (token === result.kickedPlayerToken) {
    io.to(sid).emit('lobby:kicked');
    socketToToken.delete(sid);
    const kickedSocket = io.sockets.sockets.get(sid);
    if (kickedSocket) kickedSocket.leave(`room:${result.room.code}`);
    break;
  }
}
```

Replace with:
```ts
const kickedSid = tokenToSocketId.get(result.kickedPlayerToken);
if (kickedSid) {
  io.to(kickedSid).emit('lobby:kicked');
  socketToToken.delete(kickedSid);
  tokenToSocketId.delete(result.kickedPlayerToken);
  const kickedSocket = io.sockets.sockets.get(kickedSid);
  if (kickedSocket) kickedSocket.leave(`room:${result.room.code}`);
}
```

### Step 5: Extract helper for kicked-tokens cleanup in `gameHandlers.ts`

There are 4 identical loops in `gameHandlers.ts` for cleaning up kicked player sockets after `finishGame`:

```ts
for (const [sid, token] of socketToToken.entries()) {
  if (finishResult.kickedTokens.includes(token)) {
    const kickedSocket = io.sockets.sockets.get(sid);
    if (kickedSocket) kickedSocket.leave(`room:${roomCode}`);
    socketToToken.delete(sid);
  }
}
```

**Extract a helper function at the top of `gameHandlers.ts`** (before `registerGameHandlers`):

```ts
function cleanupKickedSockets(
  io: IO,
  kickedTokens: string[],
  roomCode: string,
): void {
  for (const token of kickedTokens) {
    const sid = tokenToSocketId.get(token);
    if (!sid) continue;
    const kickedSocket = io.sockets.sockets.get(sid);
    if (kickedSocket) kickedSocket.leave(`room:${roomCode}`);
    socketToToken.delete(sid);
    tokenToSocketId.delete(token);
  }
}
```

Replace all 4 loops with `cleanupKickedSockets(io, finishResult.kickedTokens, roomCode)`.

Also maintain `tokenToSocketId` in `game:leave`:
```ts
socketToToken.delete(socket.id);
tokenToSocketId.delete(playerToken);
```

### Step 6: Build and test

```bash
npm run build --workspace=packages/backend 2>&1 | head -30
npm test --workspace=packages/backend 2>&1 | tail -20
```

Expected: 119 tests pass.

---

## Task 5: Export timeout constants from `@kpl/shared`

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/backend/src/socket/roundUtils.ts`
- Modify: `packages/frontend/src/components/SelectionPhase.vue`
- Modify: `packages/frontend/src/components/JudgingPhase.vue`

### Step 1: Add constants to shared types

At the bottom of `packages/shared/src/index.ts`:

```ts
// Herní časové limity (sekundy) — synchronizováno frontend ↔ backend
export const SELECTION_TIMEOUT_S = 45;
export const JUDGING_TIMEOUT_S = 60;
```

### Step 2: Update `roundUtils.ts` to import from shared

Remove:
```ts
const SELECTION_TIMEOUT_MS = 45_000;
const JUDGING_TIMEOUT_MS = 60_000;
```

Add to imports:
```ts
import { ..., SELECTION_TIMEOUT_S, JUDGING_TIMEOUT_S } from '@kpl/shared';
```

Replace all `SELECTION_TIMEOUT_MS` with `SELECTION_TIMEOUT_S * 1000` and `JUDGING_TIMEOUT_MS` with `JUDGING_TIMEOUT_S * 1000`.

Or define local `_MS` aliases at top of file:
```ts
const SELECTION_TIMEOUT_MS = SELECTION_TIMEOUT_S * 1000;
const JUDGING_TIMEOUT_MS = JUDGING_TIMEOUT_S * 1000;
```

### Step 3: Update `SelectionPhase.vue` — replace magic numbers

Add to `<script setup>` imports:
```ts
import { SELECTION_TIMEOUT_S } from '@kpl/shared';
```

Replace all three `:totalSeconds="45"` with `:totalSeconds="SELECTION_TIMEOUT_S"`.

### Step 4: Update `JudgingPhase.vue`

Add import:
```ts
import { JUDGING_TIMEOUT_S } from '@kpl/shared';
```

Replace `:totalSeconds="60"` with `:totalSeconds="JUDGING_TIMEOUT_S"`.

### Step 5: Build both packages

```bash
npm run build --workspace=packages/shared
npm run build --workspace=packages/backend 2>&1 | head -20
npm run build --workspace=packages/frontend 2>&1 | head -20
```

---

## Task 6: Fix GarbageCollector — add safety comment

**Files:**
- Modify: `packages/backend/src/game/GarbageCollector.ts`

### Step 1: Add comment explaining safe iteration

Replace:
```ts
for (const room of roomManager.getAllRooms()) {
```

With:
```ts
// Safe: Map.values() iterator skips deleted entries — collect-then-delete not required
for (const room of roomManager.getAllRooms()) {
```

### Step 2: Commit

```bash
git add packages/backend/src/game/GarbageCollector.ts
git commit -m "docs: clarify GarbageCollector map iteration safety"
```

---

## Task 7: Fix `cardSets.ts` — replace correlated subqueries with JOIN

**Files:**
- Modify: `packages/backend/src/routes/cardSets.ts`

### Step 1: Rewrite query using LEFT JOIN + GROUP BY

Replace the `db('card_sets').select(...)` call with:

```ts
const rows = await db('card_sets')
  .leftJoin('card_set_black_cards as csbc', 'csbc.card_set_id', 'card_sets.id')
  .leftJoin('card_set_white_cards as cswc', 'cswc.card_set_id', 'card_sets.id')
  .groupBy('card_sets.id')
  .orderBy('card_sets.name')
  .select<CardSetRow[]>(
    'card_sets.id',
    'card_sets.name',
    'card_sets.description',
    'card_sets.slug',
    db.raw('card_sets.is_public as isPublic'),
    db.raw('COUNT(DISTINCT csbc.black_card_id) as blackCardCount'),
    db.raw('COUNT(DISTINCT cswc.white_card_id) as whiteCardCount'),
  );
```

`COUNT(DISTINCT ...)` is correct here because M:N junction rows are distinct per card already, but using DISTINCT is defensive against any future schema change.

### Step 2: Build and verify output format matches

```bash
npm run build --workspace=packages/backend 2>&1 | head -20
```

Then manually test: `curl http://localhost:3000/api/card-sets` and verify blackCardCount/whiteCardCount values (140 / 565 for current data).

---

## Task 8: Socket handler integration tests

**Files:**
- Create: `packages/backend/src/socket/lobbyHandlers.test.ts`
- Create: `packages/backend/src/socket/gameHandlers.test.ts`

### Context

These tests use Socket.io's test-mode: create a real `Server` on a random port, connect real `io()` client sockets, and test end-to-end behavior without mocking internals.

Pattern used by other Socket.io tests:
```ts
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as ioc } from 'socket.io-client';
```

Check if `socket.io-client` is already installed:
```bash
cat packages/backend/package.json | grep socket
```

If not present, install: `npm install --save-dev socket.io-client --workspace=packages/backend`

### Step 1: Create test helper `packages/backend/src/socket/testUtils.ts`

```ts
import { createServer } from 'http';
import { AddressInfo } from 'net';
import { Server } from 'socket.io';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@kpl/shared';
import { registerLobbyHandlers } from './lobbyHandlers.js';
import { registerGameHandlers } from './gameHandlers.js';
import { socketToToken, tokenToSocketId } from './socketState.js';

export function createTestServer() {
  const httpServer = createServer();
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);

  io.on('connection', (socket) => {
    registerLobbyHandlers(io, socket);
    registerGameHandlers(io, socket);
  });

  return new Promise<{ io: Server; port: number; cleanup: () => void }>((resolve) => {
    httpServer.listen(0, () => {
      const port = (httpServer.address() as AddressInfo).port;
      const cleanup = () => {
        io.close();
        httpServer.close();
        socketToToken.clear();
        tokenToSocketId.clear();
      };
      resolve({ io, port, cleanup });
    });
  });
}

export function connectClient(port: number): ClientSocket {
  return ioc(`http://localhost:${port}`, { autoConnect: false });
}
```

### Step 2: Write `lobbyHandlers.test.ts` — lobby create + join + reconnect + disconnect

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestServer, connectClient } from './testUtils.js';

describe('lobbyHandlers', () => {
  let port: number;
  let cleanup: () => void;

  beforeEach(async () => {
    const server = await createTestServer();
    port = server.port;
    cleanup = server.cleanup;
  });

  afterEach(() => cleanup());

  it('creates a room and returns playerToken + playerId', async () => {
    const client = connectClient(port);
    client.connect();
    await new Promise<void>((resolve) => {
      client.emit('lobby:create', {
        name: 'Test room', isPublic: false, selectedSetIds: [1],
        maxPlayers: 8, nickname: 'Alice', targetScore: 8,
        specialRules: [], winCondition: 'score',
      }, (result) => {
        expect('room' in result).toBe(true);
        if ('room' in result) {
          expect(result.room.code).toHaveLength(6);
          expect(result.playerToken).toBeTruthy();
          expect(result.playerId).toBeTruthy();
        }
        resolve();
      });
    });
    client.disconnect();
  });

  it('join reuses existing playerToken (reconnect)', async () => {
    const client1 = connectClient(port);
    client1.connect();

    let roomCode = '';
    let savedToken = '';

    await new Promise<void>((resolve) => {
      client1.emit('lobby:create', {
        name: 'Reconnect room', isPublic: false, selectedSetIds: [1],
        maxPlayers: 8, nickname: 'Bob', targetScore: 8, specialRules: [],
      }, (result) => {
        if ('room' in result) {
          roomCode = result.room.code;
          savedToken = result.playerToken;
        }
        resolve();
      });
    });

    client1.disconnect();
    await new Promise(r => setTimeout(r, 100)); // let disconnect propagate

    const client2 = connectClient(port);
    client2.connect();

    await new Promise<void>((resolve) => {
      client2.emit('lobby:join', {
        code: roomCode, nickname: 'Bob', playerToken: savedToken,
      }, (result) => {
        expect('room' in result).toBe(true);
        if ('room' in result) {
          expect(result.playerToken).toBe(savedToken); // same token → reconnect
          expect(result.room.players[0].isOnline).toBe(true);
        }
        resolve();
      });
    });

    client2.disconnect();
  });

  it('rejects join to non-existent room', async () => {
    const client = connectClient(port);
    client.connect();
    await new Promise<void>((resolve) => {
      client.emit('lobby:join', { code: 'ZZZZZZ', nickname: 'Ghost' }, (result) => {
        expect('error' in result).toBe(true);
        resolve();
      });
    });
    client.disconnect();
  });

  it('marks player isOnline: false on disconnect', async () => {
    const hostClient = connectClient(port);
    const guestClient = connectClient(port);
    hostClient.connect();
    guestClient.connect();

    let roomCode = '';

    await new Promise<void>((resolve) => {
      hostClient.emit('lobby:create', {
        name: 'DC test', isPublic: false, selectedSetIds: [1],
        maxPlayers: 8, nickname: 'Host', targetScore: 8, specialRules: [],
      }, (r) => {
        if ('room' in r) roomCode = r.room.code;
        resolve();
      });
    });

    await new Promise<void>((resolve) => {
      guestClient.emit('lobby:join', { code: roomCode, nickname: 'Guest' }, () => resolve());
    });

    // Listen for stateUpdate after guest disconnects
    const stateUpdate = new Promise<void>((resolve) => {
      hostClient.on('lobby:stateUpdate', (room) => {
        const guest = room.players.find(p => p.nickname === 'Guest');
        if (guest && !guest.isOnline) resolve();
      });
    });

    guestClient.disconnect();
    await stateUpdate;
    hostClient.disconnect();
  });

  it('kicked player receives lobby:kicked', async () => {
    const hostClient = connectClient(port);
    const guestClient = connectClient(port);
    hostClient.connect();
    guestClient.connect();

    let roomCode = '';
    let guestPlayerId = '';

    await new Promise<void>((resolve) => {
      hostClient.emit('lobby:create', {
        name: 'Kick test', isPublic: false, selectedSetIds: [1],
        maxPlayers: 8, nickname: 'Host', targetScore: 8, specialRules: [],
      }, (r) => {
        if ('room' in r) roomCode = r.room.code;
        resolve();
      });
    });

    await new Promise<void>((resolve) => {
      guestClient.emit('lobby:join', { code: roomCode, nickname: 'Guest' }, (r) => {
        if ('playerId' in r) guestPlayerId = r.playerId;
        resolve();
      });
    });

    const kicked = new Promise<void>((resolve) => {
      guestClient.on('lobby:kicked', () => resolve());
    });

    hostClient.emit('lobby:kickPlayer', guestPlayerId, () => {});
    await kicked;

    hostClient.disconnect();
    guestClient.disconnect();
  });
});
```

### Step 3: Write `gameHandlers.test.ts` — game:playCards + judgeSelect + win condition

This file is more complex because it needs a real DB for card loading. Use the test DB setup from `vitest.config.ts` (check if a test DB env is configured). If not, mock the card loading using `vi.mock('../../../db/db.js')`.

For a focused, fast test: mock the DB and directly call `roomManager` to set up game state.

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestServer, connectClient } from './testUtils.js';
import { roomManager } from '../game/RoomManager.js';
import { GameEngine } from '../game/GameEngine.js';

// Mock DB so lobby:startGame doesn't hit DB
vi.mock('../db/db.js', () => ({
  default: Object.assign(
    vi.fn(() => ({
      join: vi.fn().mockReturnThis(),
      whereIn: vi.fn().mockReturnThis(),
      distinct: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue([]),
    })),
    { fn: { now: () => new Date() }, raw: vi.fn() }
  ),
}));

// Minimal card sets for GameEngine (5 black + 20 white)
function makeCards() {
  const black = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, text: `Black ${i}`, pick: 1 }));
  const white = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, text: `White ${i}` }));
  return { black, white };
}

describe('gameHandlers — playCards + judgeSelect', () => {
  let port: number;
  let cleanup: () => void;

  beforeEach(async () => {
    const server = await createTestServer();
    port = server.port;
    cleanup = server.cleanup;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('all players submit → transitions to JUDGING', async () => {
    const host = connectClient(port);
    const p2 = connectClient(port);
    const p3 = connectClient(port);
    host.connect(); p2.connect(); p3.connect();

    let roomCode = '';
    let hostToken = '';
    let p2Token = '';
    let p3Token = '';

    await new Promise<void>((resolve) => {
      host.emit('lobby:create', {
        name: 'Game test', isPublic: false, selectedSetIds: [1],
        maxPlayers: 8, nickname: 'Host', targetScore: 8, specialRules: [],
      }, (r) => {
        if ('room' in r) { roomCode = r.room.code; hostToken = r.playerToken; }
        resolve();
      });
    });

    await new Promise<void>((resolve) => {
      p2.emit('lobby:join', { code: roomCode, nickname: 'P2' }, (r) => {
        if ('playerToken' in r) p2Token = r.playerToken;
        resolve();
      });
    });

    await new Promise<void>((resolve) => {
      p3.emit('lobby:join', { code: roomCode, nickname: 'P3' }, (r) => {
        if ('playerToken' in r) p3Token = r.playerToken;
        resolve();
      });
    });

    // Manually bootstrap game state (bypassing DB)
    const room = roomManager.getRoom(roomCode)!;
    const { black, white } = makeCards();
    const engine = new GameEngine(room.players, black, white, [], room.hostId);
    roomManager.setGameEngine(roomCode, engine);
    const { czarId } = engine.startRound();
    room.status = 'SELECTION';
    room.currentBlackCard = engine.currentBlackCard;
    room.roundNumber = engine.roundNumber;

    // Identify non-czar players
    const nonCzarTokens = [hostToken, p2Token, p3Token].filter(token => {
      const pid = roomManager.getPlayerIdByToken(token);
      return pid !== czarId;
    });

    // All non-czars submit a card
    const clients = new Map([[hostToken, host], [p2Token, p2], [p3Token, p3]]);
    const judging = new Promise<void>((resolve) => {
      host.on('lobby:stateUpdate', (r) => {
        if (r.status === 'JUDGING') resolve();
      });
    });

    for (const token of nonCzarTokens) {
      const hand = engine.getPlayerHand(roomManager.getPlayerIdByToken(token)!);
      clients.get(token)!.emit('game:playCards', [hand[0].id]);
    }

    await judging;
    expect(roomManager.getRoom(roomCode)!.status).toBe('JUDGING');

    host.disconnect(); p2.disconnect(); p3.disconnect();
  });
});
```

### Step 4: Run tests

```bash
npm test --workspace=packages/backend 2>&1 | tail -30
```

Expected: original 119 tests + new socket tests pass.

---

## Final: Commit all changes

```bash
git add packages/shared/src/index.ts \
  packages/backend/src/game/RoomManager.ts \
  packages/backend/src/game/GarbageCollector.ts \
  packages/backend/src/socket/socketState.ts \
  packages/backend/src/socket/lobbyHandlers.ts \
  packages/backend/src/socket/gameHandlers.ts \
  packages/backend/src/socket/roundUtils.ts \
  packages/backend/src/socket/testUtils.ts \
  packages/backend/src/socket/lobbyHandlers.test.ts \
  packages/backend/src/socket/gameHandlers.test.ts \
  packages/backend/src/routes/cardSets.ts \
  packages/frontend/src/components/SelectionPhase.vue \
  packages/frontend/src/components/JudgingPhase.vue

git commit -m "refactor: fix 6 code review issues (socketId, reverse map, timeouts, GC, cardSets, socket tests)"
```
