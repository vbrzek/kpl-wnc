# Game State Sync on Reconnect Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Po refreshi stránky během hry (fáze SELECTION nebo JUDGING) server pošle reconnectujícímu hráči jeho aktuální herní stav přes nový Socket.io event `game:stateSync`.

**Architecture:** Server detekuje reconnect v existujícím `lobby:join` handleru a hned po úspěšném reconnectu (pokud je hra ve stavu SELECTION/JUDGING) emituje `game:stateSync` přímo na reconnectující socket. Frontend přidá listener do roomStore, který naplní `hand`, `currentBlackCard`, `czarId` a případně `submissions` (pro czara v JUDGING).

**Tech Stack:** TypeScript, Socket.io (shared types v `@kpl/shared`), Vue 3 + Pinia (roomStore)

---

### Task 1: Přidat typ `GameStateSync` a event do sdílených typů

**Files:**
- Modify: `packages/shared/src/index.ts`

**Step 1: Přidat interface `GameStateSync` za `RoundResult`**

Do `packages/shared/src/index.ts` za blok `RoundResult` (řádek 44) vložit:

```typescript
export interface GameStateSync {
  blackCard: BlackCard;
  czarId: string;
  roundNumber: number;
  hand: WhiteCard[];               // prázdné pro czara
  submissions: AnonymousSubmission[]; // neprázdné jen pro czara ve fázi JUDGING
}
```

**Step 2: Přidat event `game:stateSync` do `ServerToClientEvents`**

V bloku `ServerToClientEvents` (kolem řádku 84) přidat za `'game:handUpdate'`:

```typescript
'game:stateSync': (data: GameStateSync) => void;
```

**Step 3: Ověřit TypeScript kompilaci**

```bash
npm run build --workspace=packages/shared
```

Očekáváno: žádné chyby.

**Step 4: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): add GameStateSync type and game:stateSync event"
```

---

### Task 2: Backend — emitovat `game:stateSync` při reconnectu

**Files:**
- Modify: `packages/backend/src/socket/lobbyHandlers.ts`

**Step 1: Přidat import `GameStateSync` v hlavičce souboru**

Na řádku 2 rozšířit existující import z `@kpl/shared`:

```typescript
import type { ServerToClientEvents, ClientToServerEvents, GameStateSync } from '@kpl/shared';
```

**Step 2: Vložit emit po úspěšném reconnectu**

V handleru `socket.on('lobby:join', ...)` (řádek 46) je reconnect path ukončena callbackem na řádku 68:

```typescript
callback({ room, playerToken, playerId });
```

Těsně **před** tento callback (za řádek 63 `socket.leave('lobby')`) vložit blok:

```typescript
    // Po reconnectu do rozjeté hry pošli hráči jeho aktuální herní stav
    if (result.wasReconnect && (room.status === 'SELECTION' || room.status === 'JUDGING')) {
      const engine = roomManager.getGameEngine(room.code);
      if (engine?.currentBlackCard) {
        const czarPlayer = room.players.find(p => p.isCardCzar);
        const player = room.players.find(p => p.id === playerId);
        const syncData: GameStateSync = {
          blackCard: engine.currentBlackCard,
          czarId: czarPlayer?.id ?? '',
          roundNumber: engine.roundNumber,
          hand: engine.getPlayerHand(playerId),
          submissions:
            room.status === 'JUDGING' && player?.isCardCzar
              ? engine.getAnonymousSubmissions()
              : [],
        };
        socket.emit('game:stateSync', syncData);
      }
    }
```

**Step 3: Přidat `wasReconnect` flag do `JoinSuccess` v RoomManager**

Aby handler věděl, jestli šlo o reconnect nebo nový join, upravit `JoinSuccess` v `packages/backend/src/game/RoomManager.ts`:

```typescript
export interface JoinSuccess {
  room: GameRoom;
  playerToken: string;
  wasReconnect: boolean;
}
```

A na konci reconnect path v `joinRoom()` (řádek 111):

```typescript
return { room: reconnected, playerToken, wasReconnect: true };
```

A na konci nového joinu (řádek 148):

```typescript
return { room, playerToken: newToken, wasReconnect: false };
```

**Step 4: Zkontrolovat TypeScript kompilaci backendu**

```bash
npm run build --workspace=packages/backend
```

Očekáváno: žádné chyby.

**Step 5: Commit**

```bash
git add packages/backend/src/socket/lobbyHandlers.ts packages/backend/src/game/RoomManager.ts
git commit -m "feat(backend): emit game:stateSync on reconnect during active game"
```

---

### Task 3: Frontend — listener `game:stateSync` v roomStore

**Files:**
- Modify: `packages/frontend/src/stores/roomStore.ts`

**Step 1: Přidat listener do `initListeners()`**

V `roomStore.ts` je funkce `initListeners()` (nebo sekce kde se registrují socket handlery). Za existující `socket.on('game:handUpdate', ...)` přidat:

```typescript
socket.on('game:stateSync', (data) => {
  currentBlackCard.value = data.blackCard;
  czarId.value = data.czarId;
  hand.value = data.hand;
  if (data.submissions.length > 0) {
    submissions.value = data.submissions;
  }
});
```

**Step 2: Odregistrovat listener v cleanup**

V sekci cleanup (kde jsou ostatní `socket.off(...)`) přidat:

```typescript
socket.off('game:stateSync');
```

**Step 3: Zkontrolovat TypeScript kompilaci frontendu**

```bash
npm run build --workspace=packages/frontend
```

Očekáváno: žádné chyby.

**Step 4: Commit**

```bash
git add packages/frontend/src/stores/roomStore.ts
git commit -m "feat(frontend): handle game:stateSync to restore state after page reload"
```

---

### Task 4: Manuální ověření

**Setup:**
1. Spusť backend: `npm run dev:backend`
2. Spusť frontend: `npm run dev:frontend`
3. Otevři 3 browsery, vytvoř stůl, připoj 3 hráče, spusť hru

**Test SELECTION fáze:**
1. Hra přejde do SELECTION — hráč #2 vidí ruku (10 karet) a černou kartu
2. Hráč #2 refreshne stránku (F5)
3. Hráč #2 by měl vidět stejnou ruku a stejnou černou kartu bez nutnosti čekat

**Test JUDGING fáze:**
1. Všichni hráči odešlou karty, hra přejde do JUDGING
2. Czar refreshne stránku
3. Czar by měl vidět anonymní submise a moci vybrat vítěze

**Test LOBBY (nemělo by se nic stát):**
1. Hra je v LOBBY — hráč refreshne
2. Reconnect proběhne normálně, `game:stateSync` se nesmí emitovat

---

### Známá omezení

- **RESULTS fáze po refreshi:** `roundResult` (vítěz kola) se neobnoví — po 5 sekundách přijde nové kolo a stav se resetuje. Přijatelné pro MVP.
- **JUDGING submissions pořadí:** Po reconnectu czara se anonymní submise znovu zamíchají. Pořadí bude jiné než před refreshem, ale anonymita je zachována.
