# Trophy System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** OAuth hráči získávají pohárky za umístění v ukončených hrách (≥10 kol); pohárky se kumulují v DB a zobrazují se na herní obrazovce i v hlavičce.

**Architecture:** Nová tabulka `user_trophies` drží kumulativní součet. `trophyService.ts` počítá a zapisuje pohárky fire-and-forget po `finishGame()`. Backend emituje `game:trophiesAwarded` socket event. Frontend zobrazuje delta v `FinishedPhase.vue` a celkový součet v `AppHeader.vue`.

**Tech Stack:** Knex (migrace), Vitest (testy), TypeScript, Vue 3 + Pinia (frontend).

---

### Task 1: DB migrace — tabulka `user_trophies`

**Files:**
- Create: `packages/backend/src/db/migrations/20260315100000_user_trophies.ts`

**Step 1: Vytvoř migrační soubor**

```typescript
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('user_trophies', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.integer('trophies').notNullable().defaultTo(0);
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.unique(['user_id']);
    table.foreign('user_id').references('users.id').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('user_trophies');
}
```

**Step 2: Spusť migraci**

```bash
npm run migrate --workspace=packages/backend
```

Expected: `Batch 5 run: 1 migrations`

**Step 3: Commit**

```bash
git add packages/backend/src/db/migrations/20260315100000_user_trophies.ts
git commit -m "feat: add user_trophies migration"
```

---

### Task 2: `trophyService.ts` — výpočetní logika (TDD)

**Files:**
- Create: `packages/backend/src/game/trophyService.ts`
- Create: `packages/backend/src/game/trophyService.test.ts`

**Step 1: Napiš failing testy**

```typescript
// packages/backend/src/game/trophyService.test.ts
import { describe, it, expect } from 'vitest';
import { calculateTrophies } from './trophyService.js';
import type { GameOverPayload } from '@kpl/shared';

function makePayload(scores: Array<{ id: string; score: number; rank: number }>): GameOverPayload {
  return {
    roomCode: 'TEST01',
    finalScores: scores.map(s => ({
      playerId: s.id,
      nickname: s.id,
      avatarUrl: null,
      score: s.score,
      rank: s.rank,
    })),
  };
}

describe('calculateTrophies', () => {
  it('returns empty object when rounds < 10', () => {
    const payload = makePayload([
      { id: 'a', score: 5, rank: 1 },
      { id: 'b', score: 3, rank: 2 },
      { id: 'c', score: 1, rank: 3 },
    ]);
    expect(calculateTrophies(payload, 9)).toEqual({});
  });

  it('4+ hráčů: 5/3/1 pohárky za 1./2./3. místo', () => {
    const payload = makePayload([
      { id: 'a', score: 8, rank: 1 },
      { id: 'b', score: 5, rank: 2 },
      { id: 'c', score: 3, rank: 3 },
      { id: 'd', score: 1, rank: 4 },
    ]);
    const result = calculateTrophies(payload, 10);
    expect(result).toEqual({ a: 5, b: 3, c: 1, d: 0 });
  });

  it('3 hráči: 5/1/0 pohárky za 1./2./3. místo', () => {
    const payload = makePayload([
      { id: 'a', score: 8, rank: 1 },
      { id: 'b', score: 5, rank: 2 },
      { id: 'c', score: 3, rank: 3 },
    ]);
    const result = calculateTrophies(payload, 10);
    expect(result).toEqual({ a: 5, b: 1, c: 0 });
  });

  it('remíza na 1. místě (4+ hráčů): průměr(5,3)=4 zaokrouhleno dolů', () => {
    const payload = makePayload([
      { id: 'a', score: 8, rank: 1 },
      { id: 'b', score: 8, rank: 1 },
      { id: 'c', score: 3, rank: 3 },
      { id: 'd', score: 1, rank: 4 },
    ]);
    const result = calculateTrophies(payload, 10);
    expect(result).toEqual({ a: 4, b: 4, c: 1, d: 0 });
  });

  it('remíza na 2./3. místě (4+ hráčů): průměr(3,1)=2', () => {
    const payload = makePayload([
      { id: 'a', score: 8, rank: 1 },
      { id: 'b', score: 5, rank: 2 },
      { id: 'c', score: 5, rank: 2 },
      { id: 'd', score: 1, rank: 4 },
    ]);
    const result = calculateTrophies(payload, 10);
    expect(result).toEqual({ a: 5, b: 2, c: 2, d: 0 });
  });

  it('remíza na 2./3. místě (3 hráči): průměr(1,0)=0', () => {
    const payload = makePayload([
      { id: 'a', score: 8, rank: 1 },
      { id: 'b', score: 5, rank: 2 },
      { id: 'c', score: 5, rank: 2 },
    ]);
    const result = calculateTrophies(payload, 10);
    expect(result).toEqual({ a: 5, b: 0, c: 0 });
  });

  it('hráči na 4.+ místě dostávají 0 (4+ hráčů)', () => {
    const payload = makePayload([
      { id: 'a', score: 8, rank: 1 },
      { id: 'b', score: 5, rank: 2 },
      { id: 'c', score: 3, rank: 3 },
      { id: 'd', score: 1, rank: 4 },
      { id: 'e', score: 0, rank: 5 },
    ]);
    const result = calculateTrophies(payload, 15);
    expect(result['d']).toBe(0);
    expect(result['e']).toBe(0);
  });
});
```

**Step 2: Ověř, že testy failují**

```bash
npm test --workspace=packages/backend -- --reporter=verbose 2>&1 | grep -E "FAIL|trophyService"
```

Expected: FAIL — cannot find module `./trophyService.js`

**Step 3: Implementuj `calculateTrophies` + `awardTrophies`**

```typescript
// packages/backend/src/game/trophyService.ts
import type { GameOverPayload } from '@kpl/shared';
import { db } from '../db/index.js';

/**
 * Tabulka pohárků pro daný rank.
 * Klíč = počet hráčů (3 nebo 4+), hodnota = pole pohárků indexované rankem (rank - 1).
 * Index 0 = 1. místo, index 1 = 2. místo, index 2 = 3. místo, index 3+ = 0
 */
const TROPHY_TABLE: Record<'3' | '4plus', number[]> = {
  '3':     [5, 1, 0],
  '4plus': [5, 3, 1],
};

export function calculateTrophies(
  payload: GameOverPayload,
  roundNumber: number,
): Record<string, number> {
  if (roundNumber < 10) return {};

  const n = payload.finalScores.length;
  const table = n === 3 ? TROPHY_TABLE['3'] : TROPHY_TABLE['4plus'];

  // Skupiny hráčů podle ranku (pro výpočet remíz)
  const byRank = new Map<number, string[]>();
  for (const entry of payload.finalScores) {
    const group = byRank.get(entry.rank) ?? [];
    group.push(entry.playerId);
    byRank.set(entry.rank, group);
  }

  const result: Record<string, number> = {};

  // Inicializuj všechny hráče na 0
  for (const entry of payload.finalScores) {
    result[entry.playerId] = 0;
  }

  // Přiděluj pohárky po skupinách (remízy)
  for (const [rank, playerIds] of byRank.entries()) {
    // Sbírám pohárky za všechny obsazené pozice touto skupinou
    let totalTrophies = 0;
    for (let i = 0; i < playerIds.length; i++) {
      const pos = rank - 1 + i; // 0-indexed pozice
      totalTrophies += table[pos] ?? 0;
    }
    const each = Math.floor(totalTrophies / playerIds.length);
    for (const pid of playerIds) {
      result[pid] = each;
    }
  }

  return result;
}

export async function awardTrophies(
  payload: GameOverPayload,
  roundNumber: number,
  playerTokenMap: Map<string, string>, // playerId -> playerToken
): Promise<Record<string, number>> {
  const trophies = calculateTrophies(payload, roundNumber);
  if (Object.keys(trophies).length === 0) return {};

  // Lookup user_id pro každý playerToken přes user_player_tokens
  const tokens = [...playerTokenMap.values()];
  if (tokens.length === 0) return {};

  const rows = await db('user_player_tokens')
    .whereIn('player_token', tokens)
    .select('user_id', 'player_token');

  const tokenToUserId = new Map<string, number>(
    rows.map((r: { user_id: number; player_token: string }) => [r.player_token, r.user_id])
  );

  // Přidel pohárky OAuth hráčům
  const awarded: Record<string, number> = {};
  for (const [playerId, token] of playerTokenMap.entries()) {
    const userId = tokenToUserId.get(token);
    if (!userId) continue; // anonymní hráč, přeskočit
    const count = trophies[playerId] ?? 0;
    if (count === 0) continue; // nic nepřidáváme
    await db('user_trophies')
      .insert({ user_id: userId, trophies: count })
      .onConflict('user_id')
      .merge({ trophies: db.raw('user_trophies.trophies + ?', [count]) });
    awarded[playerId] = count;
  }

  return awarded;
}
```

**Step 4: Ověř, že testy prochází**

```bash
npm test --workspace=packages/backend -- --reporter=verbose 2>&1 | grep -E "trophyService|✓|×"
```

Expected: všechny `calculateTrophies` testy ✓

**Step 5: Commit**

```bash
git add packages/backend/src/game/trophyService.ts packages/backend/src/game/trophyService.test.ts
git commit -m "feat: add trophyService with calculateTrophies and awardTrophies"
```

---

### Task 3: Rozšíř `FinishGameResult` v `RoomManager.ts`

**Files:**
- Modify: `packages/backend/src/game/RoomManager.ts:65-69` (interface)
- Modify: `packages/backend/src/game/RoomManager.ts:563-619` (metoda)

**Step 1: Rozšíř interface `FinishGameResult`**

V `RoomManager.ts` uprav interface (řádek ~65):

```typescript
export interface FinishGameResult {
  room: GameRoom;
  payload: GameOverPayload;
  kickedTokens: string[];
  roundNumber: number;
  playerTokenMap: Map<string, string>; // playerId -> playerToken
}
```

**Step 2: Zachyť `roundNumber` a sestav `playerTokenMap` v `finishGame()`**

V metodě `finishGame()` přidej PŘED reset (před `room.roundNumber = 0`):

```typescript
// Zachyť roundNumber před resetem
const roundNumber = room.roundNumber;

// Sestav mapu playerId -> token pro všechny hráče v místnosti
const playerTokenMap = new Map<string, string>();
for (const [token, pid] of this.tokenToPlayerId.entries()) {
  if (this.playerRooms.get(token) === code) {
    playerTokenMap.set(pid, token);
  }
}
```

A uprav `return` na konci metody:

```typescript
return { room, payload, kickedTokens, roundNumber, playerTokenMap };
```

**Step 3: Spusť testy**

```bash
npm test --workspace=packages/backend
```

Expected: 167 passed

**Step 4: Commit**

```bash
git add packages/backend/src/game/RoomManager.ts
git commit -m "feat: finishGame returns roundNumber and playerTokenMap"
```

---

### Task 4: Sdílené typy — `GameOverPayload` a socket event

**Files:**
- Modify: `packages/shared/src/index.ts:93-102` (GameOverPayload)
- Modify: `packages/shared/src/index.ts` (ServerToClientEvents)

**Step 1: Přidej `trophiesAwarded` do `GameOverPayload`**

```typescript
export interface GameOverPayload {
  finalScores: Array<{
    playerId: string;
    nickname: string;
    avatarUrl: string | null;
    score: number;
    rank: number;
  }>;
  roomCode: string;
  trophiesAwarded?: Record<string, number>; // playerId -> pohárky získané v této hře
}
```

**Step 2: Přidej `game:trophiesAwarded` do `ServerToClientEvents`**

Najdi `ServerToClientEvents` a přidej za `game:gameOver`:

```typescript
'game:trophiesAwarded': (data: Record<string, number>) => void;
```

**Step 3: Rebuild shared**

```bash
npm run build --workspace=packages/shared
```

**Step 4: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): add trophiesAwarded to GameOverPayload and socket events"
```

---

### Task 5: Wire up `awardTrophies` v `gameHandlers.ts`

**Files:**
- Modify: `packages/backend/src/socket/gameHandlers.ts`

**Step 1: Importuj `awardTrophies`**

Na začátek souboru přidej:

```typescript
import { awardTrophies } from '../game/trophyService.js';
```

**Step 2: Přidej helper funkci `handleTrophies`**

Za deklarací `SKIP_DELAY_MS` přidej:

```typescript
function handleTrophies(finishResult: { payload: GameOverPayload; roundNumber: number; playerTokenMap: Map<string, string> }, io: IO, roomCode: string): void {
  awardTrophies(finishResult.payload, finishResult.roundNumber, finishResult.playerTokenMap)
    .then(awarded => {
      if (Object.keys(awarded).length > 0) {
        io.to(`room:${roomCode}`).emit('game:trophiesAwarded', awarded);
      }
    })
    .catch(() => {}); // non-critical
}
```

**Step 3: Zavolej `handleTrophies` na všech 3 místech kde se volá `finishGame()`**

Místo 1 — `handlePostRound` (~řádek 33):
```typescript
const finishResult = roomManager.finishGame(room.code);
if (!('error' in finishResult)) {
  io.to(`room:${room.code}`).emit('game:gameOver', finishResult.payload);
  handleTrophies(finishResult, io, room.code);  // <-- přidej tento řádek
  for (const [sid, token] of socketToToken.entries()) {
```

Místo 2 — timeout pro skipped rounds (~řádek 388):
```typescript
const finishResult = roomManager.finishGame(roomCode);
if (!('error' in finishResult)) {
  io.to(`room:${roomCode}`).emit('game:gameOver', finishResult.payload);
  handleTrophies(finishResult, io, roomCode);  // <-- přidej
  for (const [sid, token] of socketToToken.entries()) {
```

Místo 3 — `lobby:endGame` handler (~řádek 320):
```typescript
const result = roomManager.finishGame(room.code);
if ('error' in result) { callback(result); return; }
io.to(`room:${room.code}`).emit('game:gameOver', result.payload);
handleTrophies(result, io, room.code);  // <-- přidej
```

**Step 4: Spusť testy**

```bash
npm test --workspace=packages/backend
```

Expected: 167 passed

**Step 5: Commit**

```bash
git add packages/backend/src/socket/gameHandlers.ts
git commit -m "feat: wire up awardTrophies in gameHandlers"
```

---

### Task 6: `GET /api/me` — vrátit pohárky

**Files:**
- Modify: `packages/backend/src/routes/auth.ts`
- Modify: `packages/backend/src/routes/auth.test.ts`

**Step 1: Napiš failing test**

V `auth.test.ts`, do `describe('GET /api/me')` přidej:

```typescript
it('returns trophies field (0 when no row in user_trophies)', async () => {
  const token = signJwt({ userId: 1 });
  vi.mocked(db).mockReturnValue({
    where: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue({
      id: 1, provider: 'google', provider_id: 'g1', email: 'a@b.com',
      nickname: 'Test', locale: 'cs', avatar_type: 'oauth', avatar_url: null,
      dicebear_style: null, dicebear_seed: null, role: 'user', trophies: null,
    }),
  } as any);
  const res = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: `kpl_token=${token}` } });
  expect(res.statusCode).toBe(200);
  expect(JSON.parse(res.body).trophies).toBe(0);
});
```

**Step 2: Ověř, že test failuje**

```bash
npm test --workspace=packages/backend -- --reporter=verbose 2>&1 | grep -E "trophies"
```

**Step 3: Uprav `GET /api/me` — LEFT JOIN `user_trophies`**

V `auth.ts` uprav handler:

```typescript
fastify.get('/api/me', { preHandler: verifyJwt }, async (request, reply) => {
  const { userId } = request.jwtUser!;
  const user = await db('users')
    .leftJoin('user_trophies', 'users.id', 'user_trophies.user_id')
    .where('users.id', userId)
    .select('users.*', db.raw('COALESCE(user_trophies.trophies, 0) as trophies'))
    .first();
  if (!user) return reply.status(404).send({ error: 'User not found' });
  return formatUser(user);
});
```

**Step 4: Uprav `formatUser` — přidej `trophies`**

```typescript
function formatUser(user: UserRow & { trophies?: number }) {
  return {
    id: user.id,
    provider: user.provider,
    nickname: user.nickname,
    locale: user.locale,
    avatarType: user.avatar_type,
    avatarUrl: user.avatar_url,
    dicebearStyle: user.dicebear_style,
    dicebearSeed: user.dicebear_seed,
    role: user.role,
    trophies: user.trophies ?? 0,
  };
}
```

Pozn: `PATCH /api/me` vrací `formatUser(user!)` — zde `user` nemá `trophies` z joinu, takže výsledek bude `0`. To je akceptovatelné (PATCH neaktualizuje pohárky).

**Step 5: Spusť testy**

```bash
npm test --workspace=packages/backend
```

Expected: passing

**Step 6: Commit**

```bash
git add packages/backend/src/routes/auth.ts packages/backend/src/routes/auth.test.ts
git commit -m "feat: GET /api/me returns trophies via LEFT JOIN"
```

---

### Task 7: Frontend — `OAuthUser` + `roomStore`

**Files:**
- Modify: `packages/frontend/src/stores/profileStore.ts:9-18`
- Modify: `packages/frontend/src/stores/roomStore.ts`

**Step 1: Přidej `trophies` do `OAuthUser`**

V `profileStore.ts` uprav interface:

```typescript
export interface OAuthUser {
  id: number;
  provider: 'google' | 'discord';
  nickname: string | null;
  locale: string;
  avatarType: 'oauth' | 'dicebear';
  avatarUrl: string | null;
  dicebearStyle: string | null;
  dicebearSeed: string | null;
  role: string;
  trophies: number;
}
```

**Step 2: Přidej `trophiesAwarded` ref do `roomStore`**

Do `roomStore.ts` přidej ref a socket listener:

```typescript
const trophiesAwarded = ref<Record<string, number>>({});
```

Do `setupSocketListeners()` přidej:

```typescript
socket.on('game:trophiesAwarded', (data) => {
  trophiesAwarded.value = data;
  // Aktualizuj trophies v profileStore pro okamžité zobrazení
  const profileStore = useProfileStore();
  if (profileStore.isAuthenticated && profileStore.oauthUser && roomStore.myPlayerId) {
    const myId = roomStore.myPlayerId;
    if (data[myId] !== undefined) {
      profileStore.oauthUser = {
        ...profileStore.oauthUser,
        trophies: profileStore.oauthUser.trophies + data[myId],
      };
    }
  }
});
```

Do `teardownSocketListeners()` přidej:

```typescript
socket.off('game:trophiesAwarded');
trophiesAwarded.value = {};
```

Přidej `trophiesAwarded` do `return`:

```typescript
return {
  // ... existing ...
  trophiesAwarded,
};
```

**Pozn:** `roomStore` musí importovat `useProfileStore` — přidej import na začátek souboru:

```typescript
import { useProfileStore } from './profileStore';
```

**Step 3: Commit**

```bash
git add packages/frontend/src/stores/profileStore.ts packages/frontend/src/stores/roomStore.ts
git commit -m "feat(frontend): add trophies to OAuthUser and trophiesAwarded to roomStore"
```

---

### Task 8: `FinishedPhase.vue` — zobrazit delta pohárků

**Files:**
- Modify: `packages/frontend/src/components/FinishedPhase.vue`

**Step 1: Zobraz pohárky v scoreboardu**

V `<script setup>` uprav `scoreboard` computed — přidej `trophyDelta`:

```typescript
const trophiesAwarded = computed(() => roomStore.trophiesAwarded);

const scoreboard = computed(() =>
  (roomStore.finishedState?.finalScores ?? []).map(p => ({
    id: p.playerId,
    nickname: p.nickname,
    avatarUrl: p.avatarUrl,
    score: p.score,
    rank: p.rank,
    trophyDelta: trophiesAwarded.value[p.playerId],
  }))
);
```

**Step 2: Uprav template — přidej pohárky v sekci scoreboard**

Za `<Scoreboard>` tag přidej seznam s delta pohárků pod ním — nebo uprav, aby `Scoreboard` přijímal extra slot. Nejjednodušší varianta: pod `<Scoreboard>` přidej samostatný list s pohárky:

```html
<!-- Trophy deltas - zobrazit jen pokud existují -->
<div v-if="Object.keys(trophiesAwarded).length > 0" class="text-left mt-2 space-y-1">
  <div
    v-for="p in scoreboard.filter(s => s.trophyDelta !== undefined && s.trophyDelta > 0)"
    :key="p.id"
    class="flex items-center gap-2 text-sm text-yellow-400"
  >
    <span>{{ p.nickname }}</span>
    <span>+{{ p.trophyDelta }} 🏆</span>
  </div>
</div>
```

**Step 3: Commit**

```bash
git add packages/frontend/src/components/FinishedPhase.vue
git commit -m "feat(frontend): show trophy delta in FinishedPhase"
```

---

### Task 9: `AppHeader.vue` — zobrazit celkový počet pohárků

**Files:**
- Modify: `packages/frontend/src/components/AppHeader.vue`

**Step 1: Přidej trophy badge vedle avataru**

V `AppHeader.vue`, do `<script setup>` přidej computed:

```typescript
const trophies = computed(() => profileStore.oauthUser?.trophies ?? 0);
```

V template, za `<PlayerAvatar>` tlačítko přidej badge (dovnitř `<div class="relative">`):

```html
<!-- Trophy count pro OAuth uživatele -->
<div
  v-if="profileStore.isAuthenticated && trophies > 0"
  class="absolute -bottom-1 -right-1 flex items-center gap-0.5 bg-gray-900 border border-yellow-500/50 rounded-full px-1 py-0.5 text-xs text-yellow-400 leading-none"
>
  <span>{{ trophies }}</span>
  <span>🏆</span>
</div>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/AppHeader.vue
git commit -m "feat(frontend): show trophy count in AppHeader for OAuth users"
```

---

### Task 10: Finální test suite

**Step 1: Spusť všechny backend testy**

```bash
npm test --workspace=packages/backend
```

Expected: všechny testy prochází

**Step 2: Build frontend**

```bash
npm run build --workspace=packages/shared && npm run build --workspace=packages/frontend
```

Expected: build bez chyb

**Step 3: Finální commit pokud potřeba**

```bash
git status
```

Pokud jsou neuložené změny, commitni je.
