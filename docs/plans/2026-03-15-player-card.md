# Player Card (Lobby) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Clicking on a player in the lobby shows a modal with their avatar, nickname, trophy count (OAuth only), and a friend-request button.

**Architecture:** Add `oauthUserId` to the shared `Player` type; backend populates it after `linkPlayerToken` resolves and rebroadcasts room state; new public REST endpoint returns trophy count; a new `PlayerCardModal.vue` component fetches and displays the profile lazily.

**Tech Stack:** TypeScript, `@kpl/shared`, Fastify (backend routes), Knex (DB), Vue 3 + Pinia (frontend), Vitest (tests)

**Worktree:** `.worktrees/feature/player-card` (branch `feature/player-card`)

---

### Task 1: Add `oauthUserId` to the shared `Player` type

**Files:**
- Modify: `packages/shared/src/index.ts`

**Step 1: Add the field to the `Player` interface**

In `packages/shared/src/index.ts`, find the `Player` interface and add one field after `isAfk`:

```ts
export interface Player {
  id: string;
  isOnline: boolean;
  nickname: string;
  avatarUrl: string | null;
  score: number;
  isCardCzar: boolean;
  hasPlayed: boolean;
  tradedThisRound: boolean;
  isAfk: boolean;
  oauthUserId?: number | null;   // ← add this line
}
```

**Step 2: Build shared package to verify no TS errors**

Run: `npm run build --workspace=packages/shared`
Expected: exits 0, no errors

**Step 3: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): add oauthUserId to Player type"
```

---

### Task 2: Add `setPlayerOAuthUserId` to `RoomManager`

**Files:**
- Modify: `packages/backend/src/game/RoomManager.ts`
- Test: `packages/backend/src/game/RoomManager.test.ts`

**Step 1: Write the failing test**

In `packages/backend/src/game/RoomManager.test.ts`, add a new `describe` block after existing tests:

```ts
describe('setPlayerOAuthUserId', () => {
  it('sets oauthUserId on the player matching the given token', () => {
    const rm = new RoomManager();
    const { room, playerToken } = rm.createRoom({
      nickname: 'Alice',
      name: 'TestRoom',
      isPublic: false,
      selectedSetIds: [1],
      maxPlayers: 6,
      specialRules: [],
      czarMode: 'classic',
      winCondition: 'score',
      targetScore: 8,
      targetRounds: 20,
      gameTimeLimit: 15,
      avatarUrl: null,
    });
    rm.setPlayerOAuthUserId(playerToken, 42);
    const player = rm.getRoom(room.code)!.players[0];
    expect(player.oauthUserId).toBe(42);
  });

  it('is a no-op for unknown token', () => {
    const rm = new RoomManager();
    expect(() => rm.setPlayerOAuthUserId('unknown-token', 1)).not.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/backend 2>&1 | grep -A3 "setPlayerOAuthUserId"`
Expected: `TypeError: rm.setPlayerOAuthUserId is not a function`

**Step 3: Implement `setPlayerOAuthUserId` in RoomManager**

In `packages/backend/src/game/RoomManager.ts`, add this method after the existing `updateAvatar` method:

```ts
setPlayerOAuthUserId(playerToken: string, userId: number): void {
  const code = this.playerRooms.get(playerToken);
  if (!code) return;
  const room = this.rooms.get(code);
  if (!room) return;
  const playerId = this.tokenToPlayerId.get(playerToken);
  if (!playerId) return;
  const player = room.players.find(p => p.id === playerId);
  if (player) player.oauthUserId = userId;
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test --workspace=packages/backend 2>&1 | tail -5`
Expected: all tests pass

**Step 5: Commit**

```bash
git add packages/backend/src/game/RoomManager.ts packages/backend/src/game/RoomManager.test.ts
git commit -m "feat(backend): add setPlayerOAuthUserId to RoomManager"
```

---

### Task 3: Call `setPlayerOAuthUserId` after `linkPlayerToken` and rebroadcast

**Files:**
- Modify: `packages/backend/src/socket/lobbyHandlers.ts`

**Step 1: Update `linkPlayerToken` to return `userId | null`**

Change the `linkPlayerToken` function signature and body so it returns the resolved `userId`:

```ts
async function linkPlayerToken(
  cookieHeader: string,
  playerToken: string,
  roomCode: string,
): Promise<number | null> {
  const userId = extractUserIdFromCookieHeader(cookieHeader);
  if (!userId) return null;
  try {
    await db('user_player_tokens')
      .insert({ user_id: userId, player_token: playerToken, room_code: roomCode })
      .onConflict(['player_token', 'room_code'])
      .merge({ last_seen: db.fn.now() });
    return userId;
  } catch {
    return null;
  }
}
```

**Step 2: After `lobby:create`, update oauthUserId and rebroadcast**

In the `lobby:create` handler, change the fire-and-forget call:

```ts
// BEFORE:
linkPlayerToken(cookieHeader, playerToken, room.code).catch(() => {});

// AFTER:
linkPlayerToken(cookieHeader, playerToken, room.code).then((userId) => {
  if (userId) {
    roomManager.setPlayerOAuthUserId(playerToken, userId);
    const updatedRoom = roomManager.getRoom(room.code);
    if (updatedRoom) {
      io.to(`room:${room.code}`).emit('lobby:stateUpdate', toPublicRoom(updatedRoom));
    }
  }
}).catch(() => {});
```

**Step 3: Same for `lobby:join`**

```ts
// BEFORE:
linkPlayerToken(cookieHeaderJoin, playerToken, room.code).catch(() => {});

// AFTER:
linkPlayerToken(cookieHeaderJoin, playerToken, room.code).then((userId) => {
  if (userId) {
    roomManager.setPlayerOAuthUserId(playerToken, userId);
    const updatedRoom = roomManager.getRoom(room.code);
    if (updatedRoom) {
      io.to(`room:${room.code}`).emit('lobby:stateUpdate', toPublicRoom(updatedRoom));
    }
  }
}).catch(() => {});
```

**Step 4: Run tests**

Run: `npm test --workspace=packages/backend 2>&1 | tail -5`
Expected: all tests pass

**Step 5: Commit**

```bash
git add packages/backend/src/socket/lobbyHandlers.ts
git commit -m "feat(backend): broadcast oauthUserId after OAuth player joins lobby"
```

---

### Task 4: New REST endpoint `GET /api/users/:userId/public-profile`

**Files:**
- Modify: `packages/backend/src/routes/rooms.ts`
- Test: `packages/backend/src/routes/rooms.test.ts`

**Step 1: Write the failing test**

In `packages/backend/src/routes/rooms.test.ts`, add a new `describe` block:

```ts
describe('GET /api/users/:userId/public-profile', () => {
  it('returns 404 for unknown user', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/users/99999/public-profile' });
    expect(res.statusCode).toBe(404);
  });

  it('returns public profile with trophies for known user', async () => {
    // Insert a test user and their trophies
    const [userId] = await db('users').insert({
      nickname: 'TestUser',
      avatar_url: null,
      provider: 'google',
      provider_id: 'test-provider-id-pub',
      email: 'testpub@example.com',
      role: 'user',
    });
    await db('user_trophies').insert({ user_id: userId, trophies: 13 });

    const res = await app.inject({ method: 'GET', url: `/api/users/${userId}/public-profile` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.userId).toBe(userId);
    expect(body.nickname).toBe('TestUser');
    expect(body.trophies).toBe(13);

    // cleanup
    await db('user_trophies').where({ user_id: userId }).delete();
    await db('users').where({ id: userId }).delete();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/backend -- rooms 2>&1 | grep -E "FAIL|404|public-profile"`
Expected: 404 test fails (route doesn't exist yet)

**Step 3: Implement the route in `rooms.ts`**

Add after the existing `/rooms/:code/preview` route:

```ts
fastify.get('/users/:userId/public-profile', async (request, reply) => {
  const { userId } = request.params as { userId: string };
  const id = parseInt(userId, 10);
  if (isNaN(id)) return reply.status(400).send({ error: 'Invalid userId' });

  const row = await db('users')
    .leftJoin('user_trophies', 'users.id', 'user_trophies.user_id')
    .where('users.id', id)
    .select('users.id', 'users.nickname', 'users.avatar_url', db.raw('COALESCE(user_trophies.trophies, 0) as trophies'))
    .first();

  if (!row) return reply.status(404).send({ error: 'User not found' });

  return {
    userId: row.id,
    nickname: row.nickname,
    avatarUrl: row.avatar_url,
    trophies: row.trophies,
  };
});
```

**Step 4: Run tests to verify they pass**

Run: `npm test --workspace=packages/backend -- rooms 2>&1 | tail -5`
Expected: all rooms tests pass

**Step 5: Commit**

```bash
git add packages/backend/src/routes/rooms.ts packages/backend/src/routes/rooms.test.ts
git commit -m "feat(backend): add GET /api/users/:userId/public-profile endpoint"
```

---

### Task 5: Frontend — `PlayerCardModal.vue` component

**Files:**
- Create: `packages/frontend/src/components/PlayerCardModal.vue`

This modal is shown when a player row is clicked in `PlayerList`. It receives a `Player` object and knows if the current user is OAuth (via `profileStore`).

**Logic:**
- If `player.oauthUserId` is null/undefined → guest view (nickname + avatar + "just passing through")
- If `player.oauthUserId` is set → OAuth view (nickname + avatar + trophies from API)
- Friend button: visible only if current user is OAuth AND player is not "me" AND not already a friend

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Player } from '@kpl/shared';
import { useProfileStore } from '../stores/profileStore';
import { useFriendsStore } from '../stores/friendsStore';
import Avatar from './Avatar.vue';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';

const props = defineProps<{
  player: Player;
  myPlayerId: string | null;
}>();

const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const profileStore = useProfileStore();
const friendsStore = useFriendsStore();

const trophies = ref<number | null>(null);
const friendRequestSent = ref(false);
const friendRequestError = ref('');
const loadingFriend = ref(false);

const isOAuth = computed(() => !!props.player.oauthUserId);

const isFriend = computed(() =>
  !!props.player.oauthUserId &&
  friendsStore.friends.some(f => f.userId === props.player.oauthUserId)
);

const canAddFriend = computed(() =>
  profileStore.isAuthenticated &&
  isOAuth.value &&
  !isFriend.value &&
  !friendRequestSent.value
);

onMounted(async () => {
  if (!props.player.oauthUserId) return;
  try {
    const res = await fetch(`${BACKEND_URL}/api/users/${props.player.oauthUserId}/public-profile`);
    if (res.ok) {
      const data = await res.json();
      trophies.value = data.trophies;
    }
  } catch { /* silent */ }
});

async function addFriend() {
  if (!props.player.oauthUserId) return;
  loadingFriend.value = true;
  friendRequestError.value = '';
  const err = await friendsStore.sendRequest(props.player.oauthUserId);
  loadingFriend.value = false;
  if (err) {
    friendRequestError.value = err;
  } else {
    friendRequestSent.value = true;
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      @click.self="emit('close')"
    >
      <div class="bg-[#0d1117] border border-white/10 rounded-2xl w-full max-w-xs p-6 flex flex-col items-center gap-4 relative">
        <!-- Close button -->
        <button
          @click="emit('close')"
          class="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <!-- Avatar -->
        <Avatar :nickname="player.nickname" :avatar-url="player.avatarUrl" :size="64" />

        <!-- Nickname -->
        <h2 class="text-xl font-black tracking-tighter uppercase italic text-white">
          {{ player.nickname }}
        </h2>

        <!-- Guest view -->
        <template v-if="!isOAuth">
          <p class="text-slate-400 text-sm text-center">{{ t('playerCard.guestInfo') }}</p>
        </template>

        <!-- OAuth view -->
        <template v-else>
          <!-- Trophies -->
          <div class="flex items-center gap-2 text-yellow-400 font-black text-lg">
            <span>🏆</span>
            <span v-if="trophies !== null">{{ trophies }}</span>
            <span v-else class="text-slate-500 text-sm font-normal">...</span>
          </div>

          <!-- Friend actions -->
          <div v-if="canAddFriend" class="w-full">
            <button
              @click="addFriend"
              :disabled="loadingFriend"
              class="w-full py-2.5 bg-white text-black text-sm font-black uppercase tracking-widest rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:bg-gray-100"
            >
              {{ loadingFriend ? '...' : t('playerCard.addFriend') }}
            </button>
            <p v-if="friendRequestError" class="text-red-400 text-xs text-center mt-2">{{ friendRequestError }}</p>
          </div>

          <div v-else-if="friendRequestSent" class="text-green-400 text-sm font-bold">
            {{ t('playerCard.requestSent') }}
          </div>

          <div v-else-if="isFriend" class="text-slate-400 text-sm font-bold">
            ✓ {{ t('playerCard.alreadyFriends') }}
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
```

**Step: Commit**

```bash
git add packages/frontend/src/components/PlayerCardModal.vue
git commit -m "feat(frontend): add PlayerCardModal component"
```

---

### Task 6: Wire click handler in `PlayerList.vue`

**Files:**
- Modify: `packages/frontend/src/components/PlayerList.vue`

**Step 1: Add `player-click` emit and click handler to player rows**

Replace the current `<li>` element with:
- Add `@click="emit('player-click', player)"` on the `<li>`
- Add `cursor-pointer` class to non-self players

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { Player } from '@kpl/shared';
import Avatar from './Avatar.vue';

defineProps<{
  players: Player[];
  hostId: string;
  myPlayerId: string | null;
  isHost: boolean;
  hasRando?: boolean;
}>();

const emit = defineEmits<{
  kick: [playerId: string];
  'player-click': [player: Player];
}>();

const { t } = useI18n();
</script>
```

And on the `<li>`:
```html
<li
  v-for="player in players"
  :key="player.id"
  @click="player.id !== myPlayerId && emit('player-click', player)"
  :class="[
    'flex items-center justify-between bg-gray-700 px-4 py-2 rounded transition-colors',
    player.id !== myPlayerId ? 'cursor-pointer hover:bg-gray-600' : ''
  ]"
>
```

**Step 2: Run tests**

Run: `npm test --workspace=packages/backend 2>&1 | tail -3`
Expected: still passing (frontend has no tests)

**Step 3: Commit**

```bash
git add packages/frontend/src/components/PlayerList.vue
git commit -m "feat(frontend): PlayerList emits player-click on row click"
```

---

### Task 7: Wire modal in `LobbyPanel.vue`

**Files:**
- Modify: `packages/frontend/src/components/LobbyPanel.vue`

**Step 1: Import and add state**

Add to `<script setup>`:

```ts
import PlayerCardModal from './PlayerCardModal.vue';
const selectedPlayer = ref<import('@kpl/shared').Player | null>(null);
```

**Step 2: Add `@player-click` handler on `<PlayerList>`**

```html
<PlayerList
  :players="room.players"
  :host-id="room.hostId"
  :my-player-id="roomStore.myPlayerId"
  :is-host="roomStore.isHost"
  :has-rando="roomStore.hasRule('rando_cardrissian')"
  @kick="kick"
  @player-click="selectedPlayer = $event"
/>
```

**Step 3: Add modal at end of template**

```html
<PlayerCardModal
  v-if="selectedPlayer"
  :player="selectedPlayer"
  :my-player-id="roomStore.myPlayerId"
  @close="selectedPlayer = null"
/>
```

**Step 4: Commit**

```bash
git add packages/frontend/src/components/LobbyPanel.vue
git commit -m "feat(frontend): open PlayerCardModal on player click in lobby"
```

---

### Task 8: Add i18n keys

**Files:**
- Modify: `packages/frontend/src/i18n/locales/cs.json`
- Modify: `packages/frontend/src/i18n/locales/en.json`
- Modify: `packages/frontend/src/i18n/locales/ru.json`
- Modify: `packages/frontend/src/i18n/locales/uk.json`
- Modify: `packages/frontend/src/i18n/locales/es.json`

**Step 1: Add `playerCard` namespace to each locale**

`cs.json`:
```json
"playerCard": {
  "guestInfo": "Hraje jen na návštěvě",
  "addFriend": "+ Přidat do přátel",
  "requestSent": "Žádost odeslána",
  "alreadyFriends": "Již přátelé"
}
```

`en.json`:
```json
"playerCard": {
  "guestInfo": "Just passing through",
  "addFriend": "+ Add friend",
  "requestSent": "Request sent",
  "alreadyFriends": "Already friends"
}
```

`ru.json`:
```json
"playerCard": {
  "guestInfo": "Просто проходит мимо",
  "addFriend": "+ Добавить в друзья",
  "requestSent": "Запрос отправлен",
  "alreadyFriends": "Уже друзья"
}
```

`uk.json`:
```json
"playerCard": {
  "guestInfo": "Просто заглянув",
  "addFriend": "+ Додати до друзів",
  "requestSent": "Запит надіслано",
  "alreadyFriends": "Вже друзі"
}
```

`es.json`:
```json
"playerCard": {
  "guestInfo": "Solo de paso",
  "addFriend": "+ Agregar amigo",
  "requestSent": "Solicitud enviada",
  "alreadyFriends": "Ya son amigos"
}
```

**Step 2: Commit**

```bash
git add packages/frontend/src/i18n/locales/
git commit -m "feat(i18n): add playerCard translations for all locales"
```

---

### Task 9: Final verification

**Step 1: Run all backend tests**

Run: `npm test --workspace=packages/backend 2>&1 | tail -5`
Expected: all tests pass

**Step 2: Build all packages**

Run: `npm run build 2>&1 | tail -10`
Expected: exits 0

**Step 3: Manual smoke test**

1. Start dev servers: `npm run dev:backend` and `npm run dev:frontend`
2. Open lobby with 2+ players (one OAuth, one guest)
3. Click guest player → see "Hraje jen na návštěvě"
4. Click OAuth player → see trophy count + friend button
5. Click yourself → no modal (nothing happens)
6. Click Rando Cardrissian → no modal

**Step 4: Commit any fixes, then finish branch**

Use `superpowers:finishing-a-development-branch` to decide merge/PR.
