# Win Conditions & Room Settings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add time and round-count win conditions, fix score-exceeded detection (already works with `>=`), and allow the host to edit all room settings from the lobby between games.

**Architecture:** One active win condition (`score` | `time` | `rounds`) stored on `GameRoom`. Win is checked in `gameHandlers.ts` after each round. Frontend gets a new `RoomSettingsModal` for the host, and `CreateTableModal` gains a win condition picker.

**Tech Stack:** TypeScript, Socket.io, Vue 3 (Composition API), Tailwind v4, Pinia, vue-i18n, Zod

---

## Context

Key files and line numbers (read before editing, not after):

| File | Key area |
|---|---|
| `packages/shared/src/index.ts:86-102` | `GameRoom` interface |
| `packages/shared/src/index.ts:135-157` | `ClientToServerEvents` lobby:create + lobby:updateSettings |
| `packages/backend/src/socket/validation.ts:18-42` | `CreateRoomSchema`, `UpdateSettingsSchema` |
| `packages/backend/src/game/RoomManager.ts:50-72` | `CreateRoomSettings`, `UpdateSettingsData` |
| `packages/backend/src/game/RoomManager.ts:107-130` | `createRoom()` |
| `packages/backend/src/game/RoomManager.ts:304-330` | `updateSettings()` |
| `packages/backend/src/game/RoomManager.ts:361-384` | `startGame()` |
| `packages/backend/src/socket/gameHandlers.ts:150-167` | score win check in `game:judgeSelect` |
| `packages/backend/src/socket/gameHandlers.ts:341-381` | `game:skipCzarJudging` handler |
| `packages/frontend/src/stores/lobbyStore.ts:65-84` | `createRoom()` |
| `packages/frontend/src/stores/roomStore.ts:136-147` | `updateSettings()` |
| `packages/frontend/src/components/CreateTableModal.vue` | Win condition UI to add |
| `packages/frontend/src/components/LobbyPanel.vue` | Settings button + win condition display |
| `packages/frontend/src/i18n/locales/cs.json` | Czech strings |
| `packages/frontend/src/i18n/locales/en.json` | English strings |
| `packages/backend/src/game/RoomManager.test.ts` | Existing tests (must keep passing) |

---

## Task 1: Shared Types

**Files:**
- Modify: `packages/shared/src/index.ts`

### Step 1: Add `WinCondition` type and extend `GameRoom`

Edit `packages/shared/src/index.ts`. After line 11 (after `SpecialRule`), add:

```typescript
export type WinCondition = 'score' | 'time' | 'rounds';
```

In the `GameRoom` interface (currently line 98 has `targetScore`), add after `targetScore: number;`:

```typescript
  winCondition: WinCondition;      // výchozí: 'score'
  targetRounds: number;             // výchozí: 20 (pro 'rounds')
  gameTimeLimit: number;            // minuty, výchozí: 15 (pro 'time')
  gameStartedAt: number | null;     // ms timestamp, nastaven při startGame
```

### Step 2: Update `ClientToServerEvents.lobby:create`

The `lobby:create` settings object (lines 136-144) currently has `targetScore: number`. Add:

```typescript
      winCondition?: WinCondition;
      targetRounds?: number;
      gameTimeLimit?: number;
```

### Step 3: Update `ClientToServerEvents.lobby:updateSettings`

The `lobby:updateSettings` settings object (lines 154-157) currently has `name?`, `isPublic?`, etc. Add:

```typescript
      specialRules?: SpecialRule[];
      winCondition?: WinCondition;
      targetScore?: number;
      targetRounds?: number;
      gameTimeLimit?: number;
```

(Note: `specialRules` is already in `UpdateSettingsData` on the backend but missing from the shared type — add it now.)

### Step 4: Run tests to verify no breakage

```bash
npm test --workspace=packages/backend 2>&1 | tail -5
```

Expected: all 71 tests pass (shared types are not tested directly).

### Step 5: Commit

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): add WinCondition type and extend GameRoom"
```

---

## Task 2: Backend Validation Schemas

**Files:**
- Modify: `packages/backend/src/socket/validation.ts`

### Step 1: Add `WinCondition` import and schema

At the top of the file, update the import from `@kpl/shared`:

```typescript
import type { SpecialRule, WinCondition } from '@kpl/shared';
```

After `specialRules` constant (line 14), add:

```typescript
const VALID_WIN_CONDITIONS: WinCondition[] = ['score', 'time', 'rounds'];
const winCondition = z.enum(VALID_WIN_CONDITIONS as [WinCondition, ...WinCondition[]]).default('score');
```

### Step 2: Update `CreateRoomSchema`

Add after `specialRules,` in `CreateRoomSchema`:

```typescript
  winCondition: winCondition,
  targetRounds: z.number().int().min(5).max(100).default(20),
  gameTimeLimit: z.number().int().refine(v => v >= 5 && v <= 60 && v % 5 === 0, {
    message: 'Časový limit musí být 5–60 minut v krocích 5.',
  }).default(15),
```

### Step 3: Update `UpdateSettingsSchema`

Add after `specialRules: specialRules.optional(),`:

```typescript
  winCondition: winCondition.optional(),
  targetScore: z.number().int().refine(v => [8, 10, 15, 20, 30].includes(v), {
    message: 'Cílový počet bodů musí být 8, 10, 15, 20 nebo 30',
  }).optional(),
  targetRounds: z.number().int().min(5).max(100).optional(),
  gameTimeLimit: z.number().int().refine(v => v >= 5 && v <= 60 && v % 5 === 0, {
    message: 'Časový limit musí být 5–60 minut v krocích 5.',
  }).optional(),
```

### Step 4: Run tests

```bash
npm test --workspace=packages/backend 2>&1 | tail -5
```

Expected: 71 tests pass.

### Step 5: Commit

```bash
git add packages/backend/src/socket/validation.ts
git commit -m "feat(backend): extend validation schemas for win conditions"
```

---

## Task 3: RoomManager — Types and createRoom

**Files:**
- Modify: `packages/backend/src/game/RoomManager.ts`

### Step 1: Import `WinCondition`

Update the import at line 2:

```typescript
import type { GameRoom, GameOverPayload, Player, PublicRoomSummary, SpecialRule, WinCondition } from '@kpl/shared';
```

### Step 2: Update `CreateRoomSettings` interface

After `specialRules: SpecialRule[];`, add:

```typescript
  winCondition?: WinCondition;
  targetRounds?: number;
  gameTimeLimit?: number;
```

(Optional with `?` so existing tests that omit them still compile.)

### Step 3: Update `UpdateSettingsData` interface

After `specialRules?: SpecialRule[];`, add:

```typescript
  winCondition?: WinCondition;
  targetScore?: number;
  targetRounds?: number;
  gameTimeLimit?: number;
```

### Step 4: Update `createRoom()` — add new fields to room object

In `createRoom()`, inside the `const room: GameRoom = { ... }` object (around line 107), after `targetScore: settings.targetScore,`, add:

```typescript
      winCondition: settings.winCondition ?? 'score',
      targetRounds: settings.targetRounds ?? 20,
      gameTimeLimit: settings.gameTimeLimit ?? 15,
      gameStartedAt: null,
```

### Step 5: Run tests

```bash
npm test --workspace=packages/backend 2>&1 | tail -5
```

Expected: 71 tests pass (existing calls without new fields get defaults).

### Step 6: Write failing test for new fields

In `packages/backend/src/game/RoomManager.test.ts`, add a test in the `createRoom` describe block:

```typescript
it('sets default win condition when not provided', () => {
  const { room } = rm.createRoom(
    { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 10, specialRules: [] }
  );
  expect(room.winCondition).toBe('score');
  expect(room.targetRounds).toBe(20);
  expect(room.gameTimeLimit).toBe(15);
  expect(room.gameStartedAt).toBeNull();
});

it('uses provided win condition', () => {
  const { room } = rm.createRoom(
    { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 10, specialRules: [],
      winCondition: 'time', gameTimeLimit: 30 }
  );
  expect(room.winCondition).toBe('time');
  expect(room.gameTimeLimit).toBe(30);
});
```

### Step 7: Run tests to verify new tests pass

```bash
npm test --workspace=packages/backend 2>&1 | tail -10
```

Expected: 73 tests pass.

### Step 8: Commit

```bash
git add packages/backend/src/game/RoomManager.ts packages/backend/src/game/RoomManager.test.ts
git commit -m "feat(backend): add win condition fields to RoomManager createRoom"
```

---

## Task 4: RoomManager — updateSettings and startGame

**Files:**
- Modify: `packages/backend/src/game/RoomManager.ts`

### Step 1: Update `updateSettings()` body

In `updateSettings()` (around line 323-327), after `if (settings.specialRules !== undefined) room.specialRules = settings.specialRules;`, add:

```typescript
    if (settings.winCondition !== undefined) room.winCondition = settings.winCondition;
    if (settings.targetScore !== undefined) room.targetScore = settings.targetScore;
    if (settings.targetRounds !== undefined) room.targetRounds = settings.targetRounds;
    if (settings.gameTimeLimit !== undefined) room.gameTimeLimit = settings.gameTimeLimit;
```

### Step 2: Update `startGame()` — set gameStartedAt

In `startGame()` (line 382), after `room.status = 'SELECTION';`, add:

```typescript
    room.gameStartedAt = Date.now();
```

### Step 3: Write failing test for updateSettings win condition

Add to `RoomManager.test.ts` in the updateSettings section:

```typescript
it('updates win condition via updateSettings', () => {
  const { room, playerToken } = rm.createRoom(
    { name: 'Test', isPublic: true, selectedSetIds: [1], maxPlayers: 6, nickname: 'Alice', targetScore: 10, specialRules: [] }
  );
  expect(room.winCondition).toBe('score');

  const result = rm.updateSettings(playerToken, { winCondition: 'rounds', targetRounds: 15 });
  expect('error' in result).toBe(false);
  if (!('error' in result)) {
    expect(result.room.winCondition).toBe('rounds');
    expect(result.room.targetRounds).toBe(15);
  }
});
```

### Step 4: Run tests

```bash
npm test --workspace=packages/backend 2>&1 | tail -10
```

Expected: 74 tests pass.

### Step 5: Commit

```bash
git add packages/backend/src/game/RoomManager.ts packages/backend/src/game/RoomManager.test.ts
git commit -m "feat(backend): updateSettings and startGame handle win conditions"
```

---

## Task 5: gameHandlers — Win Condition Logic

**Files:**
- Modify: `packages/backend/src/socket/gameHandlers.ts`

### Step 1: Add `isWinConditionMet` helper

At the top of `gameHandlers.ts`, after the imports, before `registerGameHandlers`, add:

```typescript
import type { GameRoom, RoundResult } from '@kpl/shared';

function isWinConditionMet(room: GameRoom, engine: GameEngine, result: RoundResult): boolean {
  switch (room.winCondition ?? 'score') {
    case 'score':
      return !!(result.winnerId && result.scores[result.winnerId] >= room.targetScore);
    case 'rounds':
      return engine.roundNumber >= room.targetRounds;
    case 'time':
      return !!(room.gameStartedAt && Date.now() - room.gameStartedAt >= room.gameTimeLimit * 60_000);
  }
}
```

Note: `room.winCondition ?? 'score'` handles rooms created before this feature (snapshot restore).

### Step 2: Replace score check in `game:judgeSelect`

Find the block at lines 150-167:
```typescript
    // Auto-win: zkontroluj jestli vítěz dosáhl targetScore
    const winnerId = result.winnerId;
    if (winnerId && result.scores[winnerId] >= room.targetScore) {
```

Replace with:
```typescript
    // Auto-win: zkontroluj výherní podmínku
    if (isWinConditionMet(room, engine, result)) {
```

Remove the `const winnerId = result.winnerId;` line (it's no longer used here), or keep it if it's used elsewhere (it's not — the `finishResult` block uses `finishResult.kickedTokens`). So delete both lines.

### Step 3: Add win condition check after `game:skipCzarJudging` startNewRound path

In `game:skipCzarJudging` (around line 371-380), the `setTimeout` calls `startNewRound`. This skips a round without awarding points, so win condition check is only relevant for `rounds` mode.

After `if (!cr || !ce || cr.status !== 'JUDGING') return;` and before the `try { startNewRound(...) }`, add a check that calls `finishGame` if the round condition is met:

```typescript
      // Zkontroluj podmínku kol i při přeskočeném kole (rounds mode)
      if ((cr.winCondition ?? 'score') === 'rounds' && ce.roundNumber >= cr.targetRounds) {
        const finishResult = roomManager.finishGame(roomCode);
        if (!('error' in finishResult)) {
          io.to(`room:${roomCode}`).emit('game:gameOver', finishResult.payload);
          for (const [sid, token] of socketToToken.entries()) {
            if (finishResult.kickedTokens.includes(token)) {
              const kickedSocket = io.sockets.sockets.get(sid);
              if (kickedSocket) kickedSocket.leave(`room:${roomCode}`);
              socketToToken.delete(sid);
            }
          }
          io.to(`room:${roomCode}`).emit('lobby:stateUpdate', toPublicRoom(finishResult.room));
          broadcastPublicRooms(io);
        }
        return;
      }
```

Do the same for the `game:czarForceAdvance` SELECTION-skip path (around line 278-288) — same pattern.

### Step 4: Run tests

```bash
npm test --workspace=packages/backend 2>&1 | tail -5
```

Expected: 74 tests pass.

### Step 5: Commit

```bash
git add packages/backend/src/socket/gameHandlers.ts
git commit -m "feat(backend): isWinConditionMet handles score/time/rounds end conditions"
```

---

## Task 6: Frontend Stores

**Files:**
- Modify: `packages/frontend/src/stores/lobbyStore.ts`
- Modify: `packages/frontend/src/stores/roomStore.ts`

### Step 1: Update `lobbyStore.ts` — `createRoom` signature

Update imports at top:

```typescript
import type { PublicRoomSummary, GameRoom, SpecialRule, WinCondition } from '@kpl/shared';
```

Update the `createRoom` function signature (line 65-73) to add new optional fields:

```typescript
  async function createRoom(settings: {
    name: string;
    isPublic: boolean;
    selectedSetIds: number[];
    maxPlayers: number;
    nickname: string;
    targetScore: number;
    specialRules: SpecialRule[];
    winCondition?: WinCondition;
    targetRounds?: number;
    gameTimeLimit?: number;
  }): Promise<{ room: GameRoom; code: string; playerToken: string; playerId: string } | { error: string }> {
```

The body (`socket.emit('lobby:create', settings, ...)`) passes `settings` directly — no changes needed there.

### Step 2: Update `roomStore.ts` — `updateSettings` signature

Update imports:
```typescript
import type { GameRoom, GameOverPayload, BlackCard, WhiteCard, AnonymousSubmission, RoundResult, SpecialRule, WinCondition } from '@kpl/shared';
```

Update `updateSettings` signature (lines 136-141):

```typescript
  async function updateSettings(settings: {
    name?: string;
    isPublic?: boolean;
    selectedSetIds?: number[];
    maxPlayers?: number;
    specialRules?: SpecialRule[];
    winCondition?: WinCondition;
    targetScore?: number;
    targetRounds?: number;
    gameTimeLimit?: number;
  }): Promise<{ error: string } | null> {
```

### Step 3: Commit

```bash
git add packages/frontend/src/stores/lobbyStore.ts packages/frontend/src/stores/roomStore.ts
git commit -m "feat(frontend): extend store types for win conditions"
```

---

## Task 7: i18n — Add Translation Keys

**Files:**
- Modify: `packages/frontend/src/i18n/locales/cs.json`
- Modify: `packages/frontend/src/i18n/locales/en.json`
- Modify: `packages/frontend/src/i18n/locales/ru.json`
- Modify: `packages/frontend/src/i18n/locales/uk.json`
- Modify: `packages/frontend/src/i18n/locales/es.json`

### Step 1: Add keys to `cs.json`

In the `"createTable"` section, replace the `"targetScore"` + `"points"` keys with:

```json
"targetScore": "Cílový počet bodů",
"points": "bodů",
"winCondition": "Kritérium vítězství",
"winScore": "Body",
"winTime": "Čas",
"winRounds": "Kola",
"minutes": "min",
"rounds": "kol"
```

Add a new `"roomSettings"` section:

```json
"roomSettings": {
  "title": "Nastavení místnosti",
  "save": "Uložit změny"
}
```

Add to `"lobby"` section:

```json
"settings": "Nastavení",
"winConditionScore": "🏆 {n} bodů",
"winConditionTime": "⏱ {n} min",
"winConditionRounds": "🔄 {n} kol"
```

### Step 2: Add keys to `en.json`

Same structure, English translations:

In `"createTable"`:
```json
"winCondition": "Win condition",
"winScore": "Score",
"winTime": "Time",
"winRounds": "Rounds",
"minutes": "min",
"rounds": "rounds"
```

Add `"roomSettings"`:
```json
"roomSettings": {
  "title": "Room settings",
  "save": "Save changes"
}
```

Add to `"lobby"`:
```json
"settings": "Settings",
"winConditionScore": "🏆 {n} points",
"winConditionTime": "⏱ {n} min",
"winConditionRounds": "🔄 {n} rounds"
```

### Step 3: Add keys to `ru.json`, `uk.json`, `es.json`

Use the same keys with appropriate translations:

**ru.json:**
- `"winCondition": "Условие победы"`, `"winScore": "Очки"`, `"winTime": "Время"`, `"winRounds": "Раунды"`, `"minutes": "мин"`, `"rounds": "кол"`
- `"roomSettings": { "title": "Настройки комнаты", "save": "Сохранить" }`
- `"settings": "Настройки"`, `"winConditionScore": "🏆 {n} оч."`, `"winConditionTime": "⏱ {n} мин"`, `"winConditionRounds": "🔄 {n} кол."`

**uk.json:** Similar to Russian.

**es.json:**
- `"winCondition": "Condición de victoria"`, `"winScore": "Puntos"`, `"winTime": "Tiempo"`, `"winRounds": "Rondas"`, `"minutes": "min"`, `"rounds": "rondas"`
- `"roomSettings": { "title": "Configuración de sala", "save": "Guardar cambios" }`
- `"settings": "Configuración"`, `"winConditionScore": "🏆 {n} puntos"`, `"winConditionTime": "⏱ {n} min"`, `"winConditionRounds": "🔄 {n} rondas"`

### Step 4: Commit

```bash
git add packages/frontend/src/i18n/
git commit -m "feat(i18n): add win condition and room settings translations"
```

---

## Task 8: CreateTableModal — Win Condition UI

**Files:**
- Modify: `packages/frontend/src/components/CreateTableModal.vue`

### Step 1: Add reactive state

In `<script setup>`, after `const targetScore = ref(10);`, add:

```typescript
import type { SpecialRule, WinCondition } from '@kpl/shared';

const winCondition = ref<WinCondition>('score');
const targetRounds = ref(20);
const gameTimeLimit = ref(15);
const TIME_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60] as const;
```

### Step 2: Update `emit` type and `submit()`

Update the `emit` type (lines 8-18) to add new fields:

```typescript
const emit = defineEmits<{
  close: [];
  create: [settings: {
    name: string;
    isPublic: boolean;
    selectedSetIds: number[];
    maxPlayers: number;
    targetScore: number;
    specialRules: SpecialRule[];
    winCondition: WinCondition;
    targetRounds: number;
    gameTimeLimit: number;
  }];
}>();
```

In `submit()`, add the new fields to the emitted object:

```typescript
  emit('create', {
    name: name.value.trim(),
    isPublic: isPublic.value,
    selectedSetIds: [selectedSetId.value],
    maxPlayers: maxPlayers.value,
    targetScore: targetScore.value,
    specialRules: selectedRules.value,
    winCondition: winCondition.value,
    targetRounds: targetRounds.value,
    gameTimeLimit: gameTimeLimit.value,
  });
```

### Step 3: Replace score section with win condition UI

In the template, find the "Max players + target score" grid (lines 147-174) and replace entirely with:

```html
<!-- Max players -->
<div>
  <label class="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
    {{ t('createTable.maxPlayers') }}
  </label>
  <input
    v-model.number="maxPlayers"
    type="number" min="3" max="20"
    class="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 transition-colors"
  />
</div>

<!-- Win condition -->
<div>
  <label class="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
    {{ t('createTable.winCondition') }}
  </label>
  <!-- Radio tabs -->
  <div class="flex gap-1 mb-3">
    <button
      v-for="cond in (['score', 'time', 'rounds'] as WinCondition[])"
      :key="cond"
      type="button"
      @click="winCondition = cond"
      :class="[
        'flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all border',
        winCondition === cond
          ? 'bg-white text-black border-white'
          : 'bg-slate-900/60 text-slate-400 border-white/10 hover:border-white/20',
      ]"
    >
      {{ t(`createTable.win${cond.charAt(0).toUpperCase() + cond.slice(1)}`) }}
    </button>
  </div>

  <!-- Score picker -->
  <select
    v-if="winCondition === 'score'"
    v-model.number="targetScore"
    class="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 transition-colors"
  >
    <option v-for="n in TARGET_SCORE_OPTIONS" :key="n" :value="n">
      {{ n }} {{ t('createTable.points') }}
    </option>
  </select>

  <!-- Time slider -->
  <div v-else-if="winCondition === 'time'" class="space-y-2">
    <input
      v-model.number="gameTimeLimit"
      type="range" min="5" max="60" step="5"
      class="w-full accent-white"
    />
    <div class="flex justify-between text-xs text-slate-500">
      <span>5 {{ t('createTable.minutes') }}</span>
      <span class="text-white font-bold">{{ gameTimeLimit }} {{ t('createTable.minutes') }}</span>
      <span>60 {{ t('createTable.minutes') }}</span>
    </div>
  </div>

  <!-- Rounds input -->
  <input
    v-else-if="winCondition === 'rounds'"
    v-model.number="targetRounds"
    type="number" min="5" max="100"
    class="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 transition-colors"
  />
</div>
```

### Step 4: Update `HomeView.vue` (caller of CreateTableModal)

Find where `CreateTableModal` is used (likely `HomeView.vue`) and update the `@create` handler to pass the new fields through to `lobbyStore.createRoom()`.

Check `packages/frontend/src/views/HomeView.vue` — find the `@create` handler and ensure it passes `winCondition`, `targetRounds`, `gameTimeLimit`.

### Step 5: Commit

```bash
git add packages/frontend/src/components/CreateTableModal.vue packages/frontend/src/views/HomeView.vue
git commit -m "feat(frontend): win condition picker in CreateTableModal"
```

---

## Task 9: RoomSettingsModal — New Component

**Files:**
- Create: `packages/frontend/src/components/RoomSettingsModal.vue`

### Step 1: Create the component

The modal should:
- Accept a `room` prop (type `GameRoom`) for pre-filling current values
- Have the same structure as `CreateTableModal` (two-column desktop layout)
- Include: room name, card set selection, max players, win condition, special rules
- Emit `close` and `save` (with full `UpdateSettingsData`)

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import type { GameRoom, SpecialRule, WinCondition } from '@kpl/shared';
import { useLobbyStore } from '../stores/lobbyStore';
import { useRoomStore } from '../stores/roomStore';
import SpecialRulesPanel from './SpecialRulesPanel.vue';

const props = defineProps<{ room: GameRoom }>();
const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const lobbyStore = useLobbyStore();
const roomStore = useRoomStore();

// Pre-fill from current room
const name = ref(props.room.name);
const selectedSetId = ref<number | null>(props.room.selectedSetIds[0] ?? null);
const maxPlayers = ref(props.room.maxPlayers);
const winCondition = ref<WinCondition>(props.room.winCondition ?? 'score');
const targetScore = ref(props.room.targetScore ?? 10);
const targetRounds = ref(props.room.targetRounds ?? 20);
const gameTimeLimit = ref(props.room.gameTimeLimit ?? 15);
const selectedRules = ref<SpecialRule[]>([...props.room.specialRules]);
const step = ref<'main' | 'rules'>('main');
const saving = ref(false);
const errorMsg = ref('');
const fetchError = ref('');

const TARGET_SCORE_OPTIONS = [8, 10, 15, 20, 30] as const;

const isDesktop = () => window.innerWidth >= 768;

async function save() {
  if (!name.value.trim() || selectedSetId.value === null) return;
  saving.value = true;
  errorMsg.value = '';

  const err = await roomStore.updateSettings({
    name: name.value.trim(),
    selectedSetIds: [selectedSetId.value],
    maxPlayers: maxPlayers.value,
    specialRules: selectedRules.value,
    winCondition: winCondition.value,
    targetScore: targetScore.value,
    targetRounds: targetRounds.value,
    gameTimeLimit: gameTimeLimit.value,
  });

  saving.value = false;
  if (err) {
    errorMsg.value = err.error;
  } else {
    emit('close');
  }
}

onMounted(async () => {
  try {
    await lobbyStore.fetchCardSets();
  } catch {
    fetchError.value = t('createTable.fetchError');
  }
});
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      @click.self="$emit('close')"
    >
      <div :class="[
        'bg-[#0d1117] border border-white/10 rounded-2xl w-full max-h-[90vh] overflow-hidden',
        'flex flex-col md:flex-row md:max-w-4xl max-w-md',
      ]">

        <!-- Left column / step 1: main settings -->
        <div v-show="step === 'main' || isDesktop()" class="overflow-y-auto flex-1 min-h-0 md:border-r md:border-white/5">
          <div class="p-6 space-y-5">

            <!-- Header -->
            <div class="flex items-center justify-between">
              <h2 class="text-xl font-black tracking-tighter uppercase italic text-white">
                {{ t('roomSettings.title') }}
              </h2>
              <button @click="$emit('close')" class="text-slate-500 hover:text-white transition-colors p-1">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p v-if="errorMsg" class="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-xl border border-red-500/20">{{ errorMsg }}</p>

            <!-- Table name -->
            <div>
              <label class="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
                {{ t('createTable.tableName') }}
              </label>
              <input
                v-model="name"
                class="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-white/30 transition-colors"
                :placeholder="t('createTable.tableNamePlaceholder')"
              />
            </div>

            <!-- Card sets -->
            <div>
              <p class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
                {{ t('createTable.cardSets') }}
              </p>
              <p v-if="fetchError" class="text-sm text-red-400">{{ fetchError }}</p>
              <div v-else-if="!lobbyStore.cardSetsLoaded" class="text-sm text-slate-600">{{ t('createTable.loadingSets') }}</div>
              <div v-else class="space-y-2">
                <button
                  v-for="set in lobbyStore.cardSets"
                  :key="set.id"
                  type="button"
                  @click="selectedSetId = set.id"
                  :class="[
                    'w-full text-left px-4 py-3 rounded-xl border transition-all',
                    selectedSetId === set.id
                      ? 'bg-white/10 border-white/30 text-white'
                      : 'bg-slate-900/40 border-white/5 text-slate-400 hover:border-white/15 hover:text-slate-300',
                  ]"
                >
                  <div class="flex items-center justify-between">
                    <span class="text-sm font-bold">{{ set.name }}</span>
                    <span class="text-xs text-slate-500 shrink-0 ml-2">
                      {{ set.blackCardCount }} ♠ / {{ set.whiteCardCount }} ♡
                    </span>
                  </div>
                  <p v-if="set.description" class="text-xs text-slate-600 mt-0.5">{{ set.description }}</p>
                </button>
              </div>
            </div>

            <!-- Max players -->
            <div>
              <label class="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
                {{ t('createTable.maxPlayers') }}
              </label>
              <input
                v-model.number="maxPlayers"
                type="number" min="3" max="20"
                class="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 transition-colors"
              />
            </div>

            <!-- Win condition -->
            <div>
              <label class="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
                {{ t('createTable.winCondition') }}
              </label>
              <div class="flex gap-1 mb-3">
                <button
                  v-for="cond in (['score', 'time', 'rounds'] as WinCondition[])"
                  :key="cond"
                  type="button"
                  @click="winCondition = cond"
                  :class="[
                    'flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all border',
                    winCondition === cond
                      ? 'bg-white text-black border-white'
                      : 'bg-slate-900/60 text-slate-400 border-white/10 hover:border-white/20',
                  ]"
                >
                  {{ t(`createTable.win${cond.charAt(0).toUpperCase() + cond.slice(1)}`) }}
                </button>
              </div>
              <select
                v-if="winCondition === 'score'"
                v-model.number="targetScore"
                class="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 transition-colors"
              >
                <option v-for="n in TARGET_SCORE_OPTIONS" :key="n" :value="n">{{ n }} {{ t('createTable.points') }}</option>
              </select>
              <div v-else-if="winCondition === 'time'" class="space-y-2">
                <input v-model.number="gameTimeLimit" type="range" min="5" max="60" step="5" class="w-full accent-white" />
                <div class="flex justify-between text-xs text-slate-500">
                  <span>5 {{ t('createTable.minutes') }}</span>
                  <span class="text-white font-bold">{{ gameTimeLimit }} {{ t('createTable.minutes') }}</span>
                  <span>60 {{ t('createTable.minutes') }}</span>
                </div>
              </div>
              <input
                v-else-if="winCondition === 'rounds'"
                v-model.number="targetRounds"
                type="number" min="5" max="100"
                class="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 transition-colors"
              />
            </div>

            <!-- House Rules button (mobile only) -->
            <button
              type="button"
              class="md:hidden w-full text-left px-4 py-3 bg-slate-900/40 border border-white/10 rounded-xl text-slate-300 text-sm font-bold flex items-center justify-between hover:border-white/20 transition-colors"
              @click="step = 'rules'"
            >
              <span>{{ t('specialRules.button') }}</span>
              <div class="flex items-center gap-2">
                <span v-if="selectedRules.length > 0" class="bg-yellow-400 text-black text-xs font-black px-2 py-0.5 rounded-full">
                  {{ selectedRules.length }}
                </span>
                <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>

            <!-- Actions -->
            <div class="flex gap-3 pt-1">
              <button
                @click="$emit('close')"
                class="flex-1 py-3.5 bg-slate-800 border border-white/10 text-slate-300 text-sm font-black uppercase tracking-widest rounded-2xl active:scale-95 transition-all"
              >
                {{ t('common.cancel') }}
              </button>
              <button
                @click="save"
                :disabled="saving || !name.trim() || selectedSetId === null"
                class="flex-1 py-3.5 bg-white text-black text-sm font-black uppercase tracking-widest rounded-2xl shadow-[0_4px_0_rgb(60,60,60)] active:shadow-none active:translate-y-1 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {{ saving ? t('common.loading') : t('roomSettings.save') }}
              </button>
            </div>

          </div>
        </div>

        <!-- Right column / step 2: House Rules -->
        <div v-show="step === 'rules' || isDesktop()" class="overflow-y-auto flex-1 min-h-0">
          <div class="p-6">
            <div class="flex items-center gap-3 mb-4 md:hidden">
              <button @click="step = 'main'" class="text-slate-500 hover:text-white transition-colors p-1">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h3 class="text-sm font-black uppercase tracking-[0.15em] text-slate-400">{{ t('specialRules.button') }}</h3>
            </div>
            <h3 class="hidden md:block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-4">{{ t('specialRules.button') }}</h3>
            <SpecialRulesPanel v-model="selectedRules" />
          </div>
        </div>

      </div>
    </div>
  </Teleport>
</template>
```

### Step 2: Commit

```bash
git add packages/frontend/src/components/RoomSettingsModal.vue
git commit -m "feat(frontend): RoomSettingsModal component for host"
```

---

## Task 10: LobbyPanel — Settings Button and Win Condition Display

**Files:**
- Modify: `packages/frontend/src/components/LobbyPanel.vue`

### Step 1: Add imports and state

In `<script setup>`, add:

```typescript
import RoomSettingsModal from './RoomSettingsModal.vue';

const showSettings = ref(false);
```

Add computed for win condition display label:

```typescript
const winConditionLabel = computed(() => {
  const room = props.room;
  switch (room.winCondition ?? 'score') {
    case 'score': return t('lobby.winConditionScore', { n: room.targetScore });
    case 'time': return t('lobby.winConditionTime', { n: room.gameTimeLimit });
    case 'rounds': return t('lobby.winConditionRounds', { n: room.targetRounds });
  }
});
```

### Step 2: Add win condition chip and settings button to template

In the template, after the header section (room name + invite link, ending around line 48), before the special rules chips, add:

```html
<!-- Win condition chip -->
<div class="flex items-center justify-between pb-4 border-b border-white/5">
  <span class="text-xs font-bold text-slate-400">{{ winConditionLabel }}</span>
  <button
    v-if="roomStore.isHost"
    @click="showSettings = true"
    class="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 hover:text-white transition-colors px-3 py-1.5 rounded-xl border border-white/10 hover:border-white/20"
  >
    {{ t('lobby.settings') }}
  </button>
</div>
```

### Step 3: Add modal to template

Before the closing `</template>` tag, add:

```html
<RoomSettingsModal
  v-if="showSettings"
  :room="props.room"
  @close="showSettings = false"
/>
```

### Step 4: Verify the bottom bar in LobbyPanel

The current bottom bar has a single "Start Game" button for host and "Waiting for host" for others. This layout is fine — no changes needed there, the settings button is inline with the room header.

### Step 5: Run the app and test manually

```bash
npm run dev:backend &
npm run dev:frontend
```

Verify:
1. Creating a room with Score/Time/Rounds works
2. Host in lobby sees win condition chip + settings button
3. Settings modal opens, shows current values, can save changes
4. Game ends correctly after hitting the chosen condition

### Step 6: Run all tests

```bash
npm test --workspace=packages/backend 2>&1 | tail -10
```

Expected: 74+ tests pass.

### Step 7: Commit

```bash
git add packages/frontend/src/components/LobbyPanel.vue
git commit -m "feat(frontend): win condition chip and settings button in LobbyPanel"
```

---

## Summary

| Task | Commit | Files touched |
|---|---|---|
| 1 | shared types | `shared/src/index.ts` |
| 2 | backend validation | `validation.ts` |
| 3 | RoomManager createRoom | `RoomManager.ts`, `RoomManager.test.ts` |
| 4 | RoomManager updateSettings+startGame | `RoomManager.ts`, `RoomManager.test.ts` |
| 5 | gameHandlers win condition | `gameHandlers.ts` |
| 6 | frontend stores | `lobbyStore.ts`, `roomStore.ts` |
| 7 | i18n | 5 locale JSON files |
| 8 | CreateTableModal UI | `CreateTableModal.vue`, `HomeView.vue` |
| 9 | RoomSettingsModal | `RoomSettingsModal.vue` (new) |
| 10 | LobbyPanel | `LobbyPanel.vue` |
