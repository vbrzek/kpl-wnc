# Code Review Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Opravit všechny Critical a Important problémy nalezené v code review z 2026-03-01.

**Architecture:** Osm nezávislých oprav — od nejbezpečnějších (testy, i18n) po nejvíce invazivní (Zod validace, rate limiting, sdílený typ Player). Každý task kompiluje a testy procházejí před dalším taskem.

**Tech Stack:** TypeScript, Vue 3, Zod, Socket.io, Vitest, vue-i18n

---

## Task 1: Oprava `targetScore` v testech RoomManager

**Problém:** ~30 z 38 volání `rm.createRoom(...)` v testech nemá `targetScore`. Kompilace to neodhalí (test soubory jsou vyloučeny z tsconfig), ale za runtime vzniká `targetScore: undefined`.

**Files:**
- Modify: `packages/backend/src/game/RoomManager.test.ts`

**Step 1: Přidej `targetScore: 8` ke všem voláním bez něj**

Najdi každé volání `rm.createRoom({ name:` a ověř, zda obsahuje `targetScore`. Pokud ne, přidej `targetScore: 8` (nejmenší validní hodnota). Jde o tato volání (řádky přibližně): 19–22, 26–28, 38–39, 54–56, 64–66, 72–74, 82–84, 93–95, 105–107, 116–118, 128–130, 139–141, 152–154, 166–168, 178–180, 190–192, 200–202, 212–214, 224–226, 233–236, 246–249, 259–261 (oba na jednom řádku), 269–272, 280–281, 288–291, 309–311, 317–319.

Vzor volání PO opravě:
```typescript
rm.createRoom({ name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 8 })
```

**Step 2: Spusť testy**
```bash
npm test --workspace=packages/backend
```
Očekávaný výstup: `66 passed`

**Step 3: Commit**
```bash
git add packages/backend/src/game/RoomManager.test.ts
git commit -m "test: add missing targetScore to all createRoom() calls in RoomManager tests"
```

---

## Task 2: Deduplikace `broadcastPublicRooms`

**Problém:** Identická funkce je definována v `lobbyHandlers.ts` i `gameHandlers.ts`.

**Files:**
- Modify: `packages/backend/src/socket/roundUtils.ts`
- Modify: `packages/backend/src/socket/lobbyHandlers.ts`
- Modify: `packages/backend/src/socket/gameHandlers.ts`

**Step 1: Přidej export do `roundUtils.ts`**

Na konec souboru přidej:
```typescript
export function broadcastPublicRooms(io: IO): void {
  io.to('lobby').emit('lobby:publicRoomsUpdate', roomManager.getPublicRooms());
}
```

**Step 2: Nahraď v `lobbyHandlers.ts`**

Odstraň lokální definici (řádky 13–15):
```typescript
function broadcastPublicRooms(io: IO) {
  io.to('lobby').emit('lobby:publicRoomsUpdate', roomManager.getPublicRooms());
}
```

Přidej import na řádek 7:
```typescript
import { startNewRound, startJudgingPhase, broadcastPublicRooms } from './roundUtils.js';
```

**Step 3: Nahraď v `gameHandlers.ts`**

Odstraň lokální definici (řádky 11–13):
```typescript
function broadcastPublicRooms(io: IO) {
  io.to('lobby').emit('lobby:publicRoomsUpdate', roomManager.getPublicRooms());
}
```

Přidej import na řádek 5:
```typescript
import { startNewRound, startJudgingPhase, broadcastPublicRooms } from './roundUtils.js';
```

**Step 4: Ověř build**
```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```
Očekávaný výstup: žádné chyby.

**Step 5: Commit**
```bash
git add packages/backend/src/socket/roundUtils.ts packages/backend/src/socket/lobbyHandlers.ts packages/backend/src/socket/gameHandlers.ts
git commit -m "refactor: extract broadcastPublicRooms to roundUtils to eliminate duplication"
```

---

## Task 3: Oprava hardcoded i18n řetězců

**Problém 1:** `LobbyPanel.vue:34` — `"Název stolu"` bez `t()`.
**Problém 2:** `HomeView.vue:87` — `'Room not found.'` anglicky bez `t()`.

**Files:**
- Modify: `packages/frontend/src/components/LobbyPanel.vue`
- Modify: `packages/frontend/src/views/HomeView.vue`
- Modify: `packages/frontend/src/i18n/locales/cs.json`
- Modify: `packages/frontend/src/i18n/locales/en.json`
- Modify: `packages/frontend/src/i18n/locales/ru.json`
- Modify: `packages/frontend/src/i18n/locales/uk.json`
- Modify: `packages/frontend/src/i18n/locales/es.json`

**Step 1: Oprav `LobbyPanel.vue`**

Řádek 34 — nahraď:
```html
<span class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">Název stolu</span>
```
za:
```html
<span class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">{{ t('createTable.tableName') }}</span>
```

Klíč `createTable.tableName` existuje ve všech 5 locale souborech (`"Název stolu"`, `"Table name"` atd.) — není třeba přidávat.

**Step 2: Přidej i18n klíč `home.roomNotFound` do všech 5 locale souborů**

Přidej do sekce `"home"` v každém souboru:

`cs.json`:
```json
"roomNotFound": "Stůl nebyl nalezen."
```

`en.json`:
```json
"roomNotFound": "Room not found."
```

`ru.json`:
```json
"roomNotFound": "Стол не найден."
```

`uk.json`:
```json
"roomNotFound": "Стіл не знайдено."
```

`es.json`:
```json
"roomNotFound": "Mesa no encontrada."
```

**Step 3: Oprav `HomeView.vue:87`**

Nahraď:
```typescript
errorMsg.value = 'Room not found.';
```
za:
```typescript
errorMsg.value = t('home.roomNotFound');
```

**Step 4: Commit**
```bash
git add packages/frontend/src/components/LobbyPanel.vue packages/frontend/src/views/HomeView.vue packages/frontend/src/i18n/locales/
git commit -m "fix: replace hardcoded strings with i18n keys in LobbyPanel and HomeView"
```

---

## Task 4: Přidat `game:error` handler do `JudgingPhase`

**Problém:** Server emituje `game:error` i ve JUDGING fázi (např. při neplatném `submissionId`), ale klient ho tiše ignoruje.

**Files:**
- Modify: `packages/frontend/src/components/JudgingPhase.vue`

**Step 1: Přidej state a socket listener**

Za import `useSound`:
```typescript
import { socket } from '../socket/index.js';
```

Za definici `endingGame`:
```typescript
const gameError = ref('');
```

V sekci lifecycle (za `onUnmounted` pro flip timery):
```typescript
function onGameError(msg: string) { gameError.value = msg; }
socket.on('game:error', onGameError);
onUnmounted(() => { socket.off('game:error', onGameError); });
```

Přidej `ref` do importu z `vue`:
```typescript
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
```

**Step 2: Zobraz error v template**

Za uzavírací `</WaitingForCzarLayout>` tag a před `<div v-if="roomStore.isHost"...>` přidej:
```html
<p v-if="gameError" class="mt-4 bg-red-500/10 text-red-400 p-4 rounded-2xl border border-red-500/20 text-sm font-bold">
  {{ gameError }}
</p>
```

**Step 3: Ověř, že se socket importuje správně**

Zkontroluj cesty: SelectionPhase.vue importuje socket jako `import { socket } from '../socket/index.js'`. JudgingPhase.vue je ve stejném adresáři, cesta je stejná.

**Step 4: Commit**
```bash
git add packages/frontend/src/components/JudgingPhase.vue
git commit -m "fix: handle game:error event in JudgingPhase component"
```

---

## Task 5: Přidat `isOnline` do Player, skrýt socketId z broadcastů

**Problém:** `Player.socketId` (interní Socket.io ID) je odesílán všem hráčům v místnosti přes `lobby:stateUpdate`. Klienti ho nepotřebují — potřebují jen vědět, kdo je online.

**Přístup:** Přidej `isOnline: boolean` do sdíleného typu `Player`. Server vždy nastaví `isOnline = (socketId !== null)`. Před každým broadcastem vytvoří kopii místnosti s `socketId: null` na všech hráčích. Frontend přejde z `!player.socketId` na `player.isOnline`.

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/backend/src/socket/roundUtils.ts`
- Modify: `packages/backend/src/socket/lobbyHandlers.ts`
- Modify: `packages/backend/src/socket/gameHandlers.ts`
- Modify: `packages/frontend/src/components/PlayerList.vue`

**Step 1: Přidej `isOnline` do shared `Player`**

V `packages/shared/src/index.ts` — do interface `Player` přidej:
```typescript
isOnline: boolean;
```

Výsledný interface:
```typescript
export interface Player {
  id: string;
  socketId: string | null;
  isOnline: boolean;
  nickname: string;
  score: number;
  isCardCzar: boolean;
  hasPlayed: boolean;
  isAfk: boolean;
}
```

**Step 2: Nastav `isOnline` v `RoomManager.ts`**

Otevři `packages/backend/src/game/RoomManager.ts`. Najdi každé místo, kde se vytváří nebo aktualizuje `Player` objekt (metody `createRoom`, `joinRoom`, `reconnect`, `handleDisconnect`).

V `createRoom` — u vytvoření hráče přidej `isOnline: true`:
```typescript
const host: Player = {
  id: randomUUID(),
  socketId: null,   // nastaveno až v socket handleru
  isOnline: true,
  nickname: settings.nickname,
  score: 0,
  isCardCzar: false,
  hasPlayed: false,
  isAfk: false,
};
```

V `joinRoom` — u vytvoření nového hráče přidej `isOnline: true`.

V `reconnect` — nastav `player.isOnline = true` (vedle `player.socketId = socketId`).

V `handleDisconnect` — nastav `player.isOnline = false` (vedle `player.socketId = null`).

**Step 3: Vytvoř `toPublicRoom()` helper v `roundUtils.ts`**

Přidej na konec souboru:
```typescript
/** Vrátí kopii místnosti s odstraněnými socketId hráčů (pro broadcast klientům). */
export function toPublicRoom(room: GameRoom): GameRoom {
  return {
    ...room,
    players: room.players.map(p => ({ ...p, socketId: null })),
  };
}
```

**Step 4: Použij `toPublicRoom()` ve všech broadcastech**

V `lobbyHandlers.ts` — přidej import `toPublicRoom` z roundUtils.

Najdi každé volání `.emit('lobby:stateUpdate', room)` a nahraď za `.emit('lobby:stateUpdate', toPublicRoom(room))`.

Soubory obsahující `lobby:stateUpdate` broadcast:
- `lobbyHandlers.ts`: řádky ~86, ~104, ~119, ~144, ~211
- `gameHandlers.ts`: řádky ~46, ~72, ~104, ~120, ~155, ~189, ~232, ~276
- `roundUtils.ts`: řádky 16, 44

Pro každý soubor přidej import `toPublicRoom` a nahraď volání.

**Step 5: Aktualizuj `PlayerList.vue`**

Řádek 31 — nahraď:
```html
v-else-if="!player.socketId"
```
za:
```html
v-else-if="!player.isOnline"
```

**Step 6: Spusť testy a build**
```bash
npm test --workspace=packages/backend
npm run build 2>&1 | grep -E "error|Error" | head -20
```
Očekávaný výstup: `66 passed`, žádné build chyby.

**Step 7: Commit**
```bash
git add packages/shared/src/index.ts packages/backend/src/game/RoomManager.ts packages/backend/src/socket/roundUtils.ts packages/backend/src/socket/lobbyHandlers.ts packages/backend/src/socket/gameHandlers.ts packages/frontend/src/components/PlayerList.vue
git commit -m "security: add isOnline to Player, strip socketId from room broadcasts"
```

---

## Task 6: Server-side Zod validace Socket.io eventů

**Problém:** Backend přijímá payload ze socket eventů bez jakékoli validace. Zlomyslný klient může poslat libovolně dlouhé stringy, záporná čísla, nebo nesprávné typy.

**Přístup:** Vytvoř `validation.ts` s Zod schématy. Přidej validační helper `validate()`, který volá callback s `{error}` nebo vrátí `false` pokud nemá callback. Použij validaci na začátku každého handleru.

**Files:**
- Create: `packages/backend/src/socket/validation.ts`
- Modify: `packages/backend/src/socket/lobbyHandlers.ts`
- Modify: `packages/backend/src/socket/gameHandlers.ts`

**Step 1: Vytvoř `validation.ts`**

```typescript
import { z } from 'zod';

// --- Sdílené schémata ---

const nickname = z.string().min(1).max(24).trim();
const roomCode = z.string().regex(/^[a-f0-9]{6}$/, 'Neplatný kód místnosti');

// --- Schémata pro jednotlivé eventy ---

export const CreateRoomSchema = z.object({
  name: z.string().min(1).max(30).trim(),
  isPublic: z.boolean(),
  selectedSetIds: z.array(z.number().int().positive()).min(1),
  maxPlayers: z.number().int().min(3).max(10),
  nickname,
  targetScore: z.number().int().refine(v => [8, 10, 15, 20, 30].includes(v), {
    message: 'Cílový počet bodů musí být 8, 10, 15, 20 nebo 30',
  }),
});

export const JoinRoomSchema = z.object({
  code: roomCode,
  nickname: z.string().max(24).trim(),
  playerToken: z.string().uuid().optional(),
});

export const UpdateSettingsSchema = z.object({
  name: z.string().min(1).max(30).trim().optional(),
  isPublic: z.boolean().optional(),
  selectedSetIds: z.array(z.number().int().positive()).min(1).optional(),
  maxPlayers: z.number().int().min(3).max(10).optional(),
});

export const PlayCardsSchema = z.array(z.number().int().positive()).min(1).max(3);

export const JudgeSelectSchema = z.string().uuid('Neplatné submissionId');

export const KickPlayerSchema = z.string().uuid('Neplatné playerId');

// --- Helper ---

/** Zvaliduje data. Pokud selže, zavolá callback (pokud existuje) a vrátí null. */
export function validate<T>(
  schema: z.ZodType<T>,
  data: unknown,
  callback?: (result: { error: string }) => void
): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    const msg = result.error.errors[0]?.message ?? 'Neplatná data.';
    if (callback) callback({ error: msg });
    return null;
  }
  return result.data;
}
```

**Step 2: Přidej validaci do `lobbyHandlers.ts`**

Přidej import:
```typescript
import { CreateRoomSchema, JoinRoomSchema, UpdateSettingsSchema, KickPlayerSchema, validate } from './validation.js';
```

V handleru `lobby:create`:
```typescript
socket.on('lobby:create', (settings, callback) => {
  const data = validate(CreateRoomSchema, settings, callback);
  if (!data) return;
  // ... zbytek handleru beze změny, ale použij `data` místo `settings`
  const { room, playerToken } = roomManager.createRoom(data);
  ...
});
```

V handleru `lobby:join`:
```typescript
socket.on('lobby:join', (input, callback) => {
  const data = validate(JoinRoomSchema, input, callback);
  if (!data) return;
  const result = roomManager.joinRoom(data.code, data.nickname, data.playerToken);
  ...
});
```

V handleru `lobby:updateSettings`:
```typescript
socket.on('lobby:updateSettings', (input, callback) => {
  const data = validate(UpdateSettingsSchema, input, callback);
  if (!data) return;
  ...
  const result = roomManager.updateSettings(playerToken, data);
  ...
});
```

V handleru `lobby:kickPlayer`:
```typescript
socket.on('lobby:kickPlayer', (targetPlayerId, callback) => {
  const validId = validate(KickPlayerSchema, targetPlayerId, callback);
  if (!validId) return;
  ...
  const result = roomManager.kickPlayer(playerToken, validId);
  ...
});
```

**Step 3: Přidej validaci do `gameHandlers.ts`**

Přidej import:
```typescript
import { PlayCardsSchema, JudgeSelectSchema, validate } from './validation.js';
```

V handleru `game:playCards`:
```typescript
socket.on('game:playCards', (cardIds) => {
  const ids = validate(PlayCardsSchema, cardIds);
  if (!ids) { socket.emit('game:error', 'Neplatná data karet.'); return; }
  ...
  const result = engine.submitCards(playerId, ids);
  ...
});
```

V handleru `game:judgeSelect`:
```typescript
socket.on('game:judgeSelect', (submissionId) => {
  const id = validate(JudgeSelectSchema, submissionId);
  if (!id) { socket.emit('game:error', 'Neplatné submissionId.'); return; }
  ...
  const result = engine.selectWinner(czarId, id);
  ...
});
```

**Step 4: Ověř build a testy**
```bash
npm test --workspace=packages/backend
npm run build 2>&1 | grep -E "error|Error" | head -20
```
Očekávaný výstup: `66 passed`, žádné build chyby.

**Step 5: Commit**
```bash
git add packages/backend/src/socket/validation.ts packages/backend/src/socket/lobbyHandlers.ts packages/backend/src/socket/gameHandlers.ts
git commit -m "security: add Zod server-side validation to all Socket.io event handlers"
```

---

## Task 7: Rate limiting Socket.io eventů

**Problém:** Klient může spamovat eventy bez omezení — `lobby:create` dokáže zaplnit server memory, opakované `game:playCards` může způsobit race conditions.

**Přístup:** Jednoduchý sliding window rate limiter na úrovni socketu. Map<socketId, Map<event, timestamps[]>>, čistění starých záznamů při každé kontrole.

**Files:**
- Create: `packages/backend/src/socket/rateLimiter.ts`
- Modify: `packages/backend/src/socket/lobbyHandlers.ts`
- Modify: `packages/backend/src/socket/gameHandlers.ts`

**Step 1: Vytvoř `rateLimiter.ts`**

```typescript
// Sliding window rate limiter pro Socket.io eventy
// Limity jsou záměrně velkorysé — cílem je ochrana před spamem, ne throttling

const calls = new Map<string, Map<string, number[]>>();

interface Limit {
  max: number;   // max počet volání
  windowMs: number; // za tuto dobu v ms
}

const LIMITS: Record<string, Limit> = {
  'lobby:create':         { max: 3,   windowMs: 30_000 },
  'lobby:join':           { max: 10,  windowMs: 10_000 },
  'lobby:updateSettings': { max: 10,  windowMs: 5_000  },
  'game:playCards':       { max: 10,  windowMs: 5_000  },
  'game:judgeSelect':     { max: 10,  windowMs: 5_000  },
};

/**
 * Vrátí true pokud je volání povoleno (v limitu), false pokud je rate limit překročen.
 * Automaticky čistí záznamy starší než windowMs.
 */
export function checkRateLimit(socketId: string, event: string): boolean {
  const limit = LIMITS[event];
  if (!limit) return true; // neomezený event

  if (!calls.has(socketId)) calls.set(socketId, new Map());
  const socketCalls = calls.get(socketId)!;
  if (!socketCalls.has(event)) socketCalls.set(event, []);

  const now = Date.now();
  const timestamps = socketCalls.get(event)!;

  // Odstraň záznamy starší než window
  const cutoff = now - limit.windowMs;
  const recent = timestamps.filter(t => t > cutoff);
  socketCalls.set(event, recent);

  if (recent.length >= limit.max) return false;

  recent.push(now);
  return true;
}

/** Vyčisti záznamy pro socket po odpojení */
export function cleanupSocket(socketId: string): void {
  calls.delete(socketId);
}
```

**Step 2: Přidej rate limiting do `lobbyHandlers.ts`**

Přidej import:
```typescript
import { checkRateLimit, cleanupSocket } from './rateLimiter.js';
```

Přidej kontrolu na začátek handlerů `lobby:create`, `lobby:join`, `lobby:updateSettings`:
```typescript
socket.on('lobby:create', (settings, callback) => {
  if (!checkRateLimit(socket.id, 'lobby:create')) {
    callback({ error: 'Příliš mnoho požadavků. Zkus to za chvíli.' });
    return;
  }
  // ... zbytek beze změny
});
```

V `disconnect` handleru přidej cleanup:
```typescript
socket.on('disconnect', () => {
  cleanupSocket(socket.id);
  // ... zbytek beze změny
});
```

**Step 3: Přidej rate limiting do `gameHandlers.ts`**

Přidej import:
```typescript
import { checkRateLimit } from './rateLimiter.js';
```

Přidej kontrolu na začátek `game:playCards` a `game:judgeSelect`:
```typescript
socket.on('game:playCards', (cardIds) => {
  if (!checkRateLimit(socket.id, 'game:playCards')) {
    socket.emit('game:error', 'Příliš mnoho požadavků. Zkus to za chvíli.');
    return;
  }
  // ... zbytek beze změny
});
```

**Step 4: Ověř build a testy**
```bash
npm test --workspace=packages/backend
npm run build 2>&1 | grep -E "error|Error" | head -20
```
Očekávaný výstup: `66 passed`, žádné build chyby.

**Step 5: Commit**
```bash
git add packages/backend/src/socket/rateLimiter.ts packages/backend/src/socket/lobbyHandlers.ts packages/backend/src/socket/gameHandlers.ts
git commit -m "security: add sliding window rate limiting to Socket.io event handlers"
```

---

## Task 8: Odstranění dead code `returnToLobby`

**Problém:** Metoda `returnToLobby` v `RoomManager.ts` není nikdy volána z žádného socket handleru (`finishGame` již vše zajistí přímo). Je to mrtvý kód se zbytečnými testy.

**Files:**
- Modify: `packages/backend/src/game/RoomManager.ts`
- Modify: `packages/backend/src/game/RoomManager.test.ts`

**Step 1: Odstraň metodu z `RoomManager.ts`**

Odstraň celý blok `returnToLobby` (~řádky 438–472 včetně komentáře `// --- returnToLobby ---`).

**Step 2: Odstraň testy pro `returnToLobby`**

V `RoomManager.test.ts` odstraň oba testy v sekci `// --- returnToLobby ---` (~řádky 307–338):
- `it('returnToLobby returns error when not FINISHED', ...)`
- `it('returnToLobby resets room state', ...)`

**Step 3: Spusť testy**
```bash
npm test --workspace=packages/backend
```
Očekávaný výstup: `64 passed` (bylo 66, odebrali jsme 2 testy).

**Step 4: Ověř build**
```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

**Step 5: Commit**
```bash
git add packages/backend/src/game/RoomManager.ts packages/backend/src/game/RoomManager.test.ts
git commit -m "refactor: remove unused returnToLobby dead code from RoomManager"
```

---

## Závěrečná verifikace

Po dokončení všech tasků:

```bash
# Testy musí projít
npm test --workspace=packages/backend

# Build musí projít bez chyb
npm run build

# Ověř počet commitů
git log --oneline -10
```

Očekávaný stav: 8 nových commitů, `64 passed` v testech, čistý build.
