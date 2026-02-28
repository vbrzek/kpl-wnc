# UX Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Three UX improvements — active game recovery on home page, room preview before joining, and Card Czar identity display during play.

**Architecture:**
- New REST endpoint `GET /api/rooms/:code/preview` provides room snapshot without socket join.
- Frontend HomeView detects localStorage tokens, validates against server, shows active games and preview modal.
- CzarBadge atom component added below the black card in all game phase layouts.

**Tech Stack:** Fastify 5 (backend route), Vue 3 Composition API + Pinia + vue-i18n (frontend), Vitest (tests).

---

## Task 1: Backend — rooms preview route

**Files:**
- Create: `packages/backend/src/routes/rooms.ts`
- Create: `packages/backend/src/routes/rooms.test.ts`
- Modify: `packages/backend/src/index.ts`

**Step 1: Write the failing test**

Create `packages/backend/src/routes/rooms.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import roomsRoutes from './rooms.js';

vi.mock('../game/RoomManager.js', () => ({
  roomManager: {
    getRoom: vi.fn(),
  },
}));

import { roomManager } from '../game/RoomManager.js';

describe('GET /api/rooms/:code/preview', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.resetAllMocks();
    app = Fastify({ logger: false });
    await app.register(roomsRoutes, { prefix: '/api' });
    await app.ready();
  });

  it('returns 404 when room not found', async () => {
    (roomManager.getRoom as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const res = await app.inject({ method: 'GET', url: '/api/rooms/abc123/preview' });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'Room not found' });
  });

  it('returns preview shape when room exists', async () => {
    (roomManager.getRoom as ReturnType<typeof vi.fn>).mockReturnValue({
      code: 'abc123',
      name: 'Test Room',
      status: 'LOBBY',
      maxPlayers: 6,
      selectedSetIds: [1, 2],
      players: [
        { nickname: 'Alice', isAfk: false },
        { nickname: 'Bob', isAfk: true },
      ],
    });
    const res = await app.inject({ method: 'GET', url: '/api/rooms/abc123/preview' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toEqual({
      code: 'abc123',
      name: 'Test Room',
      status: 'LOBBY',
      playerCount: 2,
      maxPlayers: 6,
      selectedSetIds: [1, 2],
      players: [
        { nickname: 'Alice', isAfk: false },
        { nickname: 'Bob', isAfk: true },
      ],
    });
  });

  it('normalises code to uppercase before lookup', async () => {
    (roomManager.getRoom as ReturnType<typeof vi.fn>).mockReturnValue(null);
    await app.inject({ method: 'GET', url: '/api/rooms/ABC123/preview' });
    expect(roomManager.getRoom).toHaveBeenCalledWith('ABC123');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test --workspace=packages/backend
```
Expected: FAIL — `rooms.js` does not exist yet.

**Step 3: Implement the route**

Create `packages/backend/src/routes/rooms.ts`:

```typescript
import type { FastifyPluginAsync } from 'fastify';
import { roomManager } from '../game/RoomManager.js';

const roomsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/rooms/:code/preview', async (request, reply) => {
    const { code } = request.params as { code: string };
    const room = roomManager.getRoom(code.toUpperCase());
    if (!room) {
      return reply.status(404).send({ error: 'Room not found' });
    }
    return {
      code: room.code,
      name: room.name,
      status: room.status,
      playerCount: room.players.length,
      maxPlayers: room.maxPlayers,
      players: room.players.map(p => ({ nickname: p.nickname, isAfk: p.isAfk })),
      selectedSetIds: room.selectedSetIds,
    };
  });
};

export default roomsRoutes;
```

**Step 4: Register route in index.ts**

In `packages/backend/src/index.ts`, after the existing `await app.register(cardTranslationsRoute, ...)` line, add:

```typescript
import roomsRoutes from './routes/rooms.js';
// ...
await app.register(roomsRoutes, { prefix: '/api' });
```

**Step 5: Run tests to verify they pass**

```bash
npm test --workspace=packages/backend
```
Expected: all tests pass (57 existing + 3 new).

**Step 6: Commit**

```bash
git add packages/backend/src/routes/rooms.ts packages/backend/src/routes/rooms.test.ts packages/backend/src/index.ts
git commit -m "feat: add GET /api/rooms/:code/preview endpoint"
```

---

## Task 2: i18n — new keys for all 5 locales

**Files:**
- Modify: `packages/frontend/src/i18n/locales/cs.json`
- Modify: `packages/frontend/src/i18n/locales/en.json`
- Modify: `packages/frontend/src/i18n/locales/ru.json`
- Modify: `packages/frontend/src/i18n/locales/uk.json`
- Modify: `packages/frontend/src/i18n/locales/es.json`

**Step 1: Add keys to cs.json**

In the `"home"` section add:
```json
"activeRooms": "Tvoje hry"
```

In the `"game.czar"` section add:
```json
"youAreCzar": "Ty jsi karetní král",
"willPick": "{name} vybere vítěze"
```

Add a new top-level `"roomPreview"` section:
```json
"roomPreview": {
  "join": "Přisednout",
  "back": "Zpět",
  "players": "Hráči ({current}/{max})",
  "cardSets": "Sady karet",
  "inLobby": "Lobby",
  "inGame": "Ve hře",
  "finished": "Skončeno"
}
```

**Step 2: Add keys to en.json**

`"home.activeRooms"`: `"Your games"`

`"game.czar"` additions:
```json
"youAreCzar": "You are the Card Czar",
"willPick": "{name} will pick the winner"
```

New `"roomPreview"`:
```json
"roomPreview": {
  "join": "Take a seat",
  "back": "Back",
  "players": "Players ({current}/{max})",
  "cardSets": "Card sets",
  "inLobby": "Lobby",
  "inGame": "In game",
  "finished": "Finished"
}
```

**Step 3: Add keys to ru.json**

`"home.activeRooms"`: `"Ваши игры"`

`"game.czar"` additions:
```json
"youAreCzar": "Ты — Карточный Король",
"willPick": "{name} выберет победителя"
```

New `"roomPreview"`:
```json
"roomPreview": {
  "join": "Присоединиться",
  "back": "Назад",
  "players": "Игроки ({current}/{max})",
  "cardSets": "Наборы карт",
  "inLobby": "Лобби",
  "inGame": "В игре",
  "finished": "Завершено"
}
```

**Step 4: Add keys to uk.json**

`"home.activeRooms"`: `"Ваші ігри"`

`"game.czar"` additions:
```json
"youAreCzar": "Ти — Карт-Цар",
"willPick": "{name} обере переможця"
```

New `"roomPreview"`:
```json
"roomPreview": {
  "join": "Приєднатися",
  "back": "Назад",
  "players": "Гравці ({current}/{max})",
  "cardSets": "Набори карт",
  "inLobby": "Лобі",
  "inGame": "В грі",
  "finished": "Завершено"
}
```

**Step 5: Add keys to es.json**

`"home.activeRooms"`: `"Tus partidas"`

`"game.czar"` additions:
```json
"youAreCzar": "Eres el Zar de cartas",
"willPick": "{name} elegirá al ganador"
```

New `"roomPreview"`:
```json
"roomPreview": {
  "join": "Sentarse",
  "back": "Volver",
  "players": "Jugadores ({current}/{max})",
  "cardSets": "Mazos",
  "inLobby": "Sala",
  "inGame": "En juego",
  "finished": "Terminado"
}
```

**Step 6: Commit**

```bash
git add packages/frontend/src/i18n/locales/
git commit -m "feat: add i18n keys for active rooms, czar badge, room preview"
```

---

## Task 3: CzarBadge atom component

**Files:**
- Create: `packages/frontend/src/components/game/atoms/CzarBadge.vue`

**Step 1: Create the component**

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  czarNickname: string;
  isMe: boolean;
}>();

const { t } = useI18n();
</script>

<template>
  <div class="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-3 py-2 text-xs font-bold">
    <span>👑</span>
    <span class="text-yellow-400">
      {{ isMe ? t('game.czar.youAreCzar') : t('game.czar.willPick', { name: czarNickname }) }}
    </span>
  </div>
</template>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/game/atoms/CzarBadge.vue
git commit -m "feat: add CzarBadge atom component"
```

---

## Task 4: Wire CzarBadge into game layouts

The two parent components (`SelectionPhase.vue`, `JudgingPhase.vue`) compute the czar's nickname and pass it down.
The five layout components receive the prop and render `CzarBadge`.

**Files:**
- Modify: `packages/frontend/src/components/SelectionPhase.vue`
- Modify: `packages/frontend/src/components/JudgingPhase.vue`
- Modify: `packages/frontend/src/components/game/layouts/PlayerSelectingLayout.vue`
- Modify: `packages/frontend/src/components/game/layouts/PlayerSubmittedLayout.vue`
- Modify: `packages/frontend/src/components/game/layouts/CzarWaitingSelectionLayout.vue`
- Modify: `packages/frontend/src/components/game/layouts/WaitingForCzarLayout.vue`
- Modify: `packages/frontend/src/components/game/layouts/CzarJudgingLayout.vue`

**Step 1: Update SelectionPhase.vue**

Add the computed `czarNickname` and pass it to all three child layouts:

In `<script setup>`, add after existing computed properties:
```typescript
const czarNickname = computed(() =>
  roomStore.room?.players.find(p => p.id === roomStore.czarId)?.nickname ?? ''
);
```

In `<template>`, add `:czarNickname="czarNickname"` to each layout:
- `<CzarWaitingSelectionLayout ... :czarNickname="czarNickname" />`
- `<PlayerSubmittedLayout ... :czarNickname="czarNickname" />`
- `<PlayerSelectingLayout ... :czarNickname="czarNickname" />`

**Step 2: Update JudgingPhase.vue**

Same computed, passed to both child layouts:
```typescript
const czarNickname = computed(() =>
  roomStore.room?.players.find(p => p.id === roomStore.czarId)?.nickname ?? ''
);
```

- `<CzarJudgingLayout ... :czarNickname="czarNickname" />`
- `<WaitingForCzarLayout ... :czarNickname="czarNickname" />`

**Step 3: Update PlayerSelectingLayout.vue**

Add `czarNickname: string` to `defineProps`. Import and place `CzarBadge` below `<BlackCardAtom>`:

```vue
import CzarBadge from '../atoms/CzarBadge.vue'

// in defineProps:
czarNickname: string

// in template, right after <BlackCardAtom .../>:
<CzarBadge :czarNickname="czarNickname" :isMe="false" />
```

**Step 4: Update PlayerSubmittedLayout.vue**

Same as above — add `czarNickname: string` prop. Since this layout doesn't show a black card, place `CzarBadge` at the top of the center content area (before the `<h2>`):

```vue
import CzarBadge from '../atoms/CzarBadge.vue'

// in defineProps:
czarNickname: string

// in template, inside the flex-1 center div, as first child:
<CzarBadge :czarNickname="czarNickname" :isMe="false" class="mb-6" />
```

**Step 5: Update CzarWaitingSelectionLayout.vue**

Add `czarNickname: string` prop (though czar doesn't need the name, we pass it for consistency). Place `CzarBadge` with `isMe=true` below `<BlackCardAtom>`:

```vue
import CzarBadge from '../atoms/CzarBadge.vue'

// in defineProps:
czarNickname: string

// in template, right after <BlackCardAtom .../>:
<CzarBadge czarNickname="" :isMe="true" />
```

**Step 6: Update WaitingForCzarLayout.vue**

Add `czarNickname: string` prop. Replace the generic yellow indicator text with `CzarBadge`:

```vue
import CzarBadge from '../atoms/CzarBadge.vue'

// in defineProps:
czarNickname: string

// in template, replace the entire indicator div (the bg-white/5 rounded-2xl block) with:
<CzarBadge :czarNickname="czarNickname" :isMe="false" />
```

The indicator div to remove/replace is:
```html
<div class="flex items-center justify-between bg-white/5 rounded-2xl px-4 py-3 border border-white/5">
  ...
</div>
```

**Step 7: Update CzarJudgingLayout.vue**

Add `czarNickname: string` prop. Place `CzarBadge` with `isMe=true` after `<BlackCardAtom>`:

```vue
import CzarBadge from '../atoms/CzarBadge.vue'

// in defineProps:
czarNickname: string

// in template, right after <BlackCardAtom .../>:
<CzarBadge czarNickname="" :isMe="true" />
```

**Step 8: Commit**

```bash
git add packages/frontend/src/components/SelectionPhase.vue \
        packages/frontend/src/components/JudgingPhase.vue \
        packages/frontend/src/components/game/layouts/
git commit -m "feat: show Card Czar identity in all game phase layouts"
```

---

## Task 5: RoomPreviewModal component

**Files:**
- Create: `packages/frontend/src/components/RoomPreviewModal.vue`

The modal receives a `preview` object of type `RoomPreview` (defined below) and emits `join` and `close`.

**Step 1: Define the RoomPreview type**

This type lives in `lobbyStore.ts` since it's frontend-only. Add after `CardSetSummary`:

```typescript
export interface RoomPreview {
  code: string;
  name: string;
  status: string;
  playerCount: number;
  maxPlayers: number;
  players: { nickname: string; isAfk: boolean }[];
  selectedSetIds: number[];
}
```

Also add a helper function `fetchRoomPreview`:

```typescript
export async function fetchRoomPreview(code: string): Promise<RoomPreview | null> {
  const backendUrl = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';
  const res = await fetch(`${backendUrl}/api/rooms/${code}/preview`);
  if (!res.ok) return null;
  return res.json() as Promise<RoomPreview>;
}
```

**Step 2: Create RoomPreviewModal.vue**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLobbyStore } from '../stores/lobbyStore';
import type { RoomPreview } from '../stores/lobbyStore';

const props = defineProps<{ preview: RoomPreview }>();
const emit = defineEmits<{ join: []; close: [] }>();

const { t } = useI18n();
const lobbyStore = useLobbyStore();

const statusLabel = computed(() => {
  if (props.preview.status === 'LOBBY') return t('roomPreview.inLobby');
  if (props.preview.status === 'FINISHED') return t('roomPreview.finished');
  return t('roomPreview.inGame');
});

const statusColor = computed(() => {
  if (props.preview.status === 'LOBBY') return 'text-slate-400 bg-slate-800 border-white/10';
  if (props.preview.status === 'FINISHED') return 'text-gray-500 bg-slate-900 border-white/5';
  return 'text-green-400 bg-green-500/10 border-green-500/20';
});

const setNames = computed(() =>
  props.preview.selectedSetIds
    .map(id => lobbyStore.cardSets.find(s => s.id === id)?.name)
    .filter(Boolean)
    .join(', ')
);

const isFull = computed(() => props.preview.playerCount >= props.preview.maxPlayers);
</script>

<template>
  <!-- Backdrop -->
  <div
    class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center"
    @click.self="emit('close')"
  >
    <!-- Sheet -->
    <div class="bg-[#0d1117] border border-white/10 rounded-t-3xl w-full max-w-lg p-6 pb-[max(24px,env(safe-area-inset-bottom))]">

      <!-- Header -->
      <div class="flex items-start justify-between mb-5">
        <div>
          <h2 class="text-2xl font-black tracking-tighter uppercase italic text-white leading-none">
            {{ preview.name }}
          </h2>
          <div class="flex items-center gap-2 mt-1.5">
            <code class="font-mono text-[11px] text-slate-500">#{{ preview.code }}</code>
            <span class="w-1 h-1 bg-slate-700 rounded-full"></span>
            <span :class="['text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg border', statusColor]">
              {{ statusLabel }}
            </span>
          </div>
        </div>
        <button @click="emit('close')" class="text-slate-500 hover:text-white transition-colors p-1">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Card sets -->
      <div v-if="setNames" class="mb-4">
        <p class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1.5">
          {{ t('roomPreview.cardSets') }}
        </p>
        <p class="text-sm font-bold text-slate-300">{{ setNames }}</p>
      </div>

      <!-- Players -->
      <div class="mb-6">
        <p class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
          {{ t('roomPreview.players', { current: preview.playerCount, max: preview.maxPlayers }) }}
        </p>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="player in preview.players"
            :key="player.nickname"
            :class="[
              'text-xs font-bold px-2.5 py-1 rounded-lg border',
              player.isAfk
                ? 'text-slate-500 bg-slate-900 border-white/5'
                : 'text-slate-200 bg-slate-800 border-white/10'
            ]"
          >
            {{ player.nickname }}
            <span v-if="player.isAfk" class="text-[10px] text-slate-600 ml-1">AFK</span>
          </span>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex gap-3">
        <button
          @click="emit('close')"
          class="flex-1 py-3.5 bg-slate-800 border border-white/10 text-slate-300 text-sm font-black uppercase tracking-widest rounded-2xl active:scale-95 transition-all"
        >
          {{ t('roomPreview.back') }}
        </button>
        <button
          @click="emit('join')"
          :disabled="isFull"
          class="flex-1 py-3.5 bg-white text-black text-sm font-black uppercase tracking-widest rounded-2xl shadow-[0_4px_0_rgb(200,200,200)] active:shadow-none active:translate-y-1 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {{ t('roomPreview.join') }}
        </button>
      </div>
    </div>
  </div>
</template>
```

**Step 3: Commit**

```bash
git add packages/frontend/src/stores/lobbyStore.ts \
        packages/frontend/src/components/RoomPreviewModal.vue
git commit -m "feat: add RoomPreviewModal and fetchRoomPreview helper"
```

---

## Task 6: HomeView — active games section

Detect existing `playerToken_*` keys in localStorage, fetch preview for each, show a section before public rooms.

**Files:**
- Modify: `packages/frontend/src/views/HomeView.vue`

**Step 1: Add active games logic to HomeView.vue**

In `<script setup>`, add imports:
```typescript
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { fetchRoomPreview, type RoomPreview } from '../stores/lobbyStore';
import RoomPreviewModal from '../components/RoomPreviewModal.vue';
```

Add new refs and a function:
```typescript
const activeRooms = ref<RoomPreview[]>([]);
const previewRoom = ref<RoomPreview | null>(null);
const previewLoading = ref(false);

async function loadActiveRooms() {
  const codes: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('playerToken_')) {
      codes.push(key.replace('playerToken_', ''));
    }
  }
  if (!codes.length) return;
  const results = await Promise.all(codes.map(code => fetchRoomPreview(code)));
  results.forEach((preview, i) => {
    if (preview === null) {
      localStorage.removeItem(`playerToken_${codes[i]}`);
    }
  });
  activeRooms.value = results.filter((r): r is RoomPreview => r !== null);
}

async function openPreview(code: string) {
  previewLoading.value = true;
  const preview = await fetchRoomPreview(code);
  previewLoading.value = false;
  if (!preview) {
    errorMsg.value = 'Stůl nebyl nalezen.';
    return;
  }
  previewRoom.value = preview;
}

function onConfirmJoin() {
  if (!previewRoom.value) return;
  const code = previewRoom.value.code;
  previewRoom.value = null;
  router.push(`/room/${code}`);
}
```

Update `onMounted` to also call `loadActiveRooms()`:
```typescript
onMounted(() => {
  lobbyStore.subscribe();
  lobbyStore.fetchCardSets();   // needed for card set names in RoomPreviewModal
  loadActiveRooms();
  if (route.query.error) {
    errorMsg.value = route.query.error as string;
  }
});
```

Change `onJoinPublic` to use the preview flow instead of immediate join:
```typescript
async function onJoinPublic(code: string) {
  await openPreview(code);
}
```

Change `onJoinPrivate` to use preview flow:
```typescript
async function onJoinPrivate(code: string) {
  await openPreview(code);
}
```

Remove the old `onJoinPublic` logic that called `lobbyStore.joinRoom` and set roomStore state (that's now handled by RoomView on mount).

**Step 2: Add active games UI section**

In `<template>`, between the error message and the buttons grid, add the active rooms section (shown only when `activeRooms.length > 0`):

```html
<!-- Active games section -->
<div v-if="activeRooms.length > 0" class="mb-8">
  <div class="flex items-center justify-between mb-3 px-2">
    <h2 class="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-500">
      {{ t('home.activeRooms') }}
    </h2>
    <span class="w-2 h-2 bg-yellow-500 rounded-full shadow-[0_0_8px_rgba(234,179,8,0.6)]"></span>
  </div>
  <ul class="grid grid-cols-1 gap-3">
    <li
      v-for="room in activeRooms"
      :key="room.code"
      @click="openPreview(room.code)"
      class="group bg-slate-900/40 border border-yellow-500/10 hover:border-yellow-500/30 rounded-2xl transition-all cursor-pointer overflow-hidden"
    >
      <div class="flex items-center justify-between p-4">
        <div>
          <h3 class="font-black text-white text-base tracking-tight group-hover:text-yellow-500 transition-colors">
            {{ room.name }}
          </h3>
          <span class="font-mono text-[10px] text-slate-500">#{{ room.code }}</span>
        </div>
        <div class="flex flex-col items-end gap-1">
          <span class="text-sm font-black" :class="room.playerCount >= room.maxPlayers ? 'text-red-500' : 'text-slate-300'">
            {{ room.playerCount }}/{{ room.maxPlayers }}
          </span>
        </div>
      </div>
    </li>
  </ul>
</div>
```

Add the preview modal and loading state:

```html
<!-- Preview modal -->
<RoomPreviewModal
  v-if="previewRoom"
  :preview="previewRoom"
  @join="onConfirmJoin"
  @close="previewRoom = null"
/>

<!-- Loading indicator (optional, shown briefly while fetching) -->
<div v-if="previewLoading" class="fixed inset-0 bg-black/40 z-40 flex items-center justify-center">
  <div class="text-white text-sm font-black uppercase tracking-widest animate-pulse">
    {{ t('common.loading') }}
  </div>
</div>
```

**Step 3: Commit**

```bash
git add packages/frontend/src/views/HomeView.vue
git commit -m "feat: show active games on home page and preview modal before joining"
```

---

## Task 7: Update PublicRoomsList to emit preview code

Currently `PublicRoomsList` emits `join` with code directly. Change to emit `preview` (same payload — just a rename for clarity).

**Files:**
- Modify: `packages/frontend/src/components/PublicRoomsList.vue`

**Step 1: Change emit name in PublicRoomsList.vue**

Change:
```typescript
const emit = defineEmits<{ join: [code: string] }>();
```
To:
```typescript
const emit = defineEmits<{ preview: [code: string] }>();
```

In the template button:
```html
@click="emit('preview', room.code)"
```

**Step 2: Update HomeView template to use new emit name**

In `HomeView.vue` template, change:
```html
<PublicRoomsList :rooms="lobbyStore.publicRooms" @join="onJoinPublic" />
```
To:
```html
<PublicRoomsList :rooms="lobbyStore.publicRooms" @preview="onJoinPublic" />
```

(The handler `onJoinPublic` already calls `openPreview` after Task 6.)

**Step 3: Commit**

```bash
git add packages/frontend/src/components/PublicRoomsList.vue \
        packages/frontend/src/views/HomeView.vue
git commit -m "refactor: PublicRoomsList emits preview instead of join"
```

---

## Verification

After all tasks, manually test:

1. **Active games**: Navigate to home page with a `playerToken_*` in localStorage → section "Tvoje hry" appears with the room card. Token for expired room disappears from localStorage.

2. **Preview before joining**: Click any public room card → preview modal appears with player list and card sets, without joining. Click "Přisednout" → navigates to room and joins. Click "Zpět" → closes modal.

3. **Card Czar badge**: During SELECTION phase as a regular player → yellow badge below black card shows czar's name. During JUDGING phase → badge shows czar name (or "Ty jsi karetní král" if you're czar). During SELECTION as czar → badge shows "Ty jsi karetní král".

Run backend tests:
```bash
npm test --workspace=packages/backend
```
Expected: all tests pass.
