# Retract Cards Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow a player to take back their submitted cards and resubmit a different selection while waiting for others in the SELECTION phase.

**Architecture:** New socket event `game:retractCards` triggers `GameEngine.retractCards()` which returns cards to the player's hand and resets `hasPlayed`. Server emits `lobby:stateUpdate` (resets `hasPlayed` for all clients) + `game:handUpdate` (sends updated hand to the retracting player). Frontend shows a "Změnit výběr" button when `hasPlayed === true`.

**Tech Stack:** TypeScript, Socket.io, Vitest (backend), Vue 3 + Pinia (frontend)

---

### Task 1: Update shared types

**Files:**
- Modify: `packages/shared/src/index.ts:77-87` (ServerToClientEvents)
- Modify: `packages/shared/src/index.ts:89-124` (ClientToServerEvents)

**Step 1: Add `game:retractCards` to ClientToServerEvents and `game:handUpdate` to ServerToClientEvents**

In `packages/shared/src/index.ts`, add to `ServerToClientEvents` (after line 86):
```typescript
'game:handUpdate': (hand: WhiteCard[]) => void;
```

Add to `ClientToServerEvents` (after line 122):
```typescript
'game:retractCards': () => void;
```

**Step 2: Verify TypeScript compiles**

Run: `npm run build --workspace=packages/shared`
Expected: no errors

**Step 3: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): add game:retractCards and game:handUpdate socket events"
```

---

### Task 2: Add `retractCards` method to GameEngine (TDD)

**Files:**
- Modify: `packages/backend/src/game/GameEngine.test.ts` (add tests after line 124)
- Modify: `packages/backend/src/game/GameEngine.ts` (add method after submitCards, line 105)

**Step 1: Write the failing tests**

Add to `packages/backend/src/game/GameEngine.test.ts`, inside the `describe('GameEngine')` block, after the `submitCards` tests (after line 124):

```typescript
// --- retractCards ---

it('returns cards to hand after retract', () => {
  engine.startRound();
  const nonCzar = players.find(p => !p.isCardCzar)!;
  const cardId = engine.getPlayerHand(nonCzar.id)[0].id;
  engine.submitCards(nonCzar.id, [cardId]);
  expect(engine.getPlayerHand(nonCzar.id)).toHaveLength(9);
  engine.retractCards(nonCzar.id);
  expect(engine.getPlayerHand(nonCzar.id)).toHaveLength(10);
});

it('resets hasPlayed to false after retract', () => {
  engine.startRound();
  const nonCzar = players.find(p => !p.isCardCzar)!;
  const cardId = engine.getPlayerHand(nonCzar.id)[0].id;
  engine.submitCards(nonCzar.id, [cardId]);
  expect(nonCzar.hasPlayed).toBe(true);
  engine.retractCards(nonCzar.id);
  expect(nonCzar.hasPlayed).toBe(false);
});

it('allows resubmission after retract', () => {
  engine.startRound();
  const nonCzar = players.find(p => !p.isCardCzar)!;
  const originalCardId = engine.getPlayerHand(nonCzar.id)[0].id;
  engine.submitCards(nonCzar.id, [originalCardId]);
  engine.retractCards(nonCzar.id);
  const newCardId = engine.getPlayerHand(nonCzar.id)[0].id;
  const result = engine.submitCards(nonCzar.id, [newCardId]);
  expect(result).toEqual(expect.objectContaining({ ok: true }));
});

it('returns error when retracting without having submitted', () => {
  engine.startRound();
  const nonCzar = players.find(p => !p.isCardCzar)!;
  const result = engine.retractCards(nonCzar.id);
  expect(result).toHaveProperty('error');
});

it('retract preserves submissions of other players', () => {
  engine.startRound();
  const nonCzars = players.filter(p => !p.isCardCzar);
  // First player submits
  const p1 = nonCzars[0];
  engine.submitCards(p1.id, [engine.getPlayerHand(p1.id)[0].id]);
  // Second player submits
  const p2 = nonCzars[1];
  engine.submitCards(p2.id, [engine.getPlayerHand(p2.id)[0].id]);
  // First player retracts
  engine.retractCards(p1.id);
  // Second player's submission should still be there
  expect(p2.hasPlayed).toBe(true);
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test --workspace=packages/backend`
Expected: 5 new tests FAIL with "engine.retractCards is not a function"

**Step 3: Implement `retractCards` in GameEngine**

Add to `packages/backend/src/game/GameEngine.ts`, after the `submitCards` method (after line 105):

```typescript
retractCards(playerId: string): { ok: true } | { error: string } {
  const player = this.players.find(p => p.id === playerId);
  if (!player) return { error: 'Hráč nenalezen.' };
  if (!player.hasPlayed) return { error: 'Dosud jsi žádné karty neodeslal.' };

  const submission = this.submissions.get(playerId);
  if (submission) {
    const hand = this.playerHands.get(playerId) ?? [];
    hand.push(...submission.cards);
    this.playerHands.set(playerId, hand);
    this.submissions.delete(playerId);
  }

  player.hasPlayed = false;
  return { ok: true };
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test --workspace=packages/backend`
Expected: all 25 tests PASS

**Step 5: Commit**

```bash
git add packages/backend/src/game/GameEngine.ts packages/backend/src/game/GameEngine.test.ts
git commit -m "feat(backend): add GameEngine.retractCards with tests"
```

---

### Task 3: Add `game:retractCards` socket handler

**Files:**
- Modify: `packages/backend/src/socket/gameHandlers.ts:38` (add new handler after `game:playCards`)

**Step 1: Add handler after the `game:playCards` handler (after line 38)**

In `packages/backend/src/socket/gameHandlers.ts`, add after line 38 (after the closing `});` of the `game:playCards` handler):

```typescript
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
```

**Step 2: Verify TypeScript compiles**

Run: `npm run build --workspace=packages/backend`
Expected: no errors

**Step 3: Commit**

```bash
git add packages/backend/src/socket/gameHandlers.ts
git commit -m "feat(backend): handle game:retractCards socket event"
```

---

### Task 4: Update frontend roomStore

**Files:**
- Modify: `packages/frontend/src/stores/roomStore.ts`

**Step 1: Add `game:handUpdate` listener**

In `packages/frontend/src/stores/roomStore.ts`, add inside `function init()`, after the `game:roundEnd` listener (after line 63):

```typescript
socket.on('game:handUpdate', (newHand) => {
  hand.value = newHand;
});
```

**Step 2: Add `retractCards` action**

In `packages/frontend/src/stores/roomStore.ts`, add after the `playCards` function (after line 111):

```typescript
function retractCards() {
  socket.emit('game:retractCards');
  selectedCards.value = [];
}
```

**Step 3: Add `retractCards` to cleanup**

In the `cleanup` function, add after `socket.off('game:roundEnd')` (line 131):

```typescript
socket.off('game:handUpdate');
```

**Step 4: Export `retractCards` in the return statement**

In the return statement (line 143-149), add `retractCards` to the exports:
```typescript
playCards, judgeSelect, toggleCardSelection, retractCards,
```

**Step 5: Verify TypeScript compiles**

Run: `npm run build --workspace=packages/frontend`
Expected: no errors

**Step 6: Commit**

```bash
git add packages/frontend/src/stores/roomStore.ts
git commit -m "feat(frontend): add retractCards action and game:handUpdate listener to roomStore"
```

---

### Task 5: Update SelectionPhase.vue

**Files:**
- Modify: `packages/frontend/src/components/SelectionPhase.vue`

**Step 1: Add `retracting` ref and `retract` function**

Replace the `<script setup>` block (lines 1-13) with:

```typescript
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoomStore } from '../stores/roomStore';

const roomStore = useRoomStore();
const pick = computed(() => roomStore.currentBlackCard?.pick ?? 1);
const canSubmit = computed(() => roomStore.selectedCards.length === pick.value);
const retracting = ref(false);

function submit() {
  if (!canSubmit.value) return;
  roomStore.playCards(roomStore.selectedCards.map(c => c.id));
}

function retract() {
  retracting.value = true;
  roomStore.retractCards();
}
</script>
```

**Step 2: Replace the "Hráč odeslal" section in template**

Replace lines 31-33 (the `v-else-if="roomStore.me?.hasPlayed"` paragraph):

```html
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
```

Note: `retracting` stays `true` until `lobby:stateUpdate` sets `me.hasPlayed = false`, at which point the `v-else-if` condition becomes false and this block is hidden — the button naturally disappears, no need to reset `retracting`.

**Step 3: Verify in browser**

Start dev servers:
```bash
npm run dev:backend
npm run dev:frontend
```

Manual test flow:
1. Open two browser windows, create a room with 3+ players
2. Start the game
3. In window 1 (non-czar): select and submit cards → verify green message + "Změnit výběr" button appears
4. Click "Změnit výběr" → verify hand reappears with cards to pick
5. Submit different cards → verify works normally
6. In window 2 (another non-czar): also submit → verify game advances to JUDGING normally

**Step 4: Commit**

```bash
git add packages/frontend/src/components/SelectionPhase.vue
git commit -m "feat(frontend): add Změnit výběr button to SelectionPhase"
```
