# Server State Persistence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rozehrané hry přežijí restart serveru (PM2 deploy/SIGTERM) pomocí JSON snapshotu na disk.

**Architecture:** Na SIGTERM se stav `RoomManager` + `GameEngine` serializuje do `/tmp/kpl-snapshot.json`. Při příštím startu server soubor načte, smaže a obnoví stav před tím, než začne přijímat spojení. Timery kol se neobnovují (callbacky jsou no-op); `roundDeadline` v `GameRoom` klientům postačí.

**Tech Stack:** Node.js fs (sync I/O v SIGTERM handleru), JSON, TypeScript — žádná nová závislost.

---

### Task 1: EngineSnapshot typ + GameEngine.toSnapshot() + fromSnapshot()

**Files:**
- Modify: `packages/backend/src/game/GameEngine.ts`
- Test: `packages/backend/src/game/GameEngine.test.ts`

**Step 1: Napiš selhávající test**

Na konec `GameEngine.test.ts` přidej:

```typescript
describe('snapshot', () => {
  it('round-trips player hands and deck state', () => {
    engine.startRound();
    // p1 je czar, p2+p3 hrají karty
    const czar = players.find(p => p.isCardCzar)!;
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
```

**Step 2: Spusť test — musí SELHAT**

```bash
npm test --workspace=packages/backend
```

Očekáváno: `TypeError: engine.toSnapshot is not a function`

**Step 3: Přidej `EngineSnapshot` typ a metody do `GameEngine.ts`**

Na začátek souboru (za importy) přidej:

```typescript
export interface EngineSnapshot {
  blackDeck: BlackCard[];
  whiteDeck: WhiteCard[];
  playerHands: Record<string, WhiteCard[]>;
  submissions: Record<string, { submissionId: string; cards: WhiteCard[] }>;
  czarPointer: number;
  usedWhiteCards: WhiteCard[];
  roundNumber: number;
  currentBlackCard: BlackCard | null;
}
```

Do třídy `GameEngine` přidej dvě metody — `toSnapshot()` jako instanční a `fromSnapshot()` jako statickou:

```typescript
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
    currentBlackCard: this.currentBlackCard,
  };
}

static fromSnapshot(snap: EngineSnapshot, players: Player[]): GameEngine {
  // Prázdné decky — hned přepíšeme ze snapshotu
  const engine = new GameEngine(players, [], []);
  engine.blackDeck = snap.blackDeck;
  engine.whiteDeck = snap.whiteDeck;
  engine.playerHands = new Map(Object.entries(snap.playerHands));
  engine.submissions = new Map(Object.entries(snap.submissions));
  engine.czarPointer = snap.czarPointer;
  engine.usedWhiteCards = snap.usedWhiteCards;
  engine.roundNumber = snap.roundNumber;
  engine.currentBlackCard = snap.currentBlackCard;
  return engine;
}
```

**Step 4: Spusť testy — musí PROJÍT**

```bash
npm test --workspace=packages/backend
```

Očekáváno: všechny testy zelené (66 + 2 nové = 68).

**Step 5: Commit**

```bash
git add packages/backend/src/game/GameEngine.ts packages/backend/src/game/GameEngine.test.ts
git commit -m "feat: add GameEngine snapshot serialization (toSnapshot/fromSnapshot)"
```

---

### Task 2: ManagerSnapshot typ + RoomManager.serialize() + restore()

**Files:**
- Modify: `packages/backend/src/game/RoomManager.ts`
- Test: `packages/backend/src/game/RoomManager.test.ts`

**Step 1: Napiš selhávající testy**

Na konec `RoomManager.test.ts` přidej:

```typescript
describe('serialize / restore', () => {
  it('restores rooms and player token maps from snapshot', () => {
    const { room, playerToken } = rm.createRoom({
      name: 'Test', isPublic: true, selectedSetIds: [1],
      maxPlayers: 6, nickname: 'Alice', targetScore: 8,
    });
    const joinResult = rm.joinRoom(room.code, 'Bob');
    expect('error' in joinResult).toBe(false);

    const snapshot = rm.serialize();
    const rm2 = new RoomManager();
    rm2.restore(snapshot);

    expect(rm2.getRoom(room.code)).not.toBeNull();
    expect(rm2.getRoomByPlayerToken(playerToken)).not.toBeNull();
    expect(rm2.getPlayerIdByToken(playerToken)).toBeTruthy();
  });

  it('marks all restored players as offline', () => {
    const { room } = rm.createRoom({
      name: 'Test', isPublic: true, selectedSetIds: [1],
      maxPlayers: 6, nickname: 'Alice', targetScore: 8,
    });
    // Simuluj online stav před snapshotem
    room.players[0].isOnline = true;
    room.players[0].socketId = 'fake-socket-id';

    const snapshot = rm.serialize();
    const rm2 = new RoomManager();
    rm2.restore(snapshot);

    const restored = rm2.getRoom(room.code)!;
    expect(restored.players[0].isOnline).toBe(false);
    expect(restored.players[0].socketId).toBeNull();
  });

  it('restores game engine for rooms with active game', () => {
    const { room } = rm.createRoom({
      name: 'Test', isPublic: true, selectedSetIds: [1],
      maxPlayers: 6, nickname: 'Alice', targetScore: 8,
    });
    // Ruční nastavení enginu (jako po startGame)
    const players = room.players;
    const fakeEngine = new (await import('./GameEngine.js').then(m => m.GameEngine))(
      players,
      [{ id: 1, text: 'Black ____', pick: 1 }],
      [{ id: 1, text: 'White 1' }, { id: 2, text: 'White 2' }],
    );
    rm.setGameEngine(room.code, fakeEngine);
    room.status = 'SELECTION';

    const snapshot = rm.serialize();
    const rm2 = new RoomManager();
    rm2.restore(snapshot);

    expect(rm2.getGameEngine(room.code)).not.toBeNull();
  });
});
```

> **Poznámka k testu s dynamickým importem:** Vitest podporuje top-level await v testech. Alternativně importuj `GameEngine` staticky na začátek souboru — přidej `import { GameEngine } from './GameEngine.js';`.

Jednodušší verze třetího testu (bez dynamického importu — uprav na statický import):

```typescript
// Na začátek souboru přidej:
import { GameEngine } from './GameEngine.js';

// Test:
it('restores game engine for rooms with active game', () => {
  const { room } = rm.createRoom({
    name: 'Test', isPublic: true, selectedSetIds: [1],
    maxPlayers: 6, nickname: 'Alice', targetScore: 8,
  });
  const fakeEngine = new GameEngine(
    room.players,
    [{ id: 1, text: 'Black ____', pick: 1 }],
    [{ id: 1, text: 'White 1' }, { id: 2, text: 'White 2' }],
  );
  rm.setGameEngine(room.code, fakeEngine);
  room.status = 'SELECTION';

  const snapshot = rm.serialize();
  const rm2 = new RoomManager();
  rm2.restore(snapshot);

  expect(rm2.getGameEngine(room.code)).not.toBeNull();
});
```

**Step 2: Spusť test — musí SELHAT**

```bash
npm test --workspace=packages/backend
```

Očekáváno: `TypeError: rm.serialize is not a function`

**Step 3: Přidej `ManagerSnapshot` typ a metody do `RoomManager.ts`**

Na začátek souboru za importy přidej:

```typescript
import { GameEngine, type EngineSnapshot } from './GameEngine.js';

export interface ManagerSnapshot {
  savedAt: number;
  rooms: Array<{ room: GameRoom; engine: EngineSnapshot | null }>;
  playerRooms: Record<string, string>;
  tokenToPlayerId: Record<string, string>;
}
```

> **Poznámka:** `GameEngine` je již importován jako typ — změň na value import, protože `fromSnapshot` je statická metoda.

Do třídy `RoomManager` přidej dvě metody:

```typescript
serialize(): ManagerSnapshot {
  const rooms: ManagerSnapshot['rooms'] = [];
  for (const room of this.rooms.values()) {
    const engine = this.engines.get(room.code);
    rooms.push({
      room: { ...room, players: room.players.map(p => ({ ...p })) },
      engine: engine ? engine.toSnapshot() : null,
    });
  }
  return {
    savedAt: Date.now(),
    rooms,
    playerRooms: Object.fromEntries(this.playerRooms),
    tokenToPlayerId: Object.fromEntries(this.tokenToPlayerId),
  };
}

restore(snapshot: ManagerSnapshot): void {
  this.rooms.clear();
  this.playerRooms.clear();
  this.tokenToPlayerId.clear();

  for (const { room, engine: engineSnap } of snapshot.rooms) {
    // Sockety nepřežijí restart — všichni offline
    for (const player of room.players) {
      player.socketId = null;
      player.isOnline = false;
    }
    this.rooms.set(room.code, room);

    if (engineSnap) {
      const engine = GameEngine.fromSnapshot(engineSnap, room.players);
      this.engines.set(room.code, engine);
    }
  }

  this.playerRooms = new Map(Object.entries(snapshot.playerRooms));
  this.tokenToPlayerId = new Map(Object.entries(snapshot.tokenToPlayerId));
}
```

**Step 4: Uprav import GameEngine v RoomManager.ts**

V souboru je `import { GameEngine } from './GameEngine.js'` — ověř, že je to value import (ne `import type`). Pokud je `import type`, odstraň `type`.

**Step 5: Spusť testy — musí PROJÍT**

```bash
npm test --workspace=packages/backend
```

Očekáváno: 68 + 3 nové = 71 testů zelených.

**Step 6: Commit**

```bash
git add packages/backend/src/game/RoomManager.ts packages/backend/src/game/RoomManager.test.ts
git commit -m "feat: add RoomManager snapshot serialization (serialize/restore)"
```

---

### Task 3: SIGTERM handler + snapshot restore v index.ts

**Files:**
- Modify: `packages/backend/src/index.ts`

**Žádný unit test** — testuje se manuálně (viz Step 3).

**Step 1: Přidej import fs a SNAPSHOT_PATH**

Na začátek `index.ts` (za stávající importy) přidej:

```typescript
import fs from 'fs';
import { roomManager } from './game/RoomManager.js';
import type { ManagerSnapshot } from './game/RoomManager.js';
```

Pod `config({ path: ... })` přidej konstantu:

```typescript
const SNAPSHOT_PATH = process.env.SNAPSHOT_PATH ?? '/tmp/kpl-snapshot.json';
```

**Step 2: Přidej restore blok před `app.listen()`**

Těsně před řádek `await app.listen(...)` vlož:

```typescript
if (fs.existsSync(SNAPSHOT_PATH)) {
  try {
    const raw = fs.readFileSync(SNAPSHOT_PATH, 'utf8');
    const snapshot = JSON.parse(raw) as ManagerSnapshot;
    fs.unlinkSync(SNAPSHOT_PATH); // smazat před restore — při pádu se neopakuje
    roomManager.restore(snapshot);
    app.log.info(`Restored ${snapshot.rooms.length} room(s) from snapshot.`);
  } catch (err) {
    app.log.error({ err }, 'Failed to restore snapshot — starting fresh.');
  }
}
```

**Step 3: Přidej SIGTERM handler za `startGarbageCollector(io)`**

```typescript
process.on('SIGTERM', () => {
  app.log.info('SIGTERM received — saving snapshot...');
  const snapshot = roomManager.serialize();
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot));
  app.log.info(`Snapshot saved to ${SNAPSHOT_PATH}`);
  app.close().then(() => process.exit(0));
});
```

**Step 4: Manuální ověření**

1. Spusť backend: `npm run dev:backend`
2. Vytvoř místnost, spusť hru (nebo zůstaň v LOBBY)
3. Pošli SIGTERM: `kill -SIGTERM <PID>` (PID zjistíš z výstupu nebo `lsof -i :3000 | grep LISTEN`)
4. Ověř, že soubor vznikl: `cat /tmp/kpl-snapshot.json | jq '.rooms | length'`
5. Znovu spusť backend — v logu uvidíš `Restored N room(s) from snapshot`
6. Ověř, že soubor byl smazán: `ls /tmp/kpl-snapshot.json` → `No such file`
7. Připoj se na místnost s uloženým `playerToken` — reconnect by měl projít

**Step 5: Commit**

```bash
git add packages/backend/src/index.ts
git commit -m "feat: persist game state across server restarts via SIGTERM snapshot"
```

---

### Task 4: Vynucený reload klientů po restartu serveru

Po restartu serveru se zároveň nasadí nový FE build. Klienti, kteří se automaticky reconnectnou přes Socket.io, by jinak běželi se starým JS/CSS. Server pošle `server:hello` s `startupId` (timestamp startu) — klient ho porovná s uloženou hodnotou a při změně zavolá `window.location.reload()`.

PWA: `registerType: 'autoUpdate'` automaticky aktivuje nový service worker při reloadu — žádné ruční `updateSW()` volání není potřeba.

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/backend/src/index.ts`
- Modify: `packages/frontend/src/socket/index.ts`

**Žádný unit test** — testuje se manuálně (viz Step 3).

**Step 1: Přidej `server:hello` event do sdílených typů**

V `packages/shared/src/index.ts` přidej do `ServerToClientEvents`:

```typescript
'server:hello': (startupId: number) => void;
```

**Step 2: Emit `server:hello` ze serveru při každém připojení**

V `packages/backend/src/index.ts` přidej konstantu hned po `const port = ...`:

```typescript
const STARTUP_ID = Date.now();
```

Uvnitř `io.on('connection', (socket) => { ... })` přidej jako první řádek:

```typescript
socket.emit('server:hello', STARTUP_ID);
```

**Step 3: Zpracuj event na klientovi**

V `packages/frontend/src/socket/index.ts` přidej za existující `socket.on('disconnect', ...)`:

```typescript
const STARTUP_ID_KEY = 'kpl-startup-id';

socket.on('server:hello', (startupId) => {
  const stored = localStorage.getItem(STARTUP_ID_KEY);
  localStorage.setItem(STARTUP_ID_KEY, String(startupId));
  if (stored !== null && stored !== String(startupId)) {
    window.location.reload();
  }
});
```

Logika: první návštěva (žádná uložená hodnota) → bez reloadu. Každý další connect kde se `startupId` změní (server byl restartován) → reload.

**Step 4: Manuální ověření**

1. Otevři aplikaci v browseru — v `localStorage` se uloží `kpl-startup-id`
2. Restartuj backend: `kill -SIGTERM <PID>`, pak `npm run dev:backend`
3. Socket se automaticky reconnectne → browser se sám obnoví
4. PWA standalone: stejné chování, nový SW se aktivuje při reloadu

**Step 5: Commit**

```bash
git add packages/shared/src/index.ts packages/backend/src/index.ts packages/frontend/src/socket/index.ts
git commit -m "feat: force client reload on server restart via server:hello startup ID"
```

---

## Shrnutí změněných souborů

| Soubor | Změna |
|---|---|
| `packages/shared/src/index.ts` | Nový event `server:hello` v `ServerToClientEvents` |
| `packages/backend/src/game/GameEngine.ts` | `EngineSnapshot` typ, `toSnapshot()`, `fromSnapshot()` |
| `packages/backend/src/game/GameEngine.test.ts` | 2 nové testy snapshot round-tripu |
| `packages/backend/src/game/RoomManager.ts` | `ManagerSnapshot` typ, `serialize()`, `restore()` |
| `packages/backend/src/game/RoomManager.test.ts` | 3 nové testy serialize/restore |
| `packages/backend/src/index.ts` | SIGTERM handler + startup restore + emit `server:hello` |
| `packages/frontend/src/socket/index.ts` | Handler `server:hello` → reload při změně startupId |
| `ecosystem.config.js` | `kill_timeout: 5000` ✅ hotovo |

## Poznámky k okrajovým stavům

- **RESULTS stav:** Po restore zůstane místnost v RESULTS — klienti po reconnectu uvidí výsledky. Host musí znovu kliknout na „další kolo". Akceptovatelné chování.
- **Timery kol:** Neobnovují se (callbacky jsou prázdné). `roundDeadline` v `GameRoom` klientům postačí pro zobrazení zbývajícího času.
- **AFK timery:** Nespouštějí se při restore — každý hráč je `isOnline: false`. AFK timer nastartuje standardně přes `handleDisconnect` flow při prvním připojení/odpojení po restartu.
- **`socketToToken` mapa** (`socketState.ts`): Prázdná po restartu — obnoví se při reconnectu každého klienta.
- **Reload loop:** Nemůže nastat — po reloadu se `startupId` uloží ještě před reconnectem socketu; při dalším reconnectu bude shodné.
