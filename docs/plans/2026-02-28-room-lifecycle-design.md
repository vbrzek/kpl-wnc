# Room Lifecycle & Garbage Collector — Design

Date: 2026-02-28

## Přehled

Vylepšení životního cyklu místností:
- Cílový počet bodů jako podmínka výhry
- Automatické ukončení hry při dosažení cíle
- Individuální přechod z pódia (ne řízený hostem)
- Garbage collector neaktivních místností

---

## 1. Sdílené typy (`packages/shared/src/index.ts`)

### Změny v `GameRoom`
```ts
targetScore: number        // výherní podmínka: 8 | 10 | 15 | 20 | 30
lastActivityAt: number     // Unix timestamp poslední akce (ms), pro GC
```

### Nový typ `GameOverPayload`
```ts
interface GameOverPayload {
  finalScores: Array<{
    playerId: string;
    nickname: string;
    score: number;
    rank: number;        // 1 = vítěz
  }>;
  roomCode: string;
  roomName?: string;
}
```

### Nové Socket.io eventy (`ServerToClientEvents`)
```ts
'game:gameOver': (payload: GameOverPayload) => void
'room:deleted': () => void
```

### Rozšíření `CreateRoomOptions`
```ts
targetScore: number
```

---

## 2. Backend

### `RoomManager.ts`

**`createRoom()`**
- Přijme `targetScore` v options
- Uloží do `room.targetScore`
- Nastaví `room.lastActivityAt = Date.now()`

**Nová metoda `updateActivity(code: string)`**
- Nastaví `room.lastActivityAt = Date.now()`
- Volána při každé herní akci hráče

**Nová metoda `finishGame(code: string): GameOverPayload`**
- Sestaví `GameOverPayload` ze `room.players` (seřazeno dle score desc, přidá rank)
- Vyhodí všechny nehóstovské hráče: odstraní z `room.players`, smaže jejich záznamy v `playerTokenToCode` a `playerTokenToPlayerId`
- Resetuje místnost do LOBBY stavu:
  - `status = 'LOBBY'`
  - `engine = null`
  - `roundDeadline = null`
  - `currentBlackCard = null`
  - Všechna skóre hráčů na 0
  - `isCardCzar`, `hasPlayed` reset
- Vrátí `GameOverPayload` (sestavený před resetem)

### `gameHandlers.ts` / `roundUtils.ts`

**Auto-win detekce** — po `engine.selectWinner()`:
```ts
if (result.scores[winnerId] >= room.targetScore) {
  // emit game:gameOver + finishGame místo startNewRound
} else {
  // normální přechod na nové kolo
}
```

**Aktivita** — zavolat `roomManager.updateActivity(code)` při:
- `game:playCards`
- `game:judgeSelect`
- `game:czarForceAdvance`
- `game:skipCzarJudging`
- `startGame()`

### `lobbyHandlers.ts`

**`lobby:endGame`** (host ukončí předčasně)
- Dostupné ve stavech: SELECTION, JUDGING, RESULTS
- Volá `finishGame()`, emituje `game:gameOver` všem hráčům v místnosti
- Poté emituje `lobby:stateUpdate` hostovi (místnost je teď prázdné LOBBY)
- Pokud je místnost public, public room list se automaticky aktualizuje (stateUpdate do 'lobby')

### Nový `GarbageCollector.ts`

```ts
// Spustit jednou při startu serveru
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const idle = now - room.lastActivityAt;
    const isActiveGame = ['SELECTION', 'JUDGING', 'RESULTS'].includes(room.status);

    if (room.status === 'LOBBY' && idle > 15 * 60 * 1000) {
      io.to(`room:${code}`).emit('room:deleted');
      roomManager.deleteRoom(code);
    } else if (isActiveGame && idle > 30 * 60 * 1000) {
      io.to(`room:${code}`).emit('room:deleted');
      roomManager.deleteRoom(code);
    }
  }
}, 5 * 60 * 1000);
```

---

## 3. Frontend

### `CreateTableModal.vue`

- Přidá `<select>` nebo radio group pro cílové skóre: `[8, 10, 15, 20, 30]`
- Výchozí hodnota: `10`
- Pošle `targetScore` v payload `lobby:createRoom`

### `roomStore.ts`

**Nový state:**
```ts
finishedState: GameOverPayload | null = null
```

**Nové handlery:**
```ts
socket.on('game:gameOver', (payload) => {
  finishedState = payload
  // room zůstane v store (host), nebo se vymaže (kicked hráči)
})

socket.on('room:deleted', () => {
  $reset()
  router.push('/')
})
```

**Nová metoda:**
```ts
clearFinishedState() {
  finishedState = null
}
```

### `RoomView.vue`

- Pokud `roomStore.finishedState != null` → zobrazí `FinishedPhase` jako overlay
- `FinishedPhase` dostane data z `finishedState`, ne ze živého `room`

### `FinishedPhase.vue` — tlačítka

| Hráč | Tlačítko | Akce |
|------|----------|------|
| Host | **Nová hra** | `clearFinishedState()` → host vidí lobby (je už v místnosti) |
| Host | **Opustit místnost** | emit `lobby:leave` → `clearFinishedState()` → `router.push('/')` |
| Ostatní | **Nová hra** | `lobbyStore.joinRoom(roomCode)` → po úspěchu `clearFinishedState()` |
| Ostatní | **Opustit místnost** | `clearFinishedState()` → `router.push('/')` |

> Odstraní se stávající tlačítko "Return to Lobby" (host-only) a "Waiting for host" text.

### "End Game" tlačítko pro hosta

- Přesunout z `ResultsPhase` do sdíleného místa (např. `GameLayout` nebo přidat do `SelectionPhase` a `JudgingPhase`)
- Vždy viditelné hostovi v jakékoliv aktivní fázi hry

---

## 4. Datový tok — Game Over

```
selectWinner() → winner.score >= targetScore
         │
         ▼
server sestaví GameOverPayload (score seřazené, ranky)
         │
         ▼
emit game:gameOver → všem hráčům v místnosti
         │
         ▼
finishGame():
  - vyhazuje nehóstovské hráče z room.players
  - maže jejich token mappings
  - resetuje místnost → LOBBY (jen host)
         │
         ▼
emit lobby:stateUpdate → hostovi
emit lobby:roomsUpdate → 'lobby' channel (public room se objeví v seznamu)
```

---

## 5. Garbage Collector — pravidla

| Podmínka | Limit | Akce |
|----------|-------|------|
| LOBBY bez spuštění hry | 15 minut | `room:deleted` → smazání |
| Aktivní hra bez akce | 30 minut | `room:deleted` → smazání |

- Interval: každých 5 minut
- `lastActivityAt` se aktualizuje při každé herní akci a při přechodu do LOBBY (createRoom, startGame)
- Frontend při `room:deleted` vyčistí store a naviguje na `/`
