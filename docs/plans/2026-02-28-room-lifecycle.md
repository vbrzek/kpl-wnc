# Room Lifecycle & Garbage Collector — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Přidat cílový počet bodů jako výherní podmínku, přepracovat konec hry (individuální pódium + kick nehóstů), a spustit garbage collector místností.

**Architecture:** Sdílené typy rozšíří `GameRoom` o `targetScore` a `lastActivityAt`. Backend přepracuje `endGame`/`returnToLobby` na `finishGame`, které okamžitě kickne neh óstovské hráče a resetuje místnost do LOBBY. Frontend cachuje `GameOverPayload` v `roomStore.finishedState` a zobrazuje pódium jako overlay nad normálním stavem — každý hráč se rozhodne sám.

**Tech Stack:** TypeScript, Vue 3 + Pinia, Socket.io, Vitest (unit testy na backendu)

---

### Task 1: Sdílené typy — rozšíření GameRoom a nové eventy

**Files:**
- Modify: `packages/shared/src/index.ts`

**Step 1: Přidej `targetScore` a `lastActivityAt` do `GameRoom`, nový typ `GameOverPayload`, nové socket eventy**

```typescript
// GameRoom — přidej dvě pole:
targetScore: number;        // výherní podmínka: 8 | 10 | 15 | 20 | 30
lastActivityAt: number;     // Unix ms timestamp poslední akce (pro GC)

// Nový typ (přidej před GameRoom):
export interface GameOverPayload {
  finalScores: Array<{
    playerId: string;
    nickname: string;
    score: number;
    rank: number;      // 1 = vítěz
  }>;
  roomCode: string;
}

// ServerToClientEvents — přidej:
'game:gameOver': (payload: GameOverPayload) => void;
'room:deleted': () => void;

// ClientToServerEvents — přidej targetScore do lobby:create settings:
// (ve stávajícím interface ClientToServerEvents změň settings v lobby:create)
'lobby:create': (
  settings: {
    name: string;
    isPublic: boolean;
    selectedSetIds: number[];
    maxPlayers: number;
    nickname: string;
    targetScore: number;   // NOVÉ
  },
  callback: ...
) => void;

// ClientToServerEvents — ODSTRAŇ lobby:returnToLobby (nahrazeno novým flow)
```

**Step 2: Zkontroluj TypeScript — ujisti se že build projde**

```bash
npm run build --workspace=packages/shared
```

Expected: build bez chyb (možné varování z backend/frontend které ještě neupravíme)

**Step 3: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): add targetScore, lastActivityAt, GameOverPayload, game:gameOver, room:deleted"
```

---

### Task 2: Backend — RoomManager.finishGame() + updateActivity() + testy

**Files:**
- Modify: `packages/backend/src/game/RoomManager.ts`
- Modify: `packages/backend/src/game/RoomManager.test.ts`

**Step 1: Napiš failing testy pro `finishGame` a `updateActivity`**

Přidej na konec `RoomManager.test.ts`:

```typescript
describe('finishGame', () => {
  function setupRoom() {
    const rm = new RoomManager();
    const { room, playerToken: hostToken } = rm.createRoom({
      name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6,
      nickname: 'Alice', targetScore: 10,
    });
    const r2 = rm.joinRoom(room.code, 'Bob');
    const r3 = rm.joinRoom(room.code, 'Charlie');
    const bobToken = 'error' in r2 ? '' : r2.playerToken;
    const charlieToken = 'error' in r3 ? '' : r3.playerToken;
    // Set scores
    const bobId = rm.getPlayerIdByToken(bobToken)!;
    const charlieId = rm.getPlayerIdByToken(charlieToken)!;
    room.players.find(p => p.id === bobId)!.score = 10;
    room.players.find(p => p.id === charlieId)!.score = 5;
    return { rm, room, hostToken, bobToken, charlieToken, bobId, charlieId };
  }

  it('returns GameOverPayload with sorted final scores', () => {
    const { rm, room } = setupRoom();
    const result = rm.finishGame(room.code);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.payload.roomCode).toBe(room.code);
    expect(result.payload.finalScores[0].rank).toBe(1);
    expect(result.payload.finalScores[0].score).toBe(10); // Bob wins
  });

  it('kicks all non-host players from room', () => {
    const { rm, room, bobToken, charlieToken } = setupRoom();
    rm.finishGame(room.code);
    expect(rm.getRoomByPlayerToken(bobToken)).toBeNull();
    expect(rm.getRoomByPlayerToken(charlieToken)).toBeNull();
    expect(room.players).toHaveLength(1); // jen host
  });

  it('returns kicked player tokens', () => {
    const { rm, room, bobToken, charlieToken } = setupRoom();
    const result = rm.finishGame(room.code);
    if ('error' in result) return;
    expect(result.kickedTokens).toContain(bobToken);
    expect(result.kickedTokens).toContain(charlieToken);
    expect(result.kickedTokens).toHaveLength(2);
  });

  it('resets room to LOBBY with zeroed scores', () => {
    const { rm, room } = setupRoom();
    rm.finishGame(room.code);
    expect(room.status).toBe('LOBBY');
    for (const p of room.players) {
      expect(p.score).toBe(0);
    }
  });

  it('returns error for unknown room code', () => {
    const rm = new RoomManager();
    const result = rm.finishGame('xxxxxx');
    expect('error' in result).toBe(true);
  });
});

describe('updateActivity', () => {
  it('updates lastActivityAt', () => {
    vi.useFakeTimers();
    const rm = new RoomManager();
    const { room } = rm.createRoom({
      name: 'T', isPublic: false, selectedSetIds: [1], maxPlayers: 4,
      nickname: 'A', targetScore: 10,
    });
    const before = room.lastActivityAt;
    vi.advanceTimersByTime(1000);
    rm.updateActivity(room.code);
    expect(room.lastActivityAt).toBeGreaterThan(before);
    vi.useRealTimers();
  });
});
```

**Step 2: Spusť testy — ujisti se že failují**

```bash
npm test --workspace=packages/backend 2>&1 | tail -30
```

Expected: FAIL — `finishGame` and `updateActivity` not defined

**Step 3: Implementuj v `RoomManager.ts`**

Přidej `targetScore` do `CreateRoomSettings`:
```typescript
export interface CreateRoomSettings {
  name: string;
  isPublic: boolean;
  selectedSetIds: number[];
  maxPlayers: number;
  nickname: string;
  targetScore: number;    // NOVÉ
}
```

Přidej `targetScore` a `lastActivityAt` do `createRoom`:
```typescript
// V createRoom(), do room objektu přidej:
targetScore: settings.targetScore,
lastActivityAt: Date.now(),
```

Přidej nový result type nad `endGame`:
```typescript
export interface FinishGameResult {
  room: GameRoom;
  payload: GameOverPayload;
  kickedTokens: string[];
}
```

Přidej import `GameOverPayload` ze `@kpl/shared`.

Přidej novou metodu `finishGame(code: string): FinishGameResult | ErrorResult`:
```typescript
finishGame(code: string): FinishGameResult | ErrorResult {
  const room = this.rooms.get(code);
  if (!room) return { error: 'Místnost nebyla nalezena.' };

  this.clearAllGameTimers(code);
  this.engines.delete(code);

  // Sestav payload PŘED resetem skóre
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  const payload: GameOverPayload = {
    roomCode: code,
    finalScores: sorted.map((p, i) => ({
      playerId: p.id,
      nickname: p.nickname,
      score: p.score,
      rank: i + 1,
    })),
  };

  // Najdi tokeny nehóstovských hráčů
  const kickedTokens: string[] = [];
  for (const [token, pid] of this.tokenToPlayerId.entries()) {
    if (this.playerRooms.get(token) === code && pid !== room.hostId) {
      kickedTokens.push(token);
    }
  }

  // Vyhod nehóstovské hráče
  for (const token of kickedTokens) {
    const timer = this.afkTimers.get(token);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.afkTimers.delete(token);
    }
    this.playerRooms.delete(token);
    this.tokenToPlayerId.delete(token);
  }
  room.players = room.players.filter(p => p.id === room.hostId);

  // Reset místnosti do LOBBY
  room.status = 'LOBBY';
  room.roundDeadline = null;
  room.currentBlackCard = null;
  room.roundNumber = 0;
  room.lastActivityAt = Date.now();
  for (const p of room.players) {
    p.score = 0;
    p.isCardCzar = false;
    p.hasPlayed = false;
    if (p.socketId !== null) p.isAfk = false;
  }

  return { room, payload, kickedTokens };
}
```

Přidej metodu `updateActivity(code: string): void`:
```typescript
updateActivity(code: string): void {
  const room = this.rooms.get(code);
  if (room) room.lastActivityAt = Date.now();
}
```

Přidej metodu `getAllRooms(): IterableIterator<GameRoom>` (pro GC):
```typescript
getAllRooms(): IterableIterator<GameRoom> {
  return this.rooms.values();
}
```

Přidej metodu `deleteRoom(code: string): void` (pro GC):
```typescript
deleteRoom(code: string): void {
  const room = this.rooms.get(code);
  if (!room) return;
  // Vyčisti tokeny všech hráčů
  for (const [token, roomCode] of this.playerRooms.entries()) {
    if (roomCode === code) {
      this.afkTimers.delete(token);
      this.playerRooms.delete(token);
      this.tokenToPlayerId.delete(token);
    }
  }
  this.clearAllGameTimers(code);
  this.engines.delete(code);
  this.rooms.delete(code);
}
```

**Step 4: Spusť testy — ujisti se že procházejí**

```bash
npm test --workspace=packages/backend 2>&1 | tail -30
```

Expected: všechny testy PASS

**Step 5: Commit**

```bash
git add packages/backend/src/game/RoomManager.ts packages/backend/src/game/RoomManager.test.ts
git commit -m "feat(backend): add RoomManager.finishGame(), updateActivity(), deleteRoom(), getAllRooms()"
```

---

### Task 3: Backend — gameHandlers.ts přepracování

**Files:**
- Modify: `packages/backend/src/socket/gameHandlers.ts`

**Step 1: Importuj `GameOverPayload` a `socketToToken`**

Na začátek souboru přidej import `GameOverPayload` ze sdílených typů (je již přidán ve `shared`, TypeScript ho uvidí po buildu).

**Step 2: Přepracuj `lobby:endGame` handler**

Nahraď stávající `lobby:endGame` handler (řádky 135–144) novým:
```typescript
socket.on('lobby:endGame', (callback) => {
  const playerToken = socketToToken.get(socket.id);
  if (!playerToken) { callback({ error: 'Nejsi přihlášen.' }); return; }

  const room = roomManager.getRoomByPlayerToken(playerToken);
  if (!room) { callback({ error: 'Místnost nebyla nalezena.' }); return; }

  const playerId = roomManager.getPlayerIdByToken(playerToken)!;
  if (playerId !== room.hostId) { callback({ error: 'Pouze hostitel může ukončit hru.' }); return; }

  if (room.status === 'LOBBY') { callback({ error: 'Hra právě neprobíhá.' }); return; }

  const result = roomManager.finishGame(room.code);
  if ('error' in result) { callback(result); return; }

  // Emituj game:gameOver všem hráčům (včetně kicknutých — jsou stále v room:${code})
  io.to(`room:${room.code}`).emit('game:gameOver', result.payload);

  // Odstraň sockety kicknutých hráčů z room channel
  for (const [sid, token] of socketToToken.entries()) {
    if (result.kickedTokens.includes(token)) {
      const kickedSocket = io.sockets.sockets.get(sid);
      if (kickedSocket) kickedSocket.leave(`room:${room.code}`);
      socketToToken.delete(sid);
    }
  }

  // Informuj hosta o novém stavu místnosti (LOBBY)
  io.to(`room:${room.code}`).emit('lobby:stateUpdate', result.room);
  broadcastPublicRooms(io);
  callback({ ok: true });
});
```

**Step 3: Odstraň `lobby:returnToLobby` handler**

Smaž celý blok `socket.on('lobby:returnToLobby', ...)` (řádky 147–156).

**Step 4: Přidej auto-win detekci po `game:judgeSelect`**

V `game:judgeSelect` handleru, po řádku `io.to(...).emit('game:roundEnd', result);` (a před setTimeout), přidej:

```typescript
// Auto-win: zkontroluj jestli vítěz dosáhl targetScore
const winnerId = result.winnerId;
if (winnerId && result.scores[winnerId] >= room.targetScore) {
  const finishResult = roomManager.finishGame(room.code);
  if (!('error' in finishResult)) {
    io.to(`room:${room.code}`).emit('game:gameOver', finishResult.payload);
    for (const [sid, token] of socketToToken.entries()) {
      if (finishResult.kickedTokens.includes(token)) {
        const kickedSocket = io.sockets.sockets.get(sid);
        if (kickedSocket) kickedSocket.leave(`room:${room.code}`);
        socketToToken.delete(sid);
      }
    }
    io.to(`room:${room.code}`).emit('lobby:stateUpdate', finishResult.room);
    broadcastPublicRooms(io);
  }
  return; // nepokračuj na setTimeout pro startNewRound
}
```

**Step 5: Přidej `updateActivity()` volání**

V handleru `game:playCards`, za `if (result.allSubmitted) {` (ale před else), přidej na začátek handleru:
```typescript
roomManager.updateActivity(room.code);
```

V `game:judgeSelect` handleru, po `roomManager.clearJudgingTimer(room.code);`, přidej:
```typescript
roomManager.updateActivity(room.code);
```

V `game:czarForceAdvance` handleru, za `roomManager.clearRoundTimer(room.code);`, přidej:
```typescript
roomManager.updateActivity(room.code);
```

V `game:skipCzarJudging` handleru, za `roomManager.clearJudgingTimer(room.code);`, přidej:
```typescript
roomManager.updateActivity(room.code);
```

**Step 6: Přidej `updateActivity()` také v `lobbyHandlers.ts` pro `startGame`**

V `lobbyHandlers.ts`, v `lobby:startGame` handleru, po `roomManager.setGameEngine(room.code, engine);`, přidej:
```typescript
roomManager.updateActivity(room.code);
```

**Step 7: Spusť testy**

```bash
npm test --workspace=packages/backend 2>&1 | tail -30
```

Expected: všechny testy PASS

**Step 8: Commit**

```bash
git add packages/backend/src/socket/gameHandlers.ts packages/backend/src/socket/lobbyHandlers.ts
git commit -m "feat(backend): auto-win detection, endGame→finishGame, remove returnToLobby handler, track activity"
```

---

### Task 4: Backend — Garbage Collector

**Files:**
- Create: `packages/backend/src/game/GarbageCollector.ts`
- Modify: `packages/backend/src/index.ts`

**Step 1: Vytvoř `GarbageCollector.ts`**

```typescript
import type { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@kpl/shared';
import { roomManager } from './RoomManager.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

const LOBBY_IDLE_MS = 15 * 60 * 1000;   // 15 minut
const GAME_IDLE_MS  = 30 * 60 * 1000;   // 30 minut
const GC_INTERVAL_MS = 5 * 60 * 1000;   // každých 5 minut

const ACTIVE_STATUSES = new Set(['SELECTION', 'JUDGING', 'RESULTS']);

export function startGarbageCollector(io: IO): void {
  setInterval(() => {
    const now = Date.now();
    for (const room of roomManager.getAllRooms()) {
      const idle = now - room.lastActivityAt;
      if (room.status === 'LOBBY' && idle > LOBBY_IDLE_MS) {
        io.to(`room:${room.code}`).emit('room:deleted');
        roomManager.deleteRoom(room.code);
      } else if (ACTIVE_STATUSES.has(room.status) && idle > GAME_IDLE_MS) {
        io.to(`room:${room.code}`).emit('room:deleted');
        roomManager.deleteRoom(room.code);
      }
    }
  }, GC_INTERVAL_MS);
}
```

**Step 2: Zaregistruj GC v `index.ts`**

Přidej import a volání:
```typescript
import { startGarbageCollector } from './game/GarbageCollector.js';
// ... na konci souboru, po `app.listen(...)`:
startGarbageCollector(io);
```

**Step 3: Spusť testy**

```bash
npm test --workspace=packages/backend 2>&1 | tail -20
```

Expected: PASS (GC není unit testován — testuje se manuálně)

**Step 4: Commit**

```bash
git add packages/backend/src/game/GarbageCollector.ts packages/backend/src/index.ts
git commit -m "feat(backend): add garbage collector (15min lobby idle, 30min game idle)"
```

---

### Task 5: Frontend — sdílené typy a lobbyStore

**Files:**
- Modify: `packages/frontend/src/stores/lobbyStore.ts`

**Step 1: Přidej `targetScore` do `createRoom` v `lobbyStore.ts`**

Změň typ `settings` v `createRoom()`:
```typescript
async function createRoom(settings: {
  name: string;
  isPublic: boolean;
  selectedSetIds: number[];
  maxPlayers: number;
  nickname: string;
  targetScore: number;    // NOVÉ
}): Promise<...>
```

A uprav volání `socket.emit('lobby:create', settings, ...)` — `settings` se passuje přímo, takže TypeScript si nový field vezme automaticky.

**Step 2: TypeScript check**

```bash
npx tsc --noEmit --project packages/frontend/tsconfig.json 2>&1 | head -30
```

Expected: žádné chyby (nebo pouze existující chyby nesouvisející s touto změnou)

**Step 3: Commit**

```bash
git add packages/frontend/src/stores/lobbyStore.ts
git commit -m "feat(frontend): add targetScore to createRoom"
```

---

### Task 6: Frontend — roomStore.ts přidání finishedState

**Files:**
- Modify: `packages/frontend/src/stores/roomStore.ts`

**Step 1: Přidej `finishedState` ref a handlery**

1. Import `GameOverPayload` ze `@kpl/shared`
2. Přidej state: `const finishedState = ref<GameOverPayload | null>(null);`
3. V `init()`, za existujícími handlery přidej:

```typescript
socket.on('game:gameOver', (payload) => {
  finishedState.value = payload;
  // Nekontrolujeme room — host v room zůstane přes lobby:stateUpdate
  // Kicknutí hráči dostanou game:gameOver + jejich socket.leave se deje na backendu
});

socket.on('room:deleted', () => {
  finishedState.value = null;
  room.value = null;
  myPlayerId.value = null;
  // Navigace na / se provede v RoomView přes watcher na room
});
```

4. Přidej metodu:
```typescript
function clearFinishedState() {
  finishedState.value = null;
}
```

5. V `cleanup()` přidej:
```typescript
socket.off('game:gameOver');
socket.off('room:deleted');
finishedState.value = null;
```

6. V `return { ... }` přidej `finishedState, clearFinishedState`.

**Step 2: Uprav watcher v `RoomView.vue` pro `room:deleted`**

> Poznámka: Stávající watcher na `roomStore.room` naviguje na `/` když room přejde z non-null na null. `room:deleted` nastaví `room.value = null`, takže navigace proběhne automaticky přes existující watcher. Žádná změna v RoomView není potřeba pro `room:deleted`.

**Step 3: Commit**

```bash
git add packages/frontend/src/stores/roomStore.ts
git commit -m "feat(frontend): add finishedState, handle game:gameOver and room:deleted in roomStore"
```

---

### Task 7: Frontend — RoomView.vue overlay logika

**Files:**
- Modify: `packages/frontend/src/views/RoomView.vue`

**Step 1: Uprav šablonu pro overlay pódium**

`FinishedPhase` se má zobrazit kdykoli `finishedState != null`, nezávisle na `room.status`. Nahraď stávající `<Transition>` blok:

```html
<template v-if="roomStore.room || roomStore.finishedState">
  <div class="flex-1 flex flex-col min-h-0 overflow-hidden relative">
    <Transition name="phase-slide" mode="out-in">
      <!-- Pódium má prioritu — overlay přes libovolný stav -->
      <div v-if="roomStore.finishedState" key="FINISHED" class="flex-1 flex flex-col min-h-0">
        <FinishedPhase />
      </div>
      <div v-else-if="roomStore.room?.status === 'LOBBY'"      key="LOBBY"     class="flex-1 flex flex-col min-h-0"><LobbyPanel     :room="roomStore.room!" /></div>
      <div v-else-if="roomStore.room?.status === 'SELECTION'" key="SELECTION" class="flex-1 flex flex-col min-h-0"><SelectionPhase /></div>
      <div v-else-if="roomStore.room?.status === 'JUDGING'"   key="JUDGING"   class="flex-1 flex flex-col min-h-0"><JudgingPhase  /></div>
      <div v-else-if="roomStore.room?.status === 'RESULTS'"   key="RESULTS"   class="flex-1 flex flex-col min-h-0"><ResultsPhase  /></div>
    </Transition>
  </div>
</template>
```

Uprav watcher aby navigoval na `/` když obojí je null:
```typescript
const stopKickedWatch = watch(
  [() => roomStore.room, () => roomStore.finishedState],
  ([newRoom, newFinished], [oldRoom]) => {
    // Naviguj pryč jen když room zmizí A finishedState není nastaven
    if (oldRoom !== null && newRoom === null && newFinished === null) {
      router.push('/');
    }
  }
);
```

**Step 2: Commit**

```bash
git add packages/frontend/src/views/RoomView.vue
git commit -m "feat(frontend): FinishedPhase overlay based on finishedState, fix kicked watcher"
```

---

### Task 8: Frontend — FinishedPhase.vue přepracování tlačítek

**Files:**
- Modify: `packages/frontend/src/components/FinishedPhase.vue`

**Step 1: Přepracuj komponentu**

Kompletně nahraď `<script setup>` a `<template>`:

```vue
<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useRoomStore } from '../stores/roomStore';
import { useLobbyStore } from '../stores/lobbyStore';
import { useProfileStore } from '../stores/profileStore';
import { useSound } from '../composables/useSound';
import Podium from './game/atoms/Podium.vue';
import Scoreboard from './game/atoms/Scoreboard.vue';
import confetti from 'canvas-confetti';

const { t } = useI18n();
const router = useRouter();
const roomStore = useRoomStore();
const lobbyStore = useLobbyStore();
const profileStore = useProfileStore();
const { play } = useSound();

const joiningNew = ref(false);
const joinError = ref('');

// Data bereme z finishedState (cached payload), NE z živého room
const scoreboard = computed(() =>
  roomStore.finishedState?.finalScores ?? []
);

const roomCode = computed(() => roomStore.finishedState?.roomCode ?? '');

onMounted(() => {
  setTimeout(() => {
    play('fanfare');
    confetti({ particleCount: 80, angle: 60, spread: 55, origin: { x: 0, y: 0.7 } });
    confetti({ particleCount: 80, angle: 120, spread: 55, origin: { x: 1, y: 0.7 } });
  }, 1300);
});

async function onNewGame() {
  if (roomStore.isHost) {
    // Host je stále v místnosti (LOBBY), stačí vymazat finishedState
    roomStore.clearFinishedState();
    return;
  }
  // Ostatní hráči: znovu se připojit do místnosti
  joiningNew.value = true;
  const result = await lobbyStore.joinRoom(roomCode.value, profileStore.nickname);
  if ('error' in result) {
    joinError.value = result.error;
    joiningNew.value = false;
    return;
  }
  roomStore.setRoom(result.room);
  roomStore.setMyPlayerId(result.playerId);
  roomStore.clearFinishedState();
}

function onLeaveRoom() {
  roomStore.clearFinishedState();
  router.push('/');
}
</script>

<template>
  <div class="space-y-8 text-center max-w-md mx-auto">
    <div>
      <h2 class="text-4xl font-bold text-yellow-400 mb-1">{{ t('game.finished.title') }}</h2>
      <p class="text-gray-400">{{ t('game.finished.finalResults') }}</p>
    </div>

    <Podium v-if="scoreboard.length > 0" :entries="scoreboard" />

    <div class="text-left">
      <Scoreboard :entries="scoreboard" :showRank="true" />
    </div>

    <div class="pt-2 flex flex-col items-center gap-3">
      <p v-if="joinError" class="text-red-400 text-sm">{{ joinError }}</p>
      <button
        @click="onNewGame"
        :disabled="joiningNew"
        class="bg-green-600 hover:bg-green-500 text-white font-bold px-8 py-3 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed w-full max-w-xs"
      >
        {{ joiningNew ? '...' : t('game.finished.newGame') }}
      </button>
      <button
        @click="onLeaveRoom"
        :disabled="joiningNew"
        class="bg-gray-700 hover:bg-gray-600 text-white font-semibold px-8 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed w-full max-w-xs"
      >
        {{ t('game.finished.leaveRoom') }}
      </button>
    </div>
  </div>
</template>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/FinishedPhase.vue
git commit -m "feat(frontend): FinishedPhase - individual New Game/Leave Room buttons, data from finishedState"
```

---

### Task 9: Frontend — CreateTableModal.vue — přidání targetScore

**Files:**
- Modify: `packages/frontend/src/components/CreateTableModal.vue`

**Step 1: Přidej selector cílového skóre**

1. Do `<script setup>` přidej:
```typescript
const targetScore = ref(10);
const TARGET_SCORE_OPTIONS = [8, 10, 15, 20, 30] as const;
```

2. V `emit` type přidej `targetScore: number` do `create` event settings.

3. V `submit()` přidej do emitu:
```typescript
emit('create', {
  name: name.value.trim(),
  isPublic: isPublic.value,
  selectedSetIds: selectedSetIds.value,
  maxPlayers: maxPlayers.value,
  targetScore: targetScore.value,   // NOVÉ
});
```

4. Do šablony, za `maxPlayers` field a před card sets, přidej:
```html
<label class="block">
  <span class="text-sm text-gray-300">{{ t('createTable.targetScore') }}</span>
  <select
    v-model.number="targetScore"
    class="mt-1 w-full bg-gray-700 px-3 py-2 rounded"
  >
    <option v-for="n in TARGET_SCORE_OPTIONS" :key="n" :value="n">
      {{ n }} {{ t('createTable.points') }}
    </option>
  </select>
</label>
```

**Step 2: Ujisti se že HomeView předává `targetScore` dál**

Zkontroluj `HomeView.vue` — hledej `createRoom` volání a přidej `targetScore`:
```bash
grep -n "createRoom\|create.*settings" packages/frontend/src/views/HomeView.vue | head -10
```

Pokud HomeView předává settings z eventu dále do `lobbyStore.createRoom`, přidej `targetScore` do předávaného objektu (bude přítomen v eventu z `CreateTableModal`).

**Step 3: Commit**

```bash
git add packages/frontend/src/components/CreateTableModal.vue packages/frontend/src/views/HomeView.vue
git commit -m "feat(frontend): add targetScore selector to CreateTableModal (8/10/15/20/30)"
```

---

### Task 10: Frontend — "End Game" tlačítko v SelectionPhase a JudgingPhase

**Files:**
- Modify: `packages/frontend/src/components/SelectionPhase.vue`
- Modify: `packages/frontend/src/components/JudgingPhase.vue`

**Step 1: Přidej "End Game" do SelectionPhase**

V `SelectionPhase.vue`:
1. V `<script setup>` přidej:
```typescript
import { useRoomStore } from '../stores/roomStore';
const roomStore = useRoomStore();
const endingGame = ref(false);
async function onEndGame() {
  endingGame.value = true;
  await roomStore.endGame();
  endingGame.value = false;
}
```
(Pokud již `useRoomStore` je importován, přidej jen nové věci.)

2. Na konec šablony přidej:
```html
<div v-if="roomStore.isHost" class="mt-4 text-center">
  <button
    @click="onEndGame"
    :disabled="endingGame"
    class="bg-red-700 hover:bg-red-600 text-white font-semibold px-5 py-2 rounded-lg text-sm disabled:opacity-40"
  >
    {{ t('game.results.endGame') }}
  </button>
</div>
```

**Step 2: Přidej "End Game" do JudgingPhase**

Stejný postup jako SelectionPhase.

**Step 3: Commit**

```bash
git add packages/frontend/src/components/SelectionPhase.vue packages/frontend/src/components/JudgingPhase.vue
git commit -m "feat(frontend): add End Game button for host in SelectionPhase and JudgingPhase"
```

---

### Task 11: i18n — přidání nových překladových klíčů

**Files:**
- Modify: `packages/frontend/src/i18n/locales/cs.json`
- Modify: `packages/frontend/src/i18n/locales/en.json`
- Modify: `packages/frontend/src/i18n/locales/ru.json`
- Modify: `packages/frontend/src/i18n/locales/uk.json`
- Modify: `packages/frontend/src/i18n/locales/es.json`

**Step 1: Přidej klíče do cs.json**

V sekci `game.finished` přidej (a odstraň staré `returnToLobby` a `waitingForHost`):
```json
"newGame": "Nová hra",
"leaveRoom": "Opustit místnost"
```

V sekci `createTable` přidej:
```json
"targetScore": "Cílový počet bodů",
"points": "bodů"
```

**Step 2: Přidej překlady do ostatních lokalizací**

`en.json`:
```json
"game.finished.newGame": "New Game",
"game.finished.leaveRoom": "Leave Room",
"createTable.targetScore": "Target score",
"createTable.points": "points"
```

`ru.json`:
```json
"game.finished.newGame": "Новая игра",
"game.finished.leaveRoom": "Покинуть комнату",
"createTable.targetScore": "Целевое количество очков",
"createTable.points": "очков"
```

`uk.json`:
```json
"game.finished.newGame": "Нова гра",
"game.finished.leaveRoom": "Залишити кімнату",
"createTable.targetScore": "Цільова кількість очок",
"createTable.points": "очок"
```

`es.json`:
```json
"game.finished.newGame": "Nueva partida",
"game.finished.leaveRoom": "Abandonar sala",
"createTable.targetScore": "Puntuación objetivo",
"createTable.points": "puntos"
```

Pozor: přidávej do správné sekce JSON (nested structure), ne jako flat klíče.

**Step 3: Spusť build pro ověření**

```bash
npm run build --workspace=packages/frontend 2>&1 | tail -20
```

Expected: build bez chyb

**Step 4: Commit**

```bash
git add packages/frontend/src/i18n/locales/
git commit -m "i18n: add newGame, leaveRoom, targetScore, points keys in all 5 locales"
```

---

### Task 12: Finální ověření a build

**Step 1: Spusť všechny backend testy**

```bash
npm test --workspace=packages/backend 2>&1 | tail -20
```

Expected: všechny testy PASS

**Step 2: Build celého monorepa**

```bash
npm run build 2>&1 | tail -30
```

Expected: build bez chyb

**Step 3: Manuální smoke test (volitelné)**

1. Spusť `npm run dev:backend` a `npm run dev:frontend`
2. Vytvoř místnost s cílovým skóre 8
3. Přidej 2+ hráče, spusť hru
4. Odehrej kola dokud někdo nedosáhne 8 bodů
5. Ověř: pódium se zobrazí všem, tlačítka "Nová hra" a "Opustit místnost" fungují
6. Ověř: "Nová hra" hráče vrátí do lobby, "Opustit místnost" naviguje na `/`
7. Ověř: host vidí "End Game" tlačítko v SelectionPhase a JudgingPhase

**Step 4: Finální commit (pokud jsou nějaké zbývající změny)**

```bash
git status && git add -p && git commit -m "chore: final cleanup"
```
