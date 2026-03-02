# Game Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement 4 independent improvements: (1) white card reshuffle mechanic, (2) nickname uniqueness + profile change propagation, (3) PWA offline page navigation bug fix, (4) extended alfanumeric room token charset.

**Architecture:**
- Tasks 1 & 4 are backend-only (GameEngine, RoomManager, validation).
- Task 2 spans backend (new socket event), shared types, and frontend (profileStore, roomStore, PlayerProfileModal).
- Task 3 is a single-line config fix in `packages/frontend/vite.config.ts`.
- All tasks are independent — execute in any order.

**Tech Stack:** Node.js, TypeScript, Vitest (backend tests), Vue 3 + Pinia (frontend), vite-plugin-pwa / Workbox (PWA).

---

## Task 1: White Card Reshuffle Mechanic

**Problem:** `GameEngine.startRound()` deals cards from `whiteDeck` but never recovers played cards. When the deck depletes, hands stay under HAND_SIZE (10). With a single card set (~200 white cards for 5+ players over many rounds), this is a real problem.

**Files:**
- Modify: `packages/backend/src/game/GameEngine.ts`
- Test: `packages/backend/src/game/GameEngine.test.ts`

### Step 1: Write the failing tests

Add at the end of `GameEngine.test.ts` (inside the `describe('GameEngine')` block):

```typescript
// --- Reshuffle mechanic ---

it('moves submitted cards to used pile and reshuffles when deck depletes', () => {
  // 3 players × 10 = 30 cards needed for first deal; deck has exactly 30
  // After round 1: 2 non-czar players each submit 1 card → 2 cards in usedPile
  // Round 2 needs to replenish 2 cards but deck is empty → must reshuffle
  const players3 = [makePlayer('a', 'A'), makePlayer('b', 'B'), makePlayer('c', 'C')];
  const eng = new GameEngine(players3, makeBlackCards(20), makeWhiteCards(30));
  eng.startRound();
  const nonCzars = players3.filter(p => !p.isCardCzar);
  for (const p of nonCzars) {
    eng.submitCards(p.id, [eng.getPlayerHand(p.id)[0].id]);
  }
  // Round 2: should NOT throw even though deck is exhausted
  expect(() => eng.startRound()).not.toThrow();
  // All non-AFK players should have hands replenished to 10
  for (const p of players3.filter(p => !p.isAfk)) {
    expect(eng.getPlayerHand(p.id)).toHaveLength(10);
  }
});

it('does not reshuffle when deck still has enough cards', () => {
  // 100 white cards for 3 players — deck will not deplete in one round
  const players3 = [makePlayer('a', 'A'), makePlayer('b', 'B'), makePlayer('c', 'C')];
  const eng = new GameEngine(players3, makeBlackCards(20), makeWhiteCards(100));
  eng.startRound();
  const nonCzars = players3.filter(p => !p.isCardCzar);
  for (const p of nonCzars) {
    eng.submitCards(p.id, [eng.getPlayerHand(p.id)[0].id]);
  }
  expect(() => eng.startRound()).not.toThrow();
  for (const p of players3) {
    expect(eng.getPlayerHand(p.id)).toHaveLength(10);
  }
});
```

### Step 2: Run tests to verify they fail

```bash
npm test --workspace=packages/backend
```

Expected: 2 new tests FAIL (`moves submitted cards to used pile...` and `does not reshuffle...`).

### Step 3: Implement reshuffle in GameEngine.ts

**Changes in `packages/backend/src/game/GameEngine.ts`:**

1. Add `private usedWhiteCards: WhiteCard[] = [];` after `private czarPointer = -1;`

2. Replace the entire `startRound()` method body:

```typescript
startRound(): { czarId: string } {
  this.roundNumber++;

  // Move last round's submitted cards to the used pile before clearing
  for (const sub of this.submissions.values()) {
    this.usedWhiteCards.push(...sub.cards);
  }
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
      // Reshuffle used cards into deck if current deck is empty
      if (this.whiteDeck.length === 0 && this.usedWhiteCards.length > 0) {
        this.whiteDeck = shuffle(this.usedWhiteCards);
        this.usedWhiteCards = [];
      }
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
```

### Step 4: Run tests to verify they pass

```bash
npm test --workspace=packages/backend
```

Expected: All tests PASS (68 total, 2 new ones pass).

### Step 5: Commit

```bash
git add packages/backend/src/game/GameEngine.ts packages/backend/src/game/GameEngine.test.ts
git commit -m "feat: add white card reshuffle mechanic when deck depletes"
```

---

## Task 2: Nickname Uniqueness + Profile Change Propagation

**Problem A:** When changing profile nickname while in a room, the server-side player name stays the same. The UI shows one name (new profile), the game shows another.

**Problem B:** The `JoinRoomSchema` allows `nickname: z.string().max(24)` with no minimum — a reconnecting player sends `nickname: ''` which is valid, but if the reconnect path fails (invalid/expired token), the server would create a new player with an empty nickname.

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/backend/src/socket/lobbyHandlers.ts`
- Modify: `packages/backend/src/socket/validation.ts`
- Modify: `packages/backend/src/game/RoomManager.ts`
- Modify: `packages/frontend/src/stores/roomStore.ts`
- Modify: `packages/frontend/src/stores/profileStore.ts`
- Modify: `packages/frontend/src/components/PlayerProfileModal.vue`

### Step 1: Add socket event type to shared types

In `packages/shared/src/index.ts`, add to `ClientToServerEvents`:

```typescript
'lobby:updateNickname': (
  nickname: string,
  callback: (result: { ok: true } | { error: string }) => void
) => void;
```

### Step 2: Add validation schema for nickname update

In `packages/backend/src/socket/validation.ts`, add:

```typescript
export const UpdateNicknameSchema = z.string().min(1).max(24).trim();
```

### Step 3: Add `updateNickname` to RoomManager

In `packages/backend/src/game/RoomManager.ts`, add after `updateSettings()`:

```typescript
// ------------------------------------------------------------------ updateNickname

updateNickname(playerToken: string, newNickname: string): ActionResult {
  const code = this.playerRooms.get(playerToken);
  if (!code) return { error: 'Nejsi v žádné místnosti.' };

  const room = this.rooms.get(code);
  if (!room) return { error: 'Místnost nebyla nalezena.' };

  const playerId = this.tokenToPlayerId.get(playerToken);
  if (!playerId) return { error: 'Hráč nenalezen.' };

  const player = room.players.find(p => p.id === playerId);
  if (!player) return { error: 'Hráč nenalezen.' };

  const trimmed = newNickname.trim();
  if (trimmed === player.nickname) return { room }; // no change

  const duplicate = room.players.some(
    p => p.id !== playerId && p.nickname.toLowerCase() === trimmed.toLowerCase()
  );
  if (duplicate) return { error: 'Přezdívka je již obsazena.' };

  player.nickname = trimmed;
  return { room };
}
```

### Step 4: Register socket handler in lobbyHandlers.ts

In `packages/backend/src/socket/lobbyHandlers.ts`, add the import for `UpdateNicknameSchema` and add this handler before the `disconnect` handler:

```typescript
// Update nickname (while in room)
socket.on('lobby:updateNickname', (newNickname, callback) => {
  if (!checkRateLimit(socket.id, 'lobby:updateNickname')) {
    callback({ error: 'Příliš mnoho požadavků. Zkus to za chvíli.' });
    return;
  }
  const playerToken = socketToToken.get(socket.id);
  if (!playerToken) { callback({ error: 'Nejsi přihlášen' }); return; }

  const validated = validate(UpdateNicknameSchema, newNickname, callback);
  if (!validated) return;

  const result = roomManager.updateNickname(playerToken, validated);
  if ('error' in result) { callback(result); return; }

  io.to(`room:${result.room.code}`).emit('lobby:stateUpdate', toPublicRoom(result.room));
  callback({ ok: true });
});
```

Update the import line in `lobbyHandlers.ts` to include `UpdateNicknameSchema`:
```typescript
import { CreateRoomSchema, JoinRoomSchema, UpdateSettingsSchema, KickPlayerSchema, UpdateNicknameSchema, validate } from './validation.js';
```

### Step 5: Fix validation — protect empty nickname on non-reconnect join

The `JoinRoomSchema` in `validation.ts` allows empty nickname (for reconnect path). But when the reconnect path fails, the server shouldn't create a player with empty nickname.

In `packages/backend/src/socket/lobbyHandlers.ts`, in the `lobby:join` handler, after checking `result.wasReconnect`, ensure the server rejects a new-player join with empty nickname. The cleanest fix: update `joinRoom()` in `RoomManager.ts` to reject empty nickname for new-player creation (not reconnect):

In `RoomManager.ts`, in `joinRoom()`, after the reconnect path (before `if (room.status !== 'LOBBY')`), add:

```typescript
// Reject empty nickname for new player (only reconnects may pass empty nickname)
if (!nickname.trim()) {
  return { error: 'Přezdívka nesmí být prázdná.' };
}
```

### Step 6: Add `updateNickname` action to roomStore.ts

In `packages/frontend/src/stores/roomStore.ts`, add before the `return` statement:

```typescript
async function updateNickname(newNickname: string): Promise<{ error: string } | null> {
  return new Promise((resolve) => {
    socket.emit('lobby:updateNickname', newNickname, (result) => {
      resolve('error' in result ? result : null);
    });
  });
}
```

Add `updateNickname` to the `return` object.

### Step 7: Call updateNickname from profileStore.save()

The `profileStore` doesn't have access to `roomStore` (Pinia stores can be cross-imported). Inject the nickname sync via a callback or by calling roomStore directly.

In `packages/frontend/src/stores/profileStore.ts`:

```typescript
import { useRoomStore } from './roomStore';

// Modify save() to also sync nickname to active room:
async function save(newNickname: string, newLocale: SupportedLocale): Promise<string | null> {
  const trimmed = newNickname.trim();
  locale.value = newLocale;
  const profile: PlayerProfile = { nickname: trimmed, locale: newLocale };
  localStorage.setItem('playerProfile', JSON.stringify(profile));
  localStorage.setItem('locale', newLocale);
  (i18n.global.locale as { value: string }).value = newLocale;

  // Sync nickname to room if currently in one
  const roomStore = useRoomStore();
  if (roomStore.room && trimmed !== nickname.value) {
    const error = await roomStore.updateNickname(trimmed);
    if (error) return error.error; // nickname taken — don't update local store
  }

  nickname.value = trimmed;
  return null; // success
}
```

> **Note:** `save()` becomes async and returns `null` on success or an error string if the server rejected the nickname.

### Step 8: Handle error in PlayerProfileModal.vue

Read `packages/frontend/src/components/PlayerProfileModal.vue` first to understand current save flow.

The save button currently calls `profileStore.save(nick, locale)`. Update it to:

```typescript
const saveError = ref('');

async function handleSave() {
  const error = await profileStore.save(editNick.value, editLocale.value);
  if (error) {
    saveError.value = error;
    return;
  }
  saveError.value = '';
  emit('close');
}
```

Add a `<p v-if="saveError" class="text-red-500 text-sm">{{ saveError }}</p>` near the save button.

### Step 9: Build check

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors.

### Step 10: Commit

```bash
git add packages/shared/src/index.ts \
        packages/backend/src/socket/validation.ts \
        packages/backend/src/game/RoomManager.ts \
        packages/backend/src/socket/lobbyHandlers.ts \
        packages/frontend/src/stores/roomStore.ts \
        packages/frontend/src/stores/profileStore.ts \
        packages/frontend/src/components/PlayerProfileModal.vue
git commit -m "feat: propagate nickname changes to room and validate uniqueness"
```

---

## Task 3: Fix PWA Offline Page Bug

**Problem:** `navigateFallback: '/offline.html'` causes Workbox to serve `offline.html` for ALL navigation requests to uncached paths (e.g. `/room/b3594b`), even when the user is online. The SPA shell (`index.html`) should be served instead, letting Vue Router handle the route.

**Root cause:** `navigateFallback` is Workbox's "fallback for navigation requests not in the precache". For an SPA, this must be `/index.html` (the app shell), not an error page.

**Files:**
- Modify: `packages/frontend/vite.config.ts` — one line change

### Step 1: Fix navigateFallback

In `packages/frontend/vite.config.ts`, change:

```typescript
navigateFallback: '/offline.html',
```

to:

```typescript
navigateFallback: '/index.html',
```

The `offline.html` file stays in `public/` for manual use, but Workbox's navigation fallback now correctly serves the SPA shell. Actual network failures will result in the app attempting to connect and showing a connection error — appropriate for a real-time multiplayer game that requires internet.

### Step 2: Update roomCode validator to accept new tokens (if Task 4 is done first)

> Skip if Task 4 has not been done yet.

### Step 3: Build and verify

```bash
npm run build --workspace=packages/frontend
```

Expected: Build succeeds. Check that `dist/sw.js` (generated service worker) no longer references `/offline.html` as `navigateFallback`.

```bash
grep -r "navigateFallback" packages/frontend/dist/sw.js
```

Expected: output contains `"/index.html"`, NOT `"/offline.html"`.

### Step 4: Commit

```bash
git add packages/frontend/vite.config.ts
git commit -m "fix: set PWA navigateFallback to index.html so room URLs load correctly"
```

---

## Task 4: Extended Alfanumeric Room Token Charset

**Problem:** Current token `randomBytes(3).toString('hex')` produces 6 hex chars (`[a-f0-9]`). This gives 16^6 = 16.7M combinations. Expanding to alfanumeric sans ambiguous chars increases readability while expanding the keyspace.

**Target charset:** Uppercase A–Z + digits 0–9, excluding: `0` (zero), `O` (oh), `1` (one), `I` (eye), `L` (el).
Result: 10 digits + 26 letters − 5 = **31 characters** → 31^6 ≈ 887M combinations.

**Files:**
- Modify: `packages/backend/src/game/RoomManager.ts`
- Modify: `packages/backend/src/socket/validation.ts`
- Modify: `packages/backend/src/routes/rooms.ts` (if it validates room code format)

### Step 1: Check rooms.ts for code validation

Read `packages/backend/src/routes/rooms.ts` to check if the route validates the room code format. If it does (e.g. with a regex), update it together with `validation.ts`.

### Step 2: Implement new token generator in RoomManager.ts

In `packages/backend/src/game/RoomManager.ts`, replace:

```typescript
const code = randomBytes(3).toString('hex');
```

with:

```typescript
const code = generateRoomCode();
```

Add the helper function before the class (near the top of the file, after imports):

```typescript
const ROOM_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 chars: A-Z + 2-9, no 0/O/1/I/L

function generateRoomCode(length = 6): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, b => ROOM_CODE_CHARS[b % ROOM_CODE_CHARS.length]).join('');
}
```

> **Note:** `b % ROOM_CODE_CHARS.length` has slight modulo bias for non-power-of-2 lengths (31 chars). For room codes this bias is negligible and avoids a rejection-sampling loop.

### Step 3: Update validation regex and add uppercase transform

In `packages/backend/src/socket/validation.ts`, change:

```typescript
const roomCode = z.string().regex(/^[a-f0-9]{6}$/, 'Neplatný kód místnosti');
```

to:

```typescript
const roomCode = z.string().toUpperCase().regex(/^[A-Z2-9]{6}$/, 'Neplatný kód místnosti');
```

The `.toUpperCase()` transform ensures case-insensitive input (users may type a code in lowercase in JoinPrivateModal or via URL).

### Step 4: Fix rooms.ts route — change toLowerCase() to toUpperCase()

`packages/backend/src/routes/rooms.ts` calls `code.toLowerCase()` on the path param before lookup. Since codes are now stored uppercase, this breaks the lookup.

Change:

```typescript
const room = roomManager.getRoom(code.toLowerCase());
```

to:

```typescript
const room = roomManager.getRoom(code.toUpperCase());
```

Also add `rooms.ts` to the commit in Step 7.

### Step 5: Run backend tests

```bash
npm test --workspace=packages/backend
```

Expected: All tests pass. Note: existing RoomManager tests that hardcode room code format may need updating. RoomManager.test.ts calls `createRoom()` and uses the returned code — it does not hardcode the format, so tests should pass without changes. The `rooms.test.ts` may hardcode a hex code in fixtures — check and update if needed.

### Step 6: Build check

```bash
npm run build
```

Expected: No TypeScript errors.

### Step 7: Commit

```bash
git add packages/backend/src/game/RoomManager.ts \
        packages/backend/src/socket/validation.ts \
        packages/backend/src/routes/rooms.ts
git commit -m "feat: use alfanumeric room codes (A-Z2-9, 6 chars) without ambiguous characters"
```

---

## Execution Order Recommendation

Run tasks independently. Suggested order for minimal conflict:
1. **Task 3** (trivial one-line fix, zero risk)
2. **Task 4** (backend only, no test changes expected)
3. **Task 1** (backend + tests, self-contained)
4. **Task 2** (most complex, touches all layers)

After all tasks: run full test suite and build:
```bash
npm test --workspace=packages/backend && npm run build
```
