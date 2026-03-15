# Friends Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement friends management for OAuth users — list, mutual requests (request/accept/reject), profile link + QR code for adding, real-time game invites via Socket.io.

**Architecture:** New `friendships` DB table + REST routes (`/api/friends/*`) + Socket.io events (`friend:*`) via user rooms (`user:<userId>`). Frontend: Pinia `friendsStore` + `FriendsView.vue` (replace placeholder) + `AddFriendView.vue` (public, `/add-friend/:userId`) + global toasts in `App.vue`.

**Tech Stack:** Knex migrations, Fastify + Zod, Vitest (mock db pattern from `auth.test.ts`), Vue 3 Composition API, Pinia, Socket.io, `qrcode` npm package for QR.

**Worktree:** `.worktrees/feature/friends` (branch `feature/friends`)

---

### Task 1: DB Migration — friendships table

**Files:**
- Create: `packages/backend/src/db/migrations/20260315000000_friendships.ts`

**Step 1: Create migration file**

```ts
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('friendships', (t) => {
    t.increments('id').primary();
    t.integer('requester_id').unsigned().notNullable();
    t.integer('addressee_id').unsigned().notNullable();
    t.enum('status', ['pending', 'accepted']).defaultTo('pending').notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['requester_id', 'addressee_id']);
    t.foreign('requester_id').references('users.id').onDelete('CASCADE');
    t.foreign('addressee_id').references('users.id').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('friendships');
}
```

**Step 2: Run migration**

```bash
cd .worktrees/feature/friends
npm run migrate --workspace=packages/backend
```

Expected: `Batch 1 run: 1 migrations`

**Step 3: Commit**

```bash
git add packages/backend/src/db/migrations/20260315000000_friendships.ts
git commit -m "feat(db): add friendships migration"
```

---

### Task 2: Shared Types — friend socket events

**Files:**
- Modify: `packages/shared/src/index.ts`

**Step 1: Add friend payload types and socket events**

Add after the last `export interface` (after `EditorCardsPage`):

```ts
// ── Friends ───────────────────────────────────────────────────────────────────

export interface FriendEntry {
  friendshipId: number;
  userId: number;
  nickname: string;
  avatarUrl: string | null;
}

export interface FriendRequest {
  friendshipId: number;
  fromUserId: number;
  fromNick: string;
  fromAvatarUrl: string | null;
}
```

In `ServerToClientEvents` add:

```ts
'friend:request_received': (data: { friendshipId: number; fromNick: string; fromAvatarUrl: string | null }) => void;
'friend:request_accepted': (data: { friendshipId: number; byNick: string; byAvatarUrl: string | null }) => void;
'friend:invite_received': (data: { roomCode: string; roomName: string; fromNick: string }) => void;
```

In `ClientToServerEvents` add:

```ts
'friend:invite': (data: { friendUserId: number; roomCode: string }) => void;
```

**Step 2: Rebuild shared**

```bash
npm run build --workspace=packages/shared
```

Expected: exits 0 with no errors.

**Step 3: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): add friend socket event types"
```

---

### Task 3: Backend — REST routes for friends

**Files:**
- Create: `packages/backend/src/routes/friends.ts`
- Create: `packages/backend/src/routes/friends.test.ts`
- Modify: `packages/backend/src/index.ts`

**Step 1: Write the failing tests first**

`packages/backend/src/routes/friends.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import friendsRoutes from './friends.js';
import { signToken } from '../auth/jwt.js';

vi.mock('../db/db.js', () => ({ default: vi.fn() }));
import db from '../db/db.js';
const mockDb = db as unknown as ReturnType<typeof vi.fn>;

const TOKEN = () => signToken({ userId: 1, provider: 'google' });

async function buildApp() {
  process.env.JWT_SECRET = 'test-secret-min-32-chars-long-123';
  const app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(friendsRoutes);
  await app.ready();
  return app;
}

describe('GET /api/friends', () => {
  it('returns 401 without auth', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/friends' });
    expect(res.statusCode).toBe(401);
  });

  it('returns friends list', async () => {
    const app = await buildApp();
    mockDb.mockReturnValue({
      join: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue([
        { friendshipId: 1, userId: 2, nickname: 'Alice', avatarUrl: null },
      ]),
    });
    const res = await app.inject({
      method: 'GET', url: '/api/friends',
      headers: { cookie: `kpl_token=${TOKEN()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveLength(1);
    expect(body[0].nickname).toBe('Alice');
  });
});

describe('GET /api/friends/requests', () => {
  it('returns pending requests', async () => {
    const app = await buildApp();
    mockDb.mockReturnValue({
      join: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue([
        { friendshipId: 3, fromUserId: 5, fromNick: 'Bob', fromAvatarUrl: null },
      ]),
    });
    const res = await app.inject({
      method: 'GET', url: '/api/friends/requests',
      headers: { cookie: `kpl_token=${TOKEN()}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toHaveLength(1);
  });
});

describe('POST /api/friends/request', () => {
  it('returns 400 if addresseeId missing', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/api/friends/request',
      headers: { cookie: `kpl_token=${TOKEN()}`, 'content-type': 'application/json' },
      payload: JSON.stringify({}),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 if sending request to self', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/api/friends/request',
      headers: { cookie: `kpl_token=${TOKEN()}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ addresseeId: 1 }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('creates friendship record', async () => {
    const app = await buildApp();
    mockDb
      .mockReturnValueOnce({
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orWhere: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null), // no existing friendship
      })
      .mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue([42]),
      });
    const res = await app.inject({
      method: 'POST', url: '/api/friends/request',
      headers: { cookie: `kpl_token=${TOKEN()}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ addresseeId: 2 }),
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).friendshipId).toBe(42);
  });
});

describe('POST /api/friends/accept/:id', () => {
  it('accepts a pending request', async () => {
    const app = await buildApp();
    mockDb
      .mockReturnValueOnce({
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: 7, requester_id: 3, addressee_id: 1, status: 'pending' }),
      })
      .mockReturnValueOnce({
        where: vi.fn().mockReturnThis(),
        update: vi.fn().mockResolvedValue(1),
      });
    const res = await app.inject({
      method: 'POST', url: '/api/friends/accept/7',
      headers: { cookie: `kpl_token=${TOKEN()}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 if request not found or not addressee', async () => {
    const app = await buildApp();
    mockDb.mockReturnValue({
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(null),
    });
    const res = await app.inject({
      method: 'POST', url: '/api/friends/accept/999',
      headers: { cookie: `kpl_token=${TOKEN()}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/friends/:id', () => {
  it('removes a friendship', async () => {
    const app = await buildApp();
    mockDb.mockReturnValue({
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      orWhere: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ id: 5, requester_id: 1, addressee_id: 2, status: 'accepted' }),
      delete: vi.fn().mockResolvedValue(1),
    });
    const res = await app.inject({
      method: 'DELETE', url: '/api/friends/5',
      headers: { cookie: `kpl_token=${TOKEN()}` },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('GET /api/users/:id/public', () => {
  it('returns public user profile', async () => {
    const app = await buildApp();
    mockDb.mockReturnValue({
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ id: 2, nickname: 'Alice', avatar_url: null }),
    });
    const res = await app.inject({ method: 'GET', url: '/api/users/2/public' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).nickname).toBe('Alice');
  });

  it('returns 404 for unknown user', async () => {
    const app = await buildApp();
    mockDb.mockReturnValue({
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(null),
    });
    const res = await app.inject({ method: 'GET', url: '/api/users/9999/public' });
    expect(res.statusCode).toBe(404);
  });
});
```

**Step 2: Run tests — verify they fail**

```bash
npm test --workspace=packages/backend 2>&1 | grep -E "FAIL|friends"
```

Expected: `FAIL src/routes/friends.test.ts` (module not found)

**Step 3: Implement the route**

`packages/backend/src/routes/friends.ts`:

```ts
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import db from '../db/db.js';
import { verifyJwt } from '../auth/middleware.js';

const SendRequestSchema = z.object({ addresseeId: z.number().int().positive() });

const friendsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest('jwtUser', undefined);

  // GET /api/friends — accepted friends
  fastify.get('/friends', { preHandler: verifyJwt }, async (request) => {
    const { userId } = request.jwtUser!;
    return db('friendships as f')
      .join('users as u', function () {
        this.on(db.raw('CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END = u.id', [userId]));
      })
      .where('f.status', 'accepted')
      .andWhere(function () {
        this.where('f.requester_id', userId).orWhere('f.addressee_id', userId);
      })
      .select<Array<{ friendshipId: number; userId: number; nickname: string; avatarUrl: string | null }>>(
        'f.id as friendshipId',
        'u.id as userId',
        'u.nickname',
        'u.avatar_url as avatarUrl',
      );
  });

  // GET /api/friends/requests — incoming pending requests
  fastify.get('/friends/requests', { preHandler: verifyJwt }, async (request) => {
    const { userId } = request.jwtUser!;
    return db('friendships as f')
      .join('users as u', 'u.id', 'f.requester_id')
      .where('f.status', 'pending')
      .andWhere('f.addressee_id', userId)
      .select<Array<{ friendshipId: number; fromUserId: number; fromNick: string; fromAvatarUrl: string | null }>>(
        'f.id as friendshipId',
        'u.id as fromUserId',
        'u.nickname as fromNick',
        'u.avatar_url as fromAvatarUrl',
      );
  });

  // POST /api/friends/request
  fastify.post('/friends/request', { preHandler: verifyJwt }, async (request, reply) => {
    const { userId } = request.jwtUser!;
    const parsed = SendRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid addresseeId' });

    const { addresseeId } = parsed.data;
    if (addresseeId === userId) return reply.status(400).send({ error: 'Cannot add yourself' });

    const existing = await db('friendships')
      .where(function () {
        this.where({ requester_id: userId, addressee_id: addresseeId })
          .orWhere({ requester_id: addresseeId, addressee_id: userId });
      })
      .first();
    if (existing) return reply.status(409).send({ error: 'Already friends or request pending' });

    const [friendshipId] = await db('friendships').insert({ requester_id: userId, addressee_id: addresseeId });
    return reply.status(201).send({ friendshipId });
  });

  // POST /api/friends/accept/:id
  fastify.post<{ Params: { id: string } }>('/friends/accept/:id', { preHandler: verifyJwt }, async (request, reply) => {
    const { userId } = request.jwtUser!;
    const id = Number(request.params.id);
    const row = await db('friendships')
      .where({ id })
      .andWhere('addressee_id', userId)
      .first();
    if (!row) return reply.status(404).send({ error: 'Request not found' });

    await db('friendships').where({ id }).update({ status: 'accepted' });
    return { ok: true };
  });

  // DELETE /api/friends/:id — reject or remove
  fastify.delete<{ Params: { id: string } }>('/friends/:id', { preHandler: verifyJwt }, async (request, reply) => {
    const { userId } = request.jwtUser!;
    const id = Number(request.params.id);
    const row = await db('friendships')
      .where({ id })
      .andWhere(function () {
        this.where('requester_id', userId).orWhere('addressee_id', userId);
      })
      .first();
    if (!row) return reply.status(404).send({ error: 'Not found' });

    await db('friendships').where({ id }).delete();
    return { ok: true };
  });

  // GET /api/users/:id/public — public profile (no auth)
  fastify.get<{ Params: { id: string } }>('/users/:id/public', async (request, reply) => {
    const id = Number(request.params.id);
    const user = await db('users')
      .where({ id })
      .select('id', 'nickname', 'avatar_url')
      .first();
    if (!user) return reply.status(404).send({ error: 'User not found' });
    return { id: user.id, nickname: user.nickname, avatarUrl: user.avatar_url };
  });
};

export default friendsRoutes;
```

**Step 4: Register routes in index.ts**

In `packages/backend/src/index.ts`, add after the other imports:

```ts
import friendsRoutes from './routes/friends.js';
```

And after `await app.register(editorCardsRoutes, { prefix: '/api' });`:

```ts
await app.register(friendsRoutes, { prefix: '/api' });
```

**Step 5: Run tests — verify they pass**

```bash
npm test --workspace=packages/backend 2>&1 | grep -E "Test Files|Tests|FAIL"
```

Expected: `Test Files 9 passed`, `Tests 16x passed` (all green)

**Step 6: Commit**

```bash
git add packages/backend/src/routes/friends.ts packages/backend/src/routes/friends.test.ts packages/backend/src/index.ts
git commit -m "feat(backend): add friends REST routes with tests"
```

---

### Task 4: Socket.io — friend handlers + user rooms

**Files:**
- Create: `packages/backend/src/socket/friendHandlers.ts`
- Modify: `packages/backend/src/index.ts`

**Step 1: Create friendHandlers.ts**

```ts
import type { Server, Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@kpl/shared';
import { extractUserIdFromCookieHeader } from '../auth/jwt.js';
import db from '../db/db.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export function registerFriendHandlers(io: IO, socket: AppSocket) {
  // Join user-specific room for targeted notifications
  const cookieHeader = socket.handshake.headers.cookie ?? '';
  const userId = extractUserIdFromCookieHeader(cookieHeader);
  if (userId) {
    socket.join(`user:${userId}`);
  }

  // Send game invite to a friend
  socket.on('friend:invite', async ({ friendUserId, roomCode }) => {
    if (!userId) return;

    // Verify they are actually friends (security check)
    const friendship = await db('friendships')
      .where({ status: 'accepted' })
      .andWhere(function () {
        this.where({ requester_id: userId, addressee_id: friendUserId })
          .orWhere({ requester_id: friendUserId, addressee_id: userId });
      })
      .first()
      .catch(() => null);
    if (!friendship) return;

    const inviter = await db('users').where({ id: userId }).select('nickname').first().catch(() => null);
    const room = await db('rooms').where({ code: roomCode }).first().catch(() => null);

    io.to(`user:${friendUserId}`).emit('friend:invite_received', {
      roomCode,
      roomName: room?.name ?? roomCode,
      fromNick: inviter?.nickname ?? 'Někdo',
    });
  });
}

// Notify a specific user via their socket room (called from REST routes)
export function notifyUser(
  io: IO,
  targetUserId: number,
  event: keyof ServerToClientEvents,
  data: unknown,
) {
  (io.to(`user:${targetUserId}`) as any).emit(event, data);
}
```

> **Note:** The `rooms` table doesn't exist — room names are in-memory only. We'll use `roomCode` as fallback for room name. Remove the `db('rooms')` lookup and pass roomCode as roomName.

**Corrected `friend:invite` handler** (replace the `room` lookup):

```ts
  socket.on('friend:invite', async ({ friendUserId, roomCode }) => {
    if (!userId) return;

    const friendship = await db('friendships')
      .where({ status: 'accepted' })
      .andWhere(function () {
        this.where({ requester_id: userId, addressee_id: friendUserId })
          .orWhere({ requester_id: friendUserId, addressee_id: userId });
      })
      .first()
      .catch(() => null);
    if (!friendship) return;

    const inviter = await db('users').where({ id: userId }).select('nickname').first().catch(() => null);

    io.to(`user:${friendUserId}`).emit('friend:invite_received', {
      roomCode,
      roomName: roomCode,  // in-memory only — frontend will display roomCode
      fromNick: inviter?.nickname ?? 'Někdo',
    });
  });
```

**Step 2: Register in index.ts**

Add import:
```ts
import { registerFriendHandlers } from './socket/friendHandlers.js';
```

Inside `io.on('connection', (socket) => { ... })`, add after `registerGameHandlers`:

```ts
registerFriendHandlers(io, socket);
```

**Step 3: Emit friend notifications from REST routes**

Modify `packages/backend/src/routes/friends.ts` to accept `io` as option and emit events on request/accept.

Add to the top of `friends.ts`:

```ts
import type { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@kpl/shared';

declare module 'fastify' {
  interface FastifyInstance {
    io?: Server<ClientToServerEvents, ServerToClientEvents>;
  }
}
```

Change plugin signature to accept options:

```ts
const friendsRoutes: FastifyPluginAsync<{ io?: Server<ClientToServerEvents, ServerToClientEvents> }> = async (fastify, opts) => {
  const io = opts.io;
  // ...
```

After `insert` in `POST /friends/request`, notify addressee:

```ts
    // Notify addressee in real-time if online
    if (io) {
      const requester = await db('users').where({ id: userId }).select('nickname', 'avatar_url').first().catch(() => null);
      io.to(`user:${addresseeId}`).emit('friend:request_received', {
        friendshipId,
        fromNick: requester?.nickname ?? 'Někdo',
        fromAvatarUrl: requester?.avatar_url ?? null,
      });
    }
```

After `update` in `POST /friends/accept/:id`, notify requester:

```ts
    if (io) {
      const accepter = await db('users').where({ id: userId }).select('nickname', 'avatar_url').first().catch(() => null);
      io.to(`user:${row.requester_id}`).emit('friend:request_accepted', {
        friendshipId: id,
        byNick: accepter?.nickname ?? 'Někdo',
        byAvatarUrl: accepter?.avatar_url ?? null,
      });
    }
```

Update route registration in `index.ts`:

```ts
await app.register(friendsRoutes, { prefix: '/api', io });
```

**Step 4: Run tests**

```bash
npm test --workspace=packages/backend 2>&1 | grep -E "Test Files|Tests|FAIL"
```

Expected: all green (tests mock `io` as undefined — notifications are skipped silently)

**Step 5: Commit**

```bash
git add packages/backend/src/socket/friendHandlers.ts packages/backend/src/routes/friends.ts packages/backend/src/index.ts
git commit -m "feat(backend): add friend socket handlers and real-time notifications"
```

---

### Task 5: Frontend — install qrcode package

**Files:**
- Modify: `packages/frontend/package.json`

**Step 1: Install qrcode**

```bash
npm install qrcode --workspace=packages/frontend
npm install -D @types/qrcode --workspace=packages/frontend
```

**Step 2: Commit**

```bash
git add packages/frontend/package.json package-lock.json
git commit -m "chore(frontend): add qrcode dependency"
```

---

### Task 6: Frontend — friendsStore

**Files:**
- Create: `packages/frontend/src/stores/friendsStore.ts`

**Step 1: Create store**

```ts
import { defineStore } from 'pinia';
import { ref } from 'vue';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';

export interface FriendEntry {
  friendshipId: number;
  userId: number;
  nickname: string;
  avatarUrl: string | null;
}

export interface FriendRequest {
  friendshipId: number;
  fromUserId: number;
  fromNick: string;
  fromAvatarUrl: string | null;
}

export const useFriendsStore = defineStore('friends', () => {
  const friends = ref<FriendEntry[]>([]);
  const requests = ref<FriendRequest[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchFriends() {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch(`${BACKEND_URL}/api/friends`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      friends.value = await res.json();
    } catch {
      error.value = 'Nepodařilo se načíst přátele.';
    } finally {
      loading.value = false;
    }
  }

  async function fetchRequests() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/friends/requests`, { credentials: 'include' });
      if (res.ok) requests.value = await res.json();
    } catch { /* silent */ }
  }

  async function sendRequest(addresseeId: number): Promise<string | null> {
    const res = await fetch(`${BACKEND_URL}/api/friends/request`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ addresseeId }),
    });
    if (res.status === 201) return null;
    const body = await res.json().catch(() => ({}));
    return body.error ?? 'Chyba při odesílání žádosti.';
  }

  async function acceptRequest(friendshipId: number) {
    const res = await fetch(`${BACKEND_URL}/api/friends/accept/${friendshipId}`, {
      method: 'POST',
      credentials: 'include',
    });
    if (res.ok) {
      const req = requests.value.find(r => r.friendshipId === friendshipId);
      if (req) {
        requests.value = requests.value.filter(r => r.friendshipId !== friendshipId);
        friends.value.push({
          friendshipId,
          userId: req.fromUserId,
          nickname: req.fromNick,
          avatarUrl: req.fromAvatarUrl,
        });
      }
    }
  }

  async function rejectOrRemove(friendshipId: number) {
    const res = await fetch(`${BACKEND_URL}/api/friends/${friendshipId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) {
      requests.value = requests.value.filter(r => r.friendshipId !== friendshipId);
      friends.value = friends.value.filter(f => f.friendshipId !== friendshipId);
    }
  }

  function inviteToGame(friendUserId: number, roomCode: string) {
    // Emitted via socket — handled in component using useSocket
    return { friendUserId, roomCode };
  }

  // Called from socket event listener to update store reactively
  function addIncomingRequest(req: FriendRequest) {
    if (!requests.value.find(r => r.friendshipId === req.friendshipId)) {
      requests.value.unshift(req);
    }
  }

  function markRequestAccepted(friendshipId: number, friend: FriendEntry) {
    requests.value = requests.value.filter(r => r.friendshipId !== friendshipId);
    if (!friends.value.find(f => f.friendshipId === friendshipId)) {
      friends.value.push(friend);
    }
  }

  return {
    friends, requests, loading, error,
    fetchFriends, fetchRequests, sendRequest,
    acceptRequest, rejectOrRemove, inviteToGame,
    addIncomingRequest, markRequestAccepted,
  };
});
```

**Step 2: Commit**

```bash
git add packages/frontend/src/stores/friendsStore.ts
git commit -m "feat(frontend): add friendsStore"
```

---

### Task 7: Frontend — simple toast composable

**Files:**
- Create: `packages/frontend/src/composables/useToast.ts`
- Create: `packages/frontend/src/components/ToastContainer.vue`

**Step 1: Create useToast**

`packages/frontend/src/composables/useToast.ts`:

```ts
import { ref } from 'vue';

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; fn: () => void };
  type: 'info' | 'success';
}

const toasts = ref<Toast[]>([]);
let nextId = 1;

export function useToast() {
  function show(message: string, opts?: { action?: Toast['action']; type?: Toast['type']; duration?: number }) {
    const id = nextId++;
    toasts.value.push({ id, message, action: opts?.action, type: opts?.type ?? 'info' });
    setTimeout(() => dismiss(id), opts?.duration ?? 8000);
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }

  return { toasts, show, dismiss };
}
```

**Step 2: Create ToastContainer**

`packages/frontend/src/components/ToastContainer.vue`:

```vue
<script setup lang="ts">
import { useToast } from '../composables/useToast';
const { toasts, dismiss } = useToast();
</script>

<template>
  <div class="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="pointer-events-auto flex items-start gap-3 bg-gray-800 border border-white/10 rounded-2xl px-4 py-3 shadow-2xl"
    >
      <p class="flex-1 text-sm text-white leading-snug">{{ toast.message }}</p>
      <div class="flex items-center gap-2 shrink-0">
        <button
          v-if="toast.action"
          @click="toast.action!.fn(); dismiss(toast.id)"
          class="text-xs font-bold text-yellow-400 hover:text-yellow-300 transition-colors"
        >
          {{ toast.action.label }}
        </button>
        <button @click="dismiss(toast.id)" class="text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none">&times;</button>
      </div>
    </div>
  </div>
</template>
```

**Step 3: Add ToastContainer to App.vue**

In `packages/frontend/src/App.vue`, add import:

```ts
import ToastContainer from './components/ToastContainer.vue';
```

Add at the end of template (inside `<template>`, as last element):

```html
<ToastContainer />
```

**Step 4: Commit**

```bash
git add packages/frontend/src/composables/useToast.ts packages/frontend/src/components/ToastContainer.vue packages/frontend/src/App.vue
git commit -m "feat(frontend): add toast notification system"
```

---

### Task 8: Frontend — global friend socket listeners in App.vue

**Files:**
- Modify: `packages/frontend/src/App.vue`

**Step 1: Add friend event listeners**

In `App.vue`, add these imports:

```ts
import { useFriendsStore } from './stores/friendsStore';
import { useRouter } from 'vue-router';
import { useToast } from './composables/useToast';
```

In `onMounted`, after `await profileStore.init()`, add:

```ts
  const friendsStore = useFriendsStore();
  const { show } = useToast();
  const router = useRouter();

  socket.on('friend:request_received', (data) => {
    friendsStore.addIncomingRequest({
      friendshipId: data.friendshipId,
      fromUserId: 0, // not needed for toast
      fromNick: data.fromNick,
      fromAvatarUrl: data.fromAvatarUrl,
    });
    show(`${data.fromNick} tě chce přidat mezi přátele`, {
      action: { label: 'Zobrazit', fn: () => router.push('/friends') },
    });
  });

  socket.on('friend:request_accepted', (data) => {
    show(`${data.byNick} přijal(a) tvou žádost o přátelství`, { type: 'success' });
    friendsStore.fetchFriends();
  });

  socket.on('friend:invite_received', (data) => {
    show(`${data.fromNick} tě zve ke stolu`, {
      action: { label: 'Připojit se', fn: () => router.push(`/room/${data.roomCode}`) },
      duration: 15000,
    });
  });
```

In `onUnmounted`, add cleanup:

```ts
  socket.off('friend:request_received');
  socket.off('friend:request_accepted');
  socket.off('friend:invite_received');
```

**Step 2: Commit**

```bash
git add packages/frontend/src/App.vue
git commit -m "feat(frontend): listen to friend socket events in App.vue"
```

---

### Task 9: Frontend — FriendCard + FriendRequestCard components

**Files:**
- Create: `packages/frontend/src/components/FriendCard.vue`
- Create: `packages/frontend/src/components/FriendRequestCard.vue`

**Step 1: FriendCard.vue**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoomStore } from '../stores/roomStore';
import { socket } from '../socket';
import type { FriendEntry } from '../stores/friendsStore';

const props = defineProps<{ friend: FriendEntry }>();
const emit = defineEmits<{ (e: 'remove', id: number): void }>();

const { t } = useI18n();
const roomStore = useRoomStore();

const canInvite = computed(() =>
  roomStore.room !== null && roomStore.room.status === 'LOBBY'
);

function invite() {
  if (!roomStore.room) return;
  socket.emit('friend:invite', {
    friendUserId: props.friend.userId,
    roomCode: roomStore.room.code,
  });
}
</script>

<template>
  <div class="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl p-4">
    <img
      :src="friend.avatarUrl ?? `https://api.dicebear.com/9.x/bottts/svg?seed=${friend.nickname}`"
      :alt="friend.nickname"
      class="w-10 h-10 rounded-full bg-gray-700 object-cover"
    />
    <span class="flex-1 text-sm font-semibold text-white truncate">{{ friend.nickname }}</span>
    <button
      v-if="canInvite"
      @click="invite"
      class="text-xs font-bold text-yellow-400 hover:text-yellow-300 transition-colors px-2 py-1"
    >
      {{ t('friends.invite') }}
    </button>
    <button
      @click="emit('remove', friend.friendshipId)"
      class="text-xs text-gray-500 hover:text-red-400 transition-colors px-2 py-1"
    >
      {{ t('friends.remove') }}
    </button>
  </div>
</template>
```

**Step 2: FriendRequestCard.vue**

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { FriendRequest } from '../stores/friendsStore';

const props = defineProps<{ request: FriendRequest }>();
const emit = defineEmits<{
  (e: 'accept', id: number): void;
  (e: 'reject', id: number): void;
}>();

const { t } = useI18n();
</script>

<template>
  <div class="flex items-center gap-3 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4">
    <img
      :src="request.fromAvatarUrl ?? `https://api.dicebear.com/9.x/bottts/svg?seed=${request.fromNick}`"
      :alt="request.fromNick"
      class="w-10 h-10 rounded-full bg-gray-700 object-cover"
    />
    <span class="flex-1 text-sm font-semibold text-white truncate">{{ request.fromNick }}</span>
    <button
      @click="emit('accept', request.friendshipId)"
      class="text-xs font-bold text-green-400 hover:text-green-300 transition-colors px-2 py-1"
    >
      {{ t('friends.accept') }}
    </button>
    <button
      @click="emit('reject', request.friendshipId)"
      class="text-xs text-gray-500 hover:text-red-400 transition-colors px-2 py-1"
    >
      {{ t('friends.reject') }}
    </button>
  </div>
</template>
```

**Step 3: Commit**

```bash
git add packages/frontend/src/components/FriendCard.vue packages/frontend/src/components/FriendRequestCard.vue
git commit -m "feat(frontend): add FriendCard and FriendRequestCard components"
```

---

### Task 10: Frontend — FriendsView.vue

**Files:**
- Modify: `packages/frontend/src/views/FriendsView.vue`

**Step 1: Replace the placeholder**

```vue
<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import QRCode from 'qrcode';
import { useProfileStore } from '../stores/profileStore';
import { useFriendsStore } from '../stores/friendsStore';
import { useToast } from '../composables/useToast';
import FriendCard from '../components/FriendCard.vue';
import FriendRequestCard from '../components/FriendRequestCard.vue';

const router = useRouter();
const { t } = useI18n();
const profileStore = useProfileStore();
const friendsStore = useFriendsStore();
const { show } = useToast();

const showQR = ref(false);
const qrDataUrl = ref('');

const profileUrl = computed(() =>
  `${window.location.origin}/add-friend/${profileStore.oauthUser?.id}`
);

onMounted(async () => {
  await Promise.all([friendsStore.fetchFriends(), friendsStore.fetchRequests()]);
});

async function copyLink() {
  await navigator.clipboard.writeText(profileUrl.value);
  show(t('common.copied'), { type: 'success', duration: 2000 });
}

async function toggleQR() {
  if (!showQR.value) {
    qrDataUrl.value = await QRCode.toDataURL(profileUrl.value, { width: 200, margin: 2 });
  }
  showQR.value = !showQR.value;
}
</script>

<template>
  <div class="max-w-2xl mx-auto pt-8 pb-12 px-4">
    <!-- Back -->
    <button @click="router.push('/')" class="text-sm text-gray-500 hover:text-gray-300 mb-6 flex items-center gap-1 transition-colors">
      &larr; {{ t('common.back') }}
    </button>

    <h1 class="text-2xl font-black uppercase tracking-tighter text-white mb-8">
      {{ t('friends.title') }}
    </h1>

    <!-- Incoming requests -->
    <section v-if="friendsStore.requests.length > 0" class="mb-8">
      <h2 class="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
        {{ t('friends.pendingRequests') }}
      </h2>
      <div class="flex flex-col gap-2">
        <FriendRequestCard
          v-for="req in friendsStore.requests"
          :key="req.friendshipId"
          :request="req"
          @accept="friendsStore.acceptRequest($event)"
          @reject="friendsStore.rejectOrRemove($event)"
        />
      </div>
    </section>

    <!-- Friends list -->
    <section class="mb-8">
      <h2 class="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
        {{ t('friends.myFriends') }}
      </h2>
      <div v-if="friendsStore.loading" class="text-gray-500 text-sm">{{ t('common.loading') }}</div>
      <p v-else-if="friendsStore.friends.length === 0" class="text-gray-500 text-sm">
        {{ t('friends.noFriends') }}
      </p>
      <div v-else class="flex flex-col gap-2">
        <FriendCard
          v-for="friend in friendsStore.friends"
          :key="friend.friendshipId"
          :friend="friend"
          @remove="friendsStore.rejectOrRemove($event)"
        />
      </div>
    </section>

    <!-- Add friend -->
    <section>
      <h2 class="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
        {{ t('friends.addFriend') }}
      </h2>
      <p class="text-sm text-gray-400 mb-4">{{ t('friends.addFriendHint') }}</p>
      <div class="flex gap-2 flex-wrap">
        <button
          @click="copyLink"
          class="bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-semibold rounded-xl px-4 py-2 transition-colors"
        >
          {{ t('friends.copyProfileLink') }}
        </button>
        <button
          @click="toggleQR"
          class="bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-semibold rounded-xl px-4 py-2 transition-colors"
        >
          {{ showQR ? t('friends.hideQR') : t('friends.showQR') }}
        </button>
      </div>
      <div v-if="showQR" class="mt-4 inline-block p-3 bg-white rounded-2xl">
        <img :src="qrDataUrl" alt="QR kód" class="w-40 h-40" />
      </div>
    </section>
  </div>
</template>
```

**Step 2: Add `common.back` to i18n** (checked in next task)

**Step 3: Commit**

```bash
git add packages/frontend/src/views/FriendsView.vue
git commit -m "feat(frontend): implement FriendsView"
```

---

### Task 11: Frontend — AddFriendView.vue

**Files:**
- Create: `packages/frontend/src/views/AddFriendView.vue`
- Modify: `packages/frontend/src/router/index.ts`

**Step 1: Create AddFriendView.vue**

```vue
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useProfileStore } from '../stores/profileStore';
import { useFriendsStore } from '../stores/friendsStore';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const profileStore = useProfileStore();
const friendsStore = useFriendsStore();

const userId = Number(route.params.userId);

interface PublicProfile {
  id: number;
  nickname: string;
  avatarUrl: string | null;
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';

const profile = ref<PublicProfile | null>(null);
const notFound = ref(false);
const sending = ref(false);
const sent = ref(false);
const sendError = ref<string | null>(null);

const isSelf = computed(() => profileStore.oauthUser?.id === userId);

onMounted(async () => {
  await profileStore.init();
  try {
    const res = await fetch(`${BACKEND_URL}/api/users/${userId}/public`);
    if (res.status === 404) { notFound.value = true; return; }
    if (!res.ok) throw new Error();
    profile.value = await res.json();
  } catch {
    notFound.value = true;
  }
});

async function sendRequest() {
  if (!profileStore.isAuthenticated) {
    router.push('/');
    return;
  }
  sending.value = true;
  sendError.value = null;
  const error = await friendsStore.sendRequest(userId);
  sending.value = false;
  if (error) {
    sendError.value = error;
  } else {
    sent.value = true;
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4">
    <div class="max-w-sm w-full bg-gray-800 border border-white/10 rounded-3xl p-8 text-center">

      <div v-if="notFound" class="text-gray-400">
        <p class="text-4xl mb-4">🤷</p>
        <p class="font-bold text-white mb-2">{{ t('friends.userNotFound') }}</p>
        <button @click="router.push('/')" class="text-sm text-yellow-400 hover:underline mt-4">
          {{ t('common.backToHome') }}
        </button>
      </div>

      <template v-else-if="profile">
        <img
          :src="profile.avatarUrl ?? `https://api.dicebear.com/9.x/bottts/svg?seed=${profile.nickname}`"
          :alt="profile.nickname"
          class="w-20 h-20 rounded-full mx-auto mb-4 object-cover bg-gray-700"
        />
        <h1 class="text-xl font-black text-white mb-6">{{ profile.nickname }}</h1>

        <!-- Self -->
        <p v-if="isSelf" class="text-sm text-gray-400">{{ t('friends.cantAddSelf') }}</p>

        <!-- Not authenticated -->
        <div v-else-if="!profileStore.isAuthenticated" class="space-y-3">
          <p class="text-sm text-gray-400">{{ t('friends.loginToAdd') }}</p>
          <button @click="router.push('/')" class="bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-xl px-6 py-2.5 transition-colors w-full">
            {{ t('friends.goLogin') }}
          </button>
        </div>

        <!-- Sent -->
        <div v-else-if="sent">
          <p class="text-green-400 font-bold">{{ t('friends.requestSent') }} ✓</p>
        </div>

        <!-- Send button -->
        <div v-else class="space-y-3">
          <p v-if="sendError" class="text-sm text-red-400">{{ sendError }}</p>
          <button
            @click="sendRequest"
            :disabled="sending"
            class="bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-bold rounded-xl px-6 py-2.5 transition-colors w-full"
          >
            {{ sending ? t('common.loading') : t('friends.sendRequest') }}
          </button>
        </div>
      </template>

      <div v-else class="text-gray-400 text-sm">{{ t('common.loading') }}</div>

    </div>
  </div>
</template>
```

**Step 2: Add router entry**

In `packages/frontend/src/router/index.ts`, add:

```ts
{
  path: '/add-friend/:userId',
  component: () => import('../views/AddFriendView.vue'),
  // public — no requiresAuth
},
```

**Step 3: Commit**

```bash
git add packages/frontend/src/views/AddFriendView.vue packages/frontend/src/router/index.ts
git commit -m "feat(frontend): add AddFriendView and /add-friend/:userId route"
```

---

### Task 12: i18n — add friends keys to all 5 locales

**Files:**
- Modify: `packages/frontend/src/i18n/locales/cs.json`
- Modify: `packages/frontend/src/i18n/locales/en.json`
- Modify: `packages/frontend/src/i18n/locales/ru.json`
- Modify: `packages/frontend/src/i18n/locales/uk.json`
- Modify: `packages/frontend/src/i18n/locales/es.json`

**Step 1: Keys to add to each locale**

Add `"back": "Zpět"` and `"backToHome": "Zpět na hlavní stránku"` to `"common"` section.

Add `"friends"` section:

**cs.json:**
```json
"friends": {
  "title": "Přátelé",
  "myFriends": "Moji přátelé",
  "noFriends": "Zatím žádní přátelé.",
  "pendingRequests": "Žádosti o přátelství",
  "addFriend": "Přidat přítele",
  "addFriendHint": "Sdílej svůj odkaz — přítel na něj klikne a pošle ti žádost.",
  "copyProfileLink": "Kopírovat odkaz",
  "showQR": "Zobrazit QR kód",
  "hideQR": "Skrýt QR kód",
  "invite": "Pozvat do hry",
  "remove": "Odebrat",
  "accept": "Přijmout",
  "reject": "Odmítnout",
  "sendRequest": "Poslat žádost o přátelství",
  "requestSent": "Žádost odeslána",
  "userNotFound": "Uživatel nenalezen.",
  "cantAddSelf": "To jsi ty!",
  "loginToAdd": "Přihlas se, abys mohl(a) posílat žádosti o přátelství.",
  "goLogin": "Přihlásit se"
}
```

**en.json:**
```json
"friends": {
  "title": "Friends",
  "myFriends": "My friends",
  "noFriends": "No friends yet.",
  "pendingRequests": "Friend requests",
  "addFriend": "Add friend",
  "addFriendHint": "Share your link — your friend clicks it and sends you a request.",
  "copyProfileLink": "Copy link",
  "showQR": "Show QR code",
  "hideQR": "Hide QR code",
  "invite": "Invite to game",
  "remove": "Remove",
  "accept": "Accept",
  "reject": "Decline",
  "sendRequest": "Send friend request",
  "requestSent": "Request sent",
  "userNotFound": "User not found.",
  "cantAddSelf": "That's you!",
  "loginToAdd": "Log in to send friend requests.",
  "goLogin": "Log in"
}
```

**ru.json, uk.json, es.json:** Add equivalent translations (use English as fallback for now, update later).

**Step 2: Add `common.back` and `common.backToHome` to all locales**

In each locale's `"common"` section add:
- cs: `"back": "Zpět"`, `"backToHome": "Zpět na hlavní stránku"`
- en: `"back": "Back"`, `"backToHome": "Back to home"`
- ru/uk/es: match language appropriately

**Step 3: Commit**

```bash
git add packages/frontend/src/i18n/locales/
git commit -m "feat(i18n): add friends translations to all locales"
```

---

### Task 13: Final check + run all tests

**Step 1: Run backend tests**

```bash
npm test --workspace=packages/backend 2>&1 | grep -E "Test Files|Tests|FAIL"
```

Expected: all green

**Step 2: Build frontend (check for TypeScript errors)**

```bash
npm run build --workspace=packages/frontend 2>&1 | tail -10
```

Expected: exits 0

**Step 3: Rebuild shared to ensure types up to date**

```bash
npm run build --workspace=packages/shared
```

**Step 4: Commit any fixups, then create final summary commit if needed**

---

### Task 14: Finish — merge or PR

Use `superpowers:finishing-a-development-branch` skill to decide how to integrate.
