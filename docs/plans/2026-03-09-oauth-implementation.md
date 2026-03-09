# OAuth Implementation Plan (Google & Discord)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Volitelné přihlášení přes Google a Discord — localStorage/host hráči a OAuth hráči hrají spolu beze změny herní logiky.

**Architecture:** Player token zůstane universálním herním identifikátorem pro všechny. OAuth session (httpOnly JWT cookie) sedí vedle jako samostatná vrstva pro persistentní DB profil. Herní logika (RoomManager, GameEngine) se nemění.

**Tech Stack:** `@fastify/oauth2`, `@fastify/cookie`, `jsonwebtoken` na backendu; Vue 3 + Pinia na frontendu; Knex migration pro nové tabulky.

---

## Task 1: Nainstaluj backend závislosti

**Files:**
- Modify: `packages/backend/package.json`

**Step 1: Nainstaluj balíčky**

```bash
npm install @fastify/oauth2 @fastify/cookie jsonwebtoken --workspace=packages/backend
npm install --save-dev @types/jsonwebtoken --workspace=packages/backend
```

**Step 2: Ověř instalaci**

```bash
cat packages/backend/package.json | grep -E "oauth2|cookie|jsonwebtoken"
```

Expected: všechny tři balíčky viditelné v dependencies.

**Step 3: Commit**

```bash
git add packages/backend/package.json package-lock.json
git commit -m "chore: add @fastify/oauth2, @fastify/cookie, jsonwebtoken to backend"
```

---

## Task 2: DB migrace — tabulky users + user_player_tokens

**Files:**
- Create: `packages/backend/src/db/migrations/20260309100000_oauth_users.ts`

**Step 1: Vytvoř migraci**

```ts
// packages/backend/src/db/migrations/20260309100000_oauth_users.ts
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.enum('provider', ['google', 'discord']).notNullable();
    table.string('provider_id', 255).notNullable();
    table.string('nickname', 50).nullable();
    table.string('locale', 5).defaultTo('cs');
    table.enum('avatar_type', ['oauth', 'dicebear']).defaultTo('oauth');
    table.text('avatar_url').nullable();
    table.string('dicebear_style', 50).nullable();
    table.string('dicebear_seed', 100).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.unique(['provider', 'provider_id']);
  });

  await knex.schema.createTable('user_player_tokens', (table) => {
    table.integer('user_id').unsigned().notNullable();
    table.string('player_token', 36).notNullable();
    table.string('room_code', 6).notNullable();
    table.timestamp('last_seen').defaultTo(knex.fn.now());
    table.primary(['player_token', 'room_code']);
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_player_tokens');
  await knex.schema.dropTableIfExists('users');
}
```

**Step 2: Spusť migraci**

```bash
npm run migrate --workspace=packages/backend
```

Expected: `Batch 5 run: 1 migrations` (nebo aktuální batch číslo).

**Step 3: Commit**

```bash
git add packages/backend/src/db/migrations/20260309100000_oauth_users.ts
git commit -m "feat: add users and user_player_tokens migration"
```

---

## Task 3: JWT utility modul

**Files:**
- Create: `packages/backend/src/auth/jwt.ts`

**Step 1: Vytvoř JWT utility**

```ts
// packages/backend/src/auth/jwt.ts
import jwt from 'jsonwebtoken';

export interface JwtPayload {
  userId: number;
  provider: 'google' | 'discord';
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '30d' });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
  } catch {
    return null;
  }
}

export function extractUserIdFromCookieHeader(cookieHeader: string): number | null {
  const match = cookieHeader.match(/kpl_token=([^;]+)/);
  if (!match) return null;
  return verifyToken(decodeURIComponent(match[1]))?.userId ?? null;
}
```

**Step 2: Commit**

```bash
git add packages/backend/src/auth/jwt.ts
git commit -m "feat: add JWT sign/verify utility"
```

---

## Task 4: Auth routes — napiš failing testy

**Files:**
- Create: `packages/backend/src/routes/auth.test.ts`

**Step 1: Napiš testy**

```ts
// packages/backend/src/routes/auth.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import authRoutes from './auth.js';
import { signToken } from '../auth/jwt.js';

vi.mock('../db/db.js', () => ({
  default: vi.fn(),
}));

import db from '../db/db.js';
const mockDb = db as unknown as ReturnType<typeof vi.fn>;

const TEST_USER = {
  id: 1,
  provider: 'google',
  provider_id: 'g123',
  nickname: 'Testík',
  locale: 'cs',
  avatar_type: 'oauth',
  avatar_url: 'https://example.com/avatar.jpg',
  dicebear_style: null,
  dicebear_seed: null,
};

describe('Auth routes', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.resetAllMocks();
    process.env.JWT_SECRET = 'test-secret-min-32-chars-long-123';
    app = Fastify({ logger: false });
    await app.register(cookie);
    await app.register(authRoutes);
    await app.ready();
  });

  describe('GET /api/me', () => {
    it('returns 401 when no cookie', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/me' });
      expect(res.statusCode).toBe(401);
    });

    it('returns 200 with user when valid JWT cookie', async () => {
      const token = signToken({ userId: 1, provider: 'google' });
      mockDb.mockReturnValue({
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(TEST_USER),
      });
      const res = await app.inject({
        method: 'GET',
        url: '/api/me',
        headers: { cookie: `kpl_token=${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe(1);
      expect(body.nickname).toBe('Testík');
      expect(body.provider).toBe('google');
    });

    it('returns 401 when JWT is tampered', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/me',
        headers: { cookie: 'kpl_token=notavalidjwt' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('PATCH /api/me', () => {
    it('returns 401 when no cookie', async () => {
      const res = await app.inject({
        method: 'PATCH', url: '/api/me',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ nickname: 'X' }),
      });
      expect(res.statusCode).toBe(401);
    });

    it('updates user and returns updated data', async () => {
      const token = signToken({ userId: 1, provider: 'google' });
      const updated = { ...TEST_USER, nickname: 'Nový', locale: 'en' };
      mockDb.mockReturnValue({
        where: vi.fn().mockReturnThis(),
        update: vi.fn().mockResolvedValue(1),
        first: vi.fn().mockResolvedValue(updated),
      });
      const res = await app.inject({
        method: 'PATCH', url: '/api/me',
        headers: {
          cookie: `kpl_token=${token}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({ nickname: 'Nový', locale: 'en' }),
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).nickname).toBe('Nový');
    });
  });

  describe('POST /auth/logout', () => {
    it('clears cookie and returns 200', async () => {
      const res = await app.inject({ method: 'POST', url: '/auth/logout' });
      expect(res.statusCode).toBe(200);
      const setCookie = res.headers['set-cookie'] as string;
      expect(setCookie).toMatch(/kpl_token=;/);
    });
  });
});
```

**Step 2: Ověř, že testy padají**

```bash
npm test --workspace=packages/backend
```

Expected: FAIL — `Cannot find module './auth.js'`

**Step 3: Commit**

```bash
git add packages/backend/src/routes/auth.test.ts
git commit -m "test: add failing tests for auth routes"
```

---

## Task 5: Auth routes — implementace (GET /api/me, PATCH /api/me, POST /auth/logout)

**Files:**
- Create: `packages/backend/src/routes/auth.ts`

**Step 1: Vytvoř routes**

```ts
// packages/backend/src/routes/auth.ts
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import db from '../db/db.js';
import { verifyToken } from '../auth/jwt.js';

export interface UserRow {
  id: number;
  provider: string;
  provider_id: string;
  nickname: string | null;
  locale: string;
  avatar_type: 'oauth' | 'dicebear';
  avatar_url: string | null;
  dicebear_style: string | null;
  dicebear_seed: string | null;
}

async function verifyJwt(request: FastifyRequest, reply: FastifyReply) {
  const token = (request.headers.cookie ?? '').match(/kpl_token=([^;]+)/)?.[1];
  if (!token) return reply.status(401).send({ error: 'Unauthorized' });
  const payload = verifyToken(decodeURIComponent(token));
  if (!payload) return reply.status(401).send({ error: 'Unauthorized' });
  (request as FastifyRequest & { jwtUser: { userId: number; provider: string } }).jwtUser = payload;
}

function formatUser(user: UserRow) {
  return {
    id: user.id,
    provider: user.provider,
    nickname: user.nickname,
    locale: user.locale,
    avatarType: user.avatar_type,
    avatarUrl: user.avatar_url,
    dicebearStyle: user.dicebear_style,
    dicebearSeed: user.dicebear_seed,
  };
}

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/me', { preHandler: verifyJwt }, async (request, reply) => {
    const { userId } = (request as any).jwtUser;
    const user = await db<UserRow>('users').where({ id: userId }).first();
    if (!user) return reply.status(404).send({ error: 'User not found' });
    return formatUser(user);
  });

  fastify.patch('/api/me', { preHandler: verifyJwt }, async (request, reply) => {
    const { userId } = (request as any).jwtUser;
    const body = request.body as {
      nickname?: string;
      locale?: string;
      avatarType?: 'oauth' | 'dicebear';
      dicebearStyle?: string | null;
      dicebearSeed?: string | null;
    };
    const updates: Partial<UserRow> = {};
    if (body.nickname !== undefined) updates.nickname = body.nickname.trim().slice(0, 50) || null;
    if (body.locale !== undefined) updates.locale = body.locale.slice(0, 5);
    if (body.avatarType !== undefined) updates.avatar_type = body.avatarType;
    if (body.dicebearStyle !== undefined) updates.dicebear_style = body.dicebearStyle;
    if (body.dicebearSeed !== undefined) updates.dicebear_seed = body.dicebearSeed?.slice(0, 100) ?? null;
    await db('users').where({ id: userId }).update(updates);
    const user = await db<UserRow>('users').where({ id: userId }).first();
    return formatUser(user!);
  });

  fastify.post('/auth/logout', async (_request, reply) => {
    reply.clearCookie('kpl_token', { path: '/' });
    return { ok: true };
  });
};

export default authRoutes;
```

**Step 2: Spusť testy**

```bash
npm test --workspace=packages/backend
```

Expected: auth.test.ts testy procházejí, ostatní testy stále zelené. Celkem 113+ testů passing.

**Step 3: Commit**

```bash
git add packages/backend/src/routes/auth.ts
git commit -m "feat: implement GET /api/me, PATCH /api/me, POST /auth/logout"
```

---

## Task 6: Registrace OAuth2 a cookie pluginů v index.ts

**Files:**
- Modify: `packages/backend/src/index.ts`

**Step 1: Uprav index.ts**

Přidej importy za stávající importy:

```ts
import cookie from '@fastify/cookie';
import oauth2Plugin from '@fastify/oauth2';
import authRoutes from './routes/auth.js';
```

Uprav CORS registraci — přidej `credentials: true`:

```ts
await app.register(cors, {
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  credentials: true,
});
```

Za CORS registrací přidej nové pluginy (PŘED route registracemi):

```ts
const PUBLIC_BACKEND_URL = process.env.PUBLIC_BACKEND_URL ?? 'http://localhost:3000';

await app.register(cookie);

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  await app.register(oauth2Plugin, {
    name: 'googleOAuth2',
    scope: ['openid', 'profile', 'email'],
    credentials: {
      client: {
        id: process.env.GOOGLE_CLIENT_ID,
        secret: process.env.GOOGLE_CLIENT_SECRET,
      },
      auth: (oauth2Plugin as any).GOOGLE_CONFIGURATION,
    },
    startRedirectPath: '/auth/google',
    callbackUri: `${PUBLIC_BACKEND_URL}/auth/google/callback`,
    callbackUriParams: { access_type: 'online' },
  });
}

if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
  await app.register(oauth2Plugin, {
    name: 'discordOAuth2',
    scope: ['identify'],
    credentials: {
      client: {
        id: process.env.DISCORD_CLIENT_ID,
        secret: process.env.DISCORD_CLIENT_SECRET,
      },
      auth: {
        authorizeHost: 'https://discord.com',
        authorizePath: '/api/oauth2/authorize',
        tokenHost: 'https://discord.com',
        tokenPath: '/api/oauth2/token',
      },
    },
    startRedirectPath: '/auth/discord',
    callbackUri: `${PUBLIC_BACKEND_URL}/auth/discord/callback`,
  });
}

await app.register(authRoutes);
```

Uprav Socket.io CORS — přidej `credentials: true`:

```ts
const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
  cors: {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  },
});
```

**Step 2: Spusť backend a ověř startu**

```bash
npm run dev:backend
```

Expected: server startuje bez chyb. `GET /auth/google` bude fungovat pouze pokud jsou nastaveny env proměnné.

**Step 3: Commit**

```bash
git add packages/backend/src/index.ts
git commit -m "feat: register oauth2, cookie plugins and auth routes in index.ts"
```

---

## Task 7: Google OAuth callback

**Files:**
- Modify: `packages/backend/src/routes/auth.ts`

**Step 1: Přidej Google callback do authRoutes**

Za `fastify.post('/auth/logout', ...)` přidej:

```ts
  fastify.get('/auth/google/callback', async (request, reply) => {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    try {
      const { token } = await (fastify as any).googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch Google user info');
      const googleUser = await res.json() as { sub: string; picture?: string };

      const existing = await db<UserRow>('users')
        .where({ provider: 'google', provider_id: googleUser.sub })
        .first();

      let userId: number;
      let isNew = false;

      if (existing) {
        await db('users').where({ id: existing.id }).update({ avatar_url: googleUser.picture ?? null });
        userId = existing.id;
      } else {
        const [insertedId] = await db('users').insert({
          provider: 'google',
          provider_id: googleUser.sub,
          avatar_url: googleUser.picture ?? null,
        });
        userId = insertedId;
        isNew = true;
      }

      setJwtCookie(reply, { userId, provider: 'google' });
      return reply.redirect(`${frontendUrl}/?auth=${isNew ? 'new' : 'success'}`);
    } catch (err) {
      fastify.log.error(err, 'Google OAuth callback failed');
      return reply.redirect(`${frontendUrl}/?auth=error`);
    }
  });
```

Přidej helper `setJwtCookie` na začátek souboru (za importy):

```ts
import { verifyToken, signToken } from '../auth/jwt.js';

function setJwtCookie(reply: FastifyReply, payload: { userId: number; provider: 'google' | 'discord' }) {
  const token = signToken(payload);
  reply.setCookie('kpl_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });
}
```

**Step 2: Spusť testy**

```bash
npm test --workspace=packages/backend
```

Expected: všechny testy stále zelené.

**Step 3: Commit**

```bash
git add packages/backend/src/routes/auth.ts
git commit -m "feat: add Google OAuth callback handler"
```

---

## Task 8: Discord OAuth callback

**Files:**
- Modify: `packages/backend/src/routes/auth.ts`

**Step 1: Přidej Discord callback**

Za Google callback přidej:

```ts
  fastify.get('/auth/discord/callback', async (request, reply) => {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    try {
      const { token } = await (fastify as any).discordOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);
      const res = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch Discord user info');
      const discordUser = await res.json() as { id: string; avatar?: string };
      const avatarUrl = discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=256`
        : null;

      const existing = await db<UserRow>('users')
        .where({ provider: 'discord', provider_id: discordUser.id })
        .first();

      let userId: number;
      let isNew = false;

      if (existing) {
        await db('users').where({ id: existing.id }).update({ avatar_url: avatarUrl });
        userId = existing.id;
      } else {
        const [insertedId] = await db('users').insert({
          provider: 'discord',
          provider_id: discordUser.id,
          avatar_url: avatarUrl,
        });
        userId = insertedId;
        isNew = true;
      }

      setJwtCookie(reply, { userId, provider: 'discord' });
      return reply.redirect(`${frontendUrl}/?auth=${isNew ? 'new' : 'success'}`);
    } catch (err) {
      fastify.log.error(err, 'Discord OAuth callback failed');
      return reply.redirect(`${frontendUrl}/?auth=error`);
    }
  });
```

**Step 2: Spusť testy**

```bash
npm test --workspace=packages/backend
```

Expected: všechny testy zelené.

**Step 3: Commit**

```bash
git add packages/backend/src/routes/auth.ts
git commit -m "feat: add Discord OAuth callback handler"
```

---

## Task 9: Socket.io — propojení player tokenu s userId

**Files:**
- Modify: `packages/backend/src/socket/lobbyHandlers.ts`

**Step 1: Přidej helper pro uložení user_player_token**

Na začátek `lobbyHandlers.ts` (za stávající importy) přidej:

```ts
import { extractUserIdFromCookieHeader } from '../auth/jwt.js';

async function linkPlayerToken(cookieHeader: string, playerToken: string, roomCode: string) {
  const userId = extractUserIdFromCookieHeader(cookieHeader);
  if (!userId) return;
  try {
    await db('user_player_tokens')
      .insert({ user_id: userId, player_token: playerToken, room_code: roomCode })
      .onConflict(['player_token', 'room_code'])
      .merge({ last_seen: db.fn.now() });
  } catch {
    // non-critical — ignore errors
  }
}
```

**Step 2: Zavolej helper po lobby:create**

V handleru `lobby:create`, za řádkem kde se uloží `playerToken` (po `roomManager.createRoom`), přidej:

```ts
    const cookieHeader = socket.handshake.headers.cookie ?? '';
    linkPlayerToken(cookieHeader, playerToken, room.code).catch(() => {});
```

**Step 3: Zavolej helper po lobby:join**

V handleru `lobby:join`, za řádkem kde se vrací `playerToken` ze `roomManager.joinRoom`, přidej:

```ts
    const cookieHeader = socket.handshake.headers.cookie ?? '';
    linkPlayerToken(cookieHeader, playerToken, room.code).catch(() => {});
```

**Step 4: Spusť testy**

```bash
npm test --workspace=packages/backend
```

Expected: všechny testy zelené.

**Step 5: Commit**

```bash
git add packages/backend/src/socket/lobbyHandlers.ts
git commit -m "feat: link OAuth player tokens to userId on room join/create"
```

---

## Task 10: Frontend — Socket.io withCredentials

**Files:**
- Modify: `packages/frontend/src/socket/index.ts`

**Step 1: Přidej withCredentials**

```ts
export const socket = io<ServerToClientEvents, ClientToServerEvents>(BACKEND_URL, {
  autoConnect: false,
  withCredentials: true,
});
```

**Step 2: Commit**

```bash
git add packages/frontend/src/socket/index.ts
git commit -m "feat: enable withCredentials on socket.io client for JWT cookies"
```

---

## Task 11: Frontend — rozšíření profileStore

**Files:**
- Modify: `packages/frontend/src/stores/profileStore.ts`

**Step 1: Přidej OAuth state a typy**

Celý soubor nahraď tímto (zachovej veškerou stávající logiku, přidej OAuth):

```ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { i18n } from '../i18n';
import { useRoomStore } from './roomStore';

const SUPPORTED_LOCALES = ['cs', 'en', 'ru', 'uk', 'es'] as const;
export type SupportedLocale = typeof SUPPORTED_LOCALES[number];

export interface OAuthUser {
  id: number;
  provider: 'google' | 'discord';
  nickname: string | null;
  locale: string;
  avatarType: 'oauth' | 'dicebear';
  avatarUrl: string | null;
  dicebearStyle: string | null;
  dicebearSeed: string | null;
}

interface PlayerProfile {
  nickname: string;
  locale: SupportedLocale;
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';

export const useProfileStore = defineStore('profile', () => {
  const nickname = ref('');
  const locale = ref<SupportedLocale>('cs');
  const soundMuted = ref(localStorage.getItem('soundMuted') === 'true');
  const isAuthenticated = ref(false);
  const oauthUser = ref<OAuthUser | null>(null);

  const avatarUrl = computed(() => {
    if (isAuthenticated.value && oauthUser.value) {
      if (oauthUser.value.avatarType === 'oauth' && oauthUser.value.avatarUrl) {
        return oauthUser.value.avatarUrl;
      }
      const style = oauthUser.value.dicebearStyle ?? 'bottts';
      const seed = oauthUser.value.dicebearSeed ?? nickname.value || 'default';
      return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}`;
    }
    return `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(nickname.value || 'default')}`;
  });

  const hasProfile = computed(() => nickname.value.trim().length > 0);

  function loadLocale(localeStr: string) {
    if ((SUPPORTED_LOCALES as readonly string[]).includes(localeStr)) {
      locale.value = localeStr as SupportedLocale;
      localStorage.setItem('locale', localeStr);
      (i18n.global.locale as { value: string }).value = localeStr;
    }
  }

  async function init() {
    // Try OAuth session first
    try {
      const res = await fetch(`${BACKEND_URL}/api/me`, { credentials: 'include' });
      if (res.ok) {
        const user = await res.json() as OAuthUser;
        isAuthenticated.value = true;
        oauthUser.value = user;
        if (user.nickname) nickname.value = user.nickname;
        if (user.locale) loadLocale(user.locale);
        return;
      }
    } catch {
      // network error — fall through to localStorage
    }

    // Fall back to localStorage profile
    const raw = localStorage.getItem('playerProfile');
    if (!raw) return;
    try {
      const profile = JSON.parse(raw) as PlayerProfile;
      if (profile.nickname) nickname.value = profile.nickname;
      if (profile.locale) loadLocale(profile.locale);
    } catch {
      // ignore malformed data
    }
  }

  async function save(newNickname: string, newLocale: SupportedLocale): Promise<string | null> {
    const trimmed = newNickname.trim();
    loadLocale(newLocale);

    // Sync nickname to room if currently in one and nickname changed
    const roomStore = useRoomStore();
    if (roomStore.room && trimmed !== nickname.value) {
      const error = await roomStore.updateNickname(trimmed);
      if (error) return error.error;
    }

    nickname.value = trimmed;

    if (isAuthenticated.value) {
      try {
        const res = await fetch(`${BACKEND_URL}/api/me`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            nickname: trimmed,
            locale: newLocale,
            ...(oauthUser.value?.avatarType === 'dicebear' && {
              avatarType: 'dicebear',
              dicebearStyle: oauthUser.value.dicebearStyle,
              dicebearSeed: oauthUser.value.dicebearSeed,
            }),
          }),
        });
        if (res.ok) {
          oauthUser.value = await res.json() as OAuthUser;
        }
      } catch {
        // non-critical — continue
      }
    }

    // Always save to localStorage as fallback
    const profile: PlayerProfile = { nickname: trimmed, locale: newLocale };
    localStorage.setItem('playerProfile', JSON.stringify(profile));
    return null;
  }

  async function saveAvatar(updates: Partial<Pick<OAuthUser, 'avatarType' | 'avatarUrl' | 'dicebearStyle' | 'dicebearSeed'>>): Promise<void> {
    if (!isAuthenticated.value || !oauthUser.value) return;
    oauthUser.value = { ...oauthUser.value, ...updates };
    try {
      const res = await fetch(`${BACKEND_URL}/api/me`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          avatarType: oauthUser.value.avatarType,
          dicebearStyle: oauthUser.value.dicebearStyle,
          dicebearSeed: oauthUser.value.dicebearSeed,
        }),
      });
      if (res.ok) oauthUser.value = await res.json() as OAuthUser;
    } catch {
      // non-critical
    }
  }

  async function logout(): Promise<void> {
    await fetch(`${BACKEND_URL}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
    isAuthenticated.value = false;
    oauthUser.value = null;
  }

  function toggleSoundMuted() {
    soundMuted.value = !soundMuted.value;
    localStorage.setItem('soundMuted', String(soundMuted.value));
  }

  return {
    nickname, locale, soundMuted, avatarUrl, hasProfile,
    isAuthenticated, oauthUser,
    init, save, saveAvatar, logout, toggleSoundMuted,
  };
});
```

**Step 2: Commit**

```bash
git add packages/frontend/src/stores/profileStore.ts
git commit -m "feat: extend profileStore with OAuth state, /api/me fetch, saveAvatar, logout"
```

---

## Task 12: Frontend — App.vue OAuth redirect handling

**Files:**
- Modify: `packages/frontend/src/App.vue`

**Step 1: Uprav App.vue**

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { socket } from './socket';
import GameLayout from './layouts/GameLayout.vue';
import { useProfileStore } from './stores/profileStore';
import PlayerProfileModal from './components/PlayerProfileModal.vue';

const profileStore = useProfileStore();
const route = useRoute();
const router = useRouter();
const showProfileModal = ref(false);
const oauthSetup = ref(false);

onMounted(async () => {
  socket.connect();
  await profileStore.init();

  // Handle OAuth redirect
  const authParam = route.query.auth as string | undefined;
  if (authParam) {
    router.replace({ query: {} }); // clean URL
    if (authParam === 'new') {
      oauthSetup.value = true;
      showProfileModal.value = true;
      return;
    }
    // 'success' or 'error' — profile already loaded by init()
  }

  if (!profileStore.hasProfile) showProfileModal.value = true;
});

onUnmounted(() => socket.disconnect());
</script>

<template>
  <GameLayout>
    <RouterView v-if="profileStore.hasProfile" />
  </GameLayout>

  <PlayerProfileModal
    v-if="showProfileModal"
    :is-edit="false"
    :is-oauth-setup="oauthSetup"
    @close="showProfileModal = false; oauthSetup = false"
  />
</template>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/App.vue
git commit -m "feat: handle OAuth redirect params in App.vue"
```

---

## Task 13: i18n strings

**Files:**
- Modify: `packages/frontend/src/i18n/locales/cs.json`
- Modify: `packages/frontend/src/i18n/locales/en.json`
- Modify: `packages/frontend/src/i18n/locales/ru.json`
- Modify: `packages/frontend/src/i18n/locales/uk.json`
- Modify: `packages/frontend/src/i18n/locales/es.json`

**Step 1: Přidej klíče do cs.json**

Do sekce `"profile"` přidej:

```json
"loginWithGoogle": "Přihlásit se přes Google",
"loginWithDiscord": "Přihlásit se přes Discord",
"playAsGuest": "Hrát jako host",
"linkAccount": "Propojit účet",
"logout": "Odhlásit se",
"loggedInAs": "Přihlášen jako",
"avatar": "Avatar",
"avatarOAuth": "Profilovka ({provider})",
"avatarDicebear": "DiceBear",
"dicebearStyle": "Styl",
"dicebearSeed": "Seed",
"dicebearSeedPlaceholder": "libovolný text..."
```

**Step 2: Přidej stejné klíče do en.json**

```json
"loginWithGoogle": "Sign in with Google",
"loginWithDiscord": "Sign in with Discord",
"playAsGuest": "Play as guest",
"linkAccount": "Link account",
"logout": "Log out",
"loggedInAs": "Logged in as",
"avatar": "Avatar",
"avatarOAuth": "{provider} photo",
"avatarDicebear": "DiceBear",
"dicebearStyle": "Style",
"dicebearSeed": "Seed",
"dicebearSeedPlaceholder": "any text..."
```

**Step 3: Přidej stejné klíče do ru.json, uk.json, es.json**

Pro ru.json:
```json
"loginWithGoogle": "Войти через Google",
"loginWithDiscord": "Войти через Discord",
"playAsGuest": "Играть как гость",
"linkAccount": "Привязать аккаунт",
"logout": "Выйти",
"loggedInAs": "Вошёл как",
"avatar": "Аватар",
"avatarOAuth": "Фото ({provider})",
"avatarDicebear": "DiceBear",
"dicebearStyle": "Стиль",
"dicebearSeed": "Сид",
"dicebearSeedPlaceholder": "любой текст..."
```

Pro uk.json:
```json
"loginWithGoogle": "Увійти через Google",
"loginWithDiscord": "Увійти через Discord",
"playAsGuest": "Грати як гість",
"linkAccount": "Прив'язати акаунт",
"logout": "Вийти",
"loggedInAs": "Увійшли як",
"avatar": "Аватар",
"avatarOAuth": "Фото ({provider})",
"avatarDicebear": "DiceBear",
"dicebearStyle": "Стиль",
"dicebearSeed": "Сід",
"dicebearSeedPlaceholder": "будь-який текст..."
```

Pro es.json:
```json
"loginWithGoogle": "Iniciar sesión con Google",
"loginWithDiscord": "Iniciar sesión con Discord",
"playAsGuest": "Jugar como invitado",
"linkAccount": "Vincular cuenta",
"logout": "Cerrar sesión",
"loggedInAs": "Conectado como",
"avatar": "Avatar",
"avatarOAuth": "Foto ({provider})",
"avatarDicebear": "DiceBear",
"dicebearStyle": "Estilo",
"dicebearSeed": "Semilla",
"dicebearSeedPlaceholder": "cualquier texto..."
```

**Step 4: Commit**

```bash
git add packages/frontend/src/i18n/locales/
git commit -m "feat: add OAuth i18n keys to all 5 locales"
```

---

## Task 14: Frontend — PlayerProfileModal — OAuth tlačítka (setup mode)

**Files:**
- Modify: `packages/frontend/src/components/PlayerProfileModal.vue`

**Step 1: Přidej OAuth props a tlačítka do setup modu**

Přidej prop `isOAuthSetup`:

```ts
const props = withDefaults(defineProps<{ isEdit?: boolean; isOAuthSetup?: boolean }>(), {
  isEdit: false,
  isOAuthSetup: false,
});
```

Přidej computed a BACKEND_URL:

```ts
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';
const isSetupMode = computed(() => !props.isEdit && !props.isOAuthSetup);
```

**Step 2: Přidej OAuth sekci do template**

Za `<!-- Header -->` a PŘED `<!-- Avatar preview -->`, přidej podmíněnou OAuth sekci (zobrazí se jen v setup modu, ne při edit ani isOAuthSetup):

```html
<!-- OAuth login (jen v setup modu, ne edit ani isOAuthSetup) -->
<template v-if="isSetupMode">
  <a
    :href="`${BACKEND_URL}/auth/google`"
    class="flex items-center justify-center gap-3 w-full py-3 bg-white text-black text-sm font-bold rounded-2xl hover:bg-gray-100 transition-colors"
  >
    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
    {{ t('profile.loginWithGoogle') }}
  </a>
  <a
    :href="`${BACKEND_URL}/auth/discord`"
    class="flex items-center justify-center gap-3 w-full py-3 bg-[#5865F2] text-white text-sm font-bold rounded-2xl hover:bg-[#4752c4] transition-colors"
  >
    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.033.055a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
    </svg>
    {{ t('profile.loginWithDiscord') }}
  </a>

  <div class="flex items-center gap-3">
    <div class="flex-1 h-px bg-white/10"></div>
    <span class="text-slate-500 text-xs font-bold uppercase tracking-widest">nebo</span>
    <div class="flex-1 h-px bg-white/10"></div>
  </div>
</template>
```

**Step 3: Commit**

```bash
git add packages/frontend/src/components/PlayerProfileModal.vue
git commit -m "feat: add OAuth login buttons to PlayerProfileModal setup mode"
```

---

## Task 15: Frontend — PlayerProfileModal — edit mode (link account + avatar picker)

**Files:**
- Modify: `packages/frontend/src/components/PlayerProfileModal.vue`

**Step 1: Přidej avatar picker pro OAuth uživatele**

Přidej do `<script setup>`:

```ts
const profileStore = useProfileStore();
const selectedAvatarType = ref<'oauth' | 'dicebear'>(profileStore.oauthUser?.avatarType ?? 'oauth');
const selectedDicebearStyle = ref(profileStore.oauthUser?.dicebearStyle ?? 'bottts');
const dicebearSeedInput = ref(profileStore.oauthUser?.dicebearSeed ?? '');

const DICEBEAR_STYLES = [
  { value: 'bottts', label: 'Bottts' },
  { value: 'avataaars', label: 'Avataars' },
  { value: 'big-smile', label: 'Big Smile' },
  { value: 'croodles', label: 'Croodles' },
  { value: 'dylan', label: 'Dylan' },
  { value: 'big-ears', label: 'Big Ears' },
  { value: 'adventurer', label: 'Adventurer' },
];

const previewAvatarUrl = computed(() => {
  if (profileStore.isAuthenticated && profileStore.oauthUser) {
    if (selectedAvatarType.value === 'oauth' && profileStore.oauthUser.avatarUrl) {
      return profileStore.oauthUser.avatarUrl;
    }
    const seed = dicebearSeedInput.value || nicknameInput.value || 'default';
    return `https://api.dicebear.com/9.x/${selectedDicebearStyle.value}/svg?seed=${encodeURIComponent(seed)}`;
  }
  return `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(nicknameInput.value || 'default')}`;
});
```

Uprav `submit()` — přidej uložení avatara pro OAuth uživatele:

```ts
async function submit() {
  if (!canSave.value) return;
  const error = await profileStore.save(nicknameInput.value.trim(), selectedLocale.value);
  if (error) {
    saveError.value = error;
    return;
  }
  if (profileStore.isAuthenticated) {
    await profileStore.saveAvatar({
      avatarType: selectedAvatarType.value,
      dicebearStyle: selectedAvatarType.value === 'dicebear' ? selectedDicebearStyle.value : null,
      dicebearSeed: selectedAvatarType.value === 'dicebear' ? (dicebearSeedInput.value || null) : null,
    });
  }
  saveError.value = '';
  emit('close');
}
```

**Step 2: Přidej avatar picker do template (za Avatar preview, jen pro OAuth uživatele v edit modu)**

Za `<!-- Avatar preview -->` přidej:

```html
<!-- Avatar picker (jen pro přihlášené v edit modu) -->
<div v-if="isEdit && profileStore.isAuthenticated && profileStore.oauthUser" class="space-y-3">
  <p class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{{ t('profile.avatar') }}</p>
  <!-- Type toggle -->
  <div class="flex gap-2">
    <button
      v-for="type in ['oauth', 'dicebear'] as const"
      :key="type"
      type="button"
      @click="selectedAvatarType = type"
      :class="[
        'flex-1 py-2 rounded-xl text-xs font-bold border transition-all',
        selectedAvatarType === type
          ? 'bg-white/10 border-white/30 text-white'
          : 'bg-slate-900/40 border-white/5 text-slate-400 hover:border-white/15',
      ]"
    >
      {{ type === 'oauth' ? t('profile.avatarOAuth', { provider: profileStore.oauthUser.provider }) : t('profile.avatarDicebear') }}
    </button>
  </div>
  <!-- DiceBear options -->
  <template v-if="selectedAvatarType === 'dicebear'">
    <div>
      <label class="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">{{ t('profile.dicebearStyle') }}</label>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="style in DICEBEAR_STYLES"
          :key="style.value"
          type="button"
          @click="selectedDicebearStyle = style.value"
          :class="[
            'px-2.5 py-1 rounded-lg text-xs font-bold border transition-all',
            selectedDicebearStyle === style.value
              ? 'bg-white/10 border-white/30 text-white'
              : 'bg-slate-900/40 border-white/5 text-slate-400 hover:border-white/15',
          ]"
        >
          {{ style.label }}
        </button>
      </div>
    </div>
    <div>
      <label class="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">{{ t('profile.dicebearSeed') }}</label>
      <input
        v-model="dicebearSeedInput"
        maxlength="100"
        class="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-white/30 transition-colors text-sm"
        :placeholder="t('profile.dicebearSeedPlaceholder')"
      />
    </div>
  </template>
</div>

<!-- Link account (jen pro hosta v edit modu) -->
<div v-if="isEdit && !profileStore.isAuthenticated" class="border-t border-white/10 pt-4 space-y-2">
  <p class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{{ t('profile.linkAccount') }}</p>
  <a
    :href="`${BACKEND_URL}/auth/google`"
    class="flex items-center justify-center gap-2 w-full py-2.5 bg-white/5 border border-white/10 text-slate-300 text-xs font-bold rounded-xl hover:bg-white/10 transition-colors"
  >
    <span>G</span> {{ t('profile.loginWithGoogle') }}
  </a>
  <a
    :href="`${BACKEND_URL}/auth/discord`"
    class="flex items-center justify-center gap-2 w-full py-2.5 bg-[#5865F2]/20 border border-[#5865F2]/30 text-[#c0c5ff] text-xs font-bold rounded-xl hover:bg-[#5865F2]/30 transition-colors"
  >
    <span>D</span> {{ t('profile.loginWithDiscord') }}
  </a>
</div>

<!-- Logout (jen pro přihlášeného v edit modu) -->
<div v-if="isEdit && profileStore.isAuthenticated" class="flex items-center justify-between border-t border-white/10 pt-4">
  <span class="text-slate-500 text-xs">{{ t('profile.loggedInAs') }}: <span class="text-slate-300">{{ profileStore.oauthUser?.provider }}</span></span>
  <button
    type="button"
    @click="profileStore.logout(); emit('close')"
    class="text-xs text-red-400 hover:text-red-300 font-bold transition-colors"
  >
    {{ t('profile.logout') }}
  </button>
</div>
```

**Step 3: Commit**

```bash
git add packages/frontend/src/components/PlayerProfileModal.vue
git commit -m "feat: add avatar picker, link account and logout to PlayerProfileModal"
```

---

## Task 16: .env.example aktualizace

**Files:**
- Modify: `.env.example`

**Step 1: Přidej nové proměnné**

```bash
# Přidej na konec .env.example:
# OAuth (Google)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# OAuth (Discord)
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=

# JWT secret (min. 32 znaků)
JWT_SECRET=

# Veřejná URL backendu (pro OAuth callback URI)
PUBLIC_BACKEND_URL=http://localhost:3000
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add OAuth and JWT env vars to .env.example"
```

---

## Task 17: Spusť finální testy

**Step 1: Spusť celou test suite**

```bash
npm test --workspace=packages/backend
```

Expected: všechny testy zelené (113+ passing).

**Step 2: Ruční smoke test (vyžaduje Google/Discord app v Google Console / Discord Dev Portal)**

1. Nastav `.env` s reálnými `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET`
2. Spusť `npm run dev:backend`
3. Navštiv `http://localhost:3000/auth/google` — přihlášení Google → redirect na `localhost:5173/?auth=new`
4. Ověř, že se zobrazí setup modal (výběr nicku)
5. Ulož nick → ověř v DB: `SELECT * FROM users;`
6. Ověř `GET http://localhost:3000/api/me` v prohlížeči (s cookie)

**Step 3: Commit**

```bash
git add .
git commit -m "feat: complete OAuth implementation (Google + Discord)"
```

---

## Poznámky pro deploy na VPS

1. **Google Console:** přidej Authorized redirect URI: `https://kpl.example.com/auth/google/callback`
2. **Discord Dev Portal:** přidej Redirect URI: `https://kpl.example.com/auth/discord/callback`
3. **Apache:** `/auth/google`, `/auth/discord`, `/api/me` jsou backend routes — reverse proxy je přesměruje správně (stejně jako ostatní `/api/` cesty)
4. **PM2 env:** přidej nové proměnné do `ecosystem.config.js` nebo nastav přes `pm2 set`
5. **Cookie `secure: true`** se aktivuje automaticky přes `NODE_ENV=production`
