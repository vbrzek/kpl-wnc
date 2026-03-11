# Card Editor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** OAuth uživatelé mohou vytvářet a editovat vlastní sady karet přes průvodce na `/editor`.

**Architecture:** Nová DB migrace přidá `user_id` do `card_sets`. Backend dostane dva nové route soubory (`editorSets.ts`, `editorCards.ts`) chráněné sdíleným JWT middleware. Frontend přidá tři nové Views, Pinia store a sdílené komponenty v `components/editor/`.

**Tech Stack:** Fastify + Knex (backend), Vue 3 + Pinia + Vue Router (frontend), Zod (validace), Vitest (testy)

---

## Přehled úkolů

1. Extrahovat `verifyJwt` do sdíleného middleware modulu
2. DB migrace: přidat `user_id` do `card_sets`
3. Backend: `editorSets.ts` — CRUD pro sady
4. Backend: `editorSets.test.ts` — testy
5. Backend: `editorCards.ts` — browse + create cards
6. Backend: `editorCards.test.ts` — testy
7. Backend: zaregistrovat nové routes v `index.ts`
8. Shared: přidat editor typy do `@kpl/shared`
9. Frontend: `editorStore.ts`
10. Frontend: router + route guard
11. Frontend: `EditorDashboardView.vue` + `SetCard.vue`
12. Frontend: `WizardStep1.vue` + `EditorWizardView.vue`
13. Frontend: `CardFilterBar.vue` + `CardBrowser.vue`
14. Frontend: `WizardStep2.vue`
15. Frontend: `WizardStep3.vue`
16. Frontend: `EditorSetView.vue`
17. Frontend: tlačítko v `HomeView.vue`

---

## Task 1: Extrahovat verifyJwt do sdíleného middleware

**Proč:** `verifyJwt` je nyní lokální funkce v `auth.ts`. Editor routes ji potřebují taky — DRY.

**Files:**
- Create: `packages/backend/src/auth/middleware.ts`
- Modify: `packages/backend/src/routes/auth.ts`

**Step 1: Vytvoř `packages/backend/src/auth/middleware.ts`**

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from './jwt.js';
import type { JwtPayload } from './jwt.js';

// Type augmentation — importovat v každém souboru, kde se používá jwtUser
declare module 'fastify' {
  interface FastifyRequest {
    jwtUser?: JwtPayload;
  }
}

export async function verifyJwt(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = (request.headers.cookie ?? '').match(/kpl_token=([^;]+)/)?.[1];
  if (!token) { reply.status(401).send({ error: 'Unauthorized' }); return; }
  const payload = verifyToken(decodeURIComponent(token));
  if (!payload) { reply.status(401).send({ error: 'Unauthorized' }); return; }
  request.jwtUser = payload;
}
```

**Step 2: Uprav `auth.ts` — importuj z middleware, odstraň lokální definici**

V `packages/backend/src/routes/auth.ts`:
- Přidej import: `import { verifyJwt } from '../auth/middleware.js';`
- Odstraň lokální `async function verifyJwt(...)` a `declare module 'fastify'` blok
- Odstraň `import type { JwtPayload } from '../auth/jwt.js';` pokud se nepoužívá jinde

**Step 3: Ověř testy**

```bash
npm test --workspace=packages/backend
```
Očekáváno: všechny testy prochází (119).

**Step 4: Commit**

```bash
git add packages/backend/src/auth/middleware.ts packages/backend/src/routes/auth.ts
git commit -m "refactor: extract verifyJwt to shared auth middleware"
```

---

## Task 2: DB migrace — user_id v card_sets

**Files:**
- Create: `packages/backend/src/db/migrations/20260311000000_card_sets_user_id.ts`

**Step 1: Vytvoř migraci**

```typescript
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('card_sets', (table) => {
    table.integer('user_id').unsigned().nullable().references('id').inTable('users').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('card_sets', (table) => {
    table.dropColumn('user_id');
  });
}
```

**Step 2: Spusť migraci**

```bash
npm run migrate --workspace=packages/backend
```
Očekáváno: `Batch 5 run: 1 migrations`

**Step 3: Commit**

```bash
git add packages/backend/src/db/migrations/20260311000000_card_sets_user_id.ts
git commit -m "feat: add user_id to card_sets for user-owned sets"
```

---

## Task 3: Backend — editorSets.ts

**Files:**
- Create: `packages/backend/src/routes/editorSets.ts`

**Reference:** Vzor pro route strukturu viz `packages/backend/src/routes/auth.ts`. Auth middleware je nyní v `packages/backend/src/auth/middleware.ts`.

**Step 1: Vytvoř `editorSets.ts`**

```typescript
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import db from '../db/db.js';
import { verifyJwt } from '../auth/middleware.js';

const CreateSetSchema = z.object({
  name: z.string().min(1).max(64).trim(),
  description: z.string().max(255).trim().optional(),
  isPublic: z.boolean().default(false),
});

const UpdateSetSchema = z.object({
  name: z.string().min(1).max(64).trim().optional(),
  description: z.string().max(255).trim().nullable().optional(),
  isPublic: z.boolean().optional(),
});

const editorSetsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest('jwtUser', undefined);

  // GET /api/editor/sets — moje sady
  fastify.get('/editor/sets', { preHandler: verifyJwt }, async (request, reply) => {
    const { userId } = request.jwtUser!;
    const rows = await db('card_sets')
      .where({ user_id: userId })
      .select(
        'id', 'name', 'description', 'is_public',
        db.raw('(SELECT COUNT(*) FROM card_set_black_cards WHERE card_set_id = card_sets.id) as black_count'),
        db.raw('(SELECT COUNT(*) FROM card_set_white_cards WHERE card_set_id = card_sets.id) as white_count'),
      )
      .orderBy('name');
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isPublic: Boolean(r.is_public),
      blackCount: Number(r.black_count),
      whiteCount: Number(r.white_count),
    }));
  });

  // POST /api/editor/sets — nová sada
  fastify.post('/editor/sets', { preHandler: verifyJwt }, async (request, reply) => {
    const { userId } = request.jwtUser!;
    const parsed = CreateSetSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message });
    const { name, description, isPublic } = parsed.data;
    const [id] = await db('card_sets').insert({ name, description: description ?? null, is_public: isPublic, user_id: userId });
    return { id, name, description: description ?? null, isPublic, blackCount: 0, whiteCount: 0 };
  });

  // GET /api/editor/sets/:id — detail sady
  fastify.get('/editor/sets/:id', { preHandler: verifyJwt }, async (request, reply) => {
    const { userId } = request.jwtUser!;
    const { id } = request.params as { id: string };
    const row = await db('card_sets').where({ id: Number(id), user_id: userId }).first();
    if (!row) return reply.status(404).send({ error: 'Sada nenalezena.' });
    const blackCount = await db('card_set_black_cards').where({ card_set_id: row.id }).count('* as count').first();
    const whiteCount = await db('card_set_white_cards').where({ card_set_id: row.id }).count('* as count').first();
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      isPublic: Boolean(row.is_public),
      blackCount: Number((blackCount as any)?.count ?? 0),
      whiteCount: Number((whiteCount as any)?.count ?? 0),
    };
  });

  // PATCH /api/editor/sets/:id
  fastify.patch('/editor/sets/:id', { preHandler: verifyJwt }, async (request, reply) => {
    const { userId } = request.jwtUser!;
    const { id } = request.params as { id: string };
    const parsed = UpdateSetSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message });
    const existing = await db('card_sets').where({ id: Number(id), user_id: userId }).first();
    if (!existing) return reply.status(404).send({ error: 'Sada nenalezena.' });
    const updates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;
    if (parsed.data.isPublic !== undefined) updates.is_public = parsed.data.isPublic;
    await db('card_sets').where({ id: Number(id) }).update(updates);
    const updated = await db('card_sets').where({ id: Number(id) }).first();
    return { id: updated.id, name: updated.name, description: updated.description, isPublic: Boolean(updated.is_public) };
  });

  // DELETE /api/editor/sets/:id
  fastify.delete('/editor/sets/:id', { preHandler: verifyJwt }, async (request, reply) => {
    const { userId } = request.jwtUser!;
    const { id } = request.params as { id: string };
    const existing = await db('card_sets').where({ id: Number(id), user_id: userId }).first();
    if (!existing) return reply.status(404).send({ error: 'Sada nenalezena.' });
    await db('card_sets').where({ id: Number(id) }).delete();
    return { ok: true };
  });

  // POST /api/editor/sets/:id/cards — přidej kartu do sady
  fastify.post('/editor/sets/:id/cards', { preHandler: verifyJwt }, async (request, reply) => {
    const { userId } = request.jwtUser!;
    const { id } = request.params as { id: string };
    const { type, cardId } = request.body as { type: 'black' | 'white'; cardId: number };
    if (!type || !cardId) return reply.status(400).send({ error: 'Chybí type nebo cardId.' });
    const existing = await db('card_sets').where({ id: Number(id), user_id: userId }).first();
    if (!existing) return reply.status(404).send({ error: 'Sada nenalezena.' });
    const table = type === 'black' ? 'card_set_black_cards' : 'card_set_white_cards';
    const cardCol = type === 'black' ? 'black_card_id' : 'white_card_id';
    await db(table).insert({ card_set_id: Number(id), [cardCol]: cardId }).onConflict().ignore();
    return { ok: true };
  });

  // DELETE /api/editor/sets/:id/cards/:type/:cardId
  fastify.delete('/editor/sets/:id/cards/:type/:cardId', { preHandler: verifyJwt }, async (request, reply) => {
    const { userId } = request.jwtUser!;
    const { id, type, cardId } = request.params as { id: string; type: 'black' | 'white'; cardId: string };
    const existing = await db('card_sets').where({ id: Number(id), user_id: userId }).first();
    if (!existing) return reply.status(404).send({ error: 'Sada nenalezena.' });
    const table = type === 'black' ? 'card_set_black_cards' : 'card_set_white_cards';
    const cardCol = type === 'black' ? 'black_card_id' : 'white_card_id';
    await db(table).where({ card_set_id: Number(id), [cardCol]: Number(cardId) }).delete();
    return { ok: true };
  });
};

export default editorSetsRoutes;
```

**Step 2: Commit (bez testů zatím)**

```bash
git add packages/backend/src/routes/editorSets.ts
git commit -m "feat: add editorSets routes (CRUD for user card sets)"
```

---

## Task 4: editorSets.test.ts

**Files:**
- Create: `packages/backend/src/routes/editorSets.test.ts`

**Step 1: Vytvoř test soubor**

Vzor: viz `packages/backend/src/routes/auth.test.ts` — mock db, Fastify inject.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import editorSetsRoutes from './editorSets.js';
import { signToken } from '../auth/jwt.js';

vi.mock('../db/db.js', () => ({ default: vi.fn() }));
vi.mock('../auth/middleware.js', () => ({
  verifyJwt: vi.fn(async (request: any) => { request.jwtUser = { userId: 1, provider: 'google' }; }),
}));

import db from '../db/db.js';
const mockDb = db as unknown as ReturnType<typeof vi.fn>;

describe('GET /api/editor/sets', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.resetAllMocks();
    app = Fastify({ logger: false });
    await app.register(cookie);
    await app.register(editorSetsRoutes, { prefix: '/api' });
    await app.ready();
  });

  it('returns empty array when user has no sets', async () => {
    mockDb.mockReturnValue({
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([]),
    });
    const res = await app.inject({ method: 'GET', url: '/api/editor/sets' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([]);
  });

  it('returns user sets with card counts', async () => {
    mockDb.mockReturnValue({
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([
        { id: 1, name: 'Moje sada', description: null, is_public: 0, black_count: '5', white_count: '10' },
      ]),
    });
    const res = await app.inject({ method: 'GET', url: '/api/editor/sets' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body[0]).toEqual({ id: 1, name: 'Moje sada', description: null, isPublic: false, blackCount: 5, whiteCount: 10 });
  });
});

describe('POST /api/editor/sets', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.resetAllMocks();
    app = Fastify({ logger: false });
    await app.register(cookie);
    await app.register(editorSetsRoutes, { prefix: '/api' });
    await app.ready();
  });

  it('creates a new set and returns it', async () => {
    mockDb.mockReturnValue({
      insert: vi.fn().mockResolvedValue([42]),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/editor/sets',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Nová sada', isPublic: false }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(42);
    expect(body.name).toBe('Nová sada');
  });

  it('returns 400 when name is empty', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/editor/sets',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '', isPublic: false }),
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /api/editor/sets/:id', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.resetAllMocks();
    app = Fastify({ logger: false });
    await app.register(cookie);
    await app.register(editorSetsRoutes, { prefix: '/api' });
    await app.ready();
  });

  it('returns 404 when set does not belong to user', async () => {
    mockDb.mockReturnValue({
      where: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(null),
    });
    const res = await app.inject({ method: 'DELETE', url: '/api/editor/sets/99' });
    expect(res.statusCode).toBe(404);
  });

  it('deletes set and returns ok', async () => {
    let callCount = 0;
    mockDb.mockImplementation(() => ({
      where: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ id: 1 }),
      delete: vi.fn().mockResolvedValue(1),
    }));
    const res = await app.inject({ method: 'DELETE', url: '/api/editor/sets/1' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
  });
});
```

**Step 2: Spusť testy**

```bash
npm test --workspace=packages/backend
```
Očekáváno: nové testy prochází.

**Step 3: Commit**

```bash
git add packages/backend/src/routes/editorSets.test.ts
git commit -m "test: add editorSets route tests"
```

---

## Task 5: Backend — editorCards.ts

**Files:**
- Create: `packages/backend/src/routes/editorCards.ts`

**Step 1: Vytvoř `editorCards.ts`**

```typescript
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import db from '../db/db.js';
import { verifyJwt } from '../auth/middleware.js';

const NewCardSchema = z.object({
  type: z.enum(['black', 'white']),
  text: z.string().min(1).max(500).trim(),
  pick: z.number().int().min(1).max(2).optional().default(1),
  setId: z.number().int().positive(),
  translations: z.record(z.enum(['en', 'ru', 'uk', 'es']), z.string().max(500).trim()).optional(),
});

const editorCardsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest('jwtUser', undefined);

  // GET /api/editor/cards?type=black|white&search=...&setId=...&page=...
  fastify.get('/editor/cards', { preHandler: verifyJwt }, async (request) => {
    const { type, search, setId, page } = request.query as {
      type?: 'black' | 'white';
      search?: string;
      setId?: string;
      page?: string;
    };
    const PAGE_SIZE = 50;
    const pageNum = Math.max(1, Number(page ?? 1));
    const offset = (pageNum - 1) * PAGE_SIZE;

    if (type === 'black' || !type) {
      let query = db('black_cards').select('id', 'text', 'pick');
      if (search) query = query.whereILike('text', `%${search}%`);
      if (setId) query = query.whereIn('id', db('card_set_black_cards').select('black_card_id').where({ card_set_id: Number(setId) }));
      const totalRow = await db('black_cards')
        .modify((q: any) => {
          if (search) q.whereILike('text', `%${search}%`);
          if (setId) q.whereIn('id', db('card_set_black_cards').select('black_card_id').where({ card_set_id: Number(setId) }));
        })
        .count('* as count')
        .first();
      const cards = await query.orderBy('id').limit(PAGE_SIZE).offset(offset);
      if (type === 'black') {
        return { cards: cards.map((c: any) => ({ ...c, type: 'black' })), total: Number((totalRow as any)?.count ?? 0), page: pageNum };
      }
    }

    // type === 'white' or no type (returns both — not used, but safe)
    let query = db('white_cards').select('id', 'text');
    if (search) query = query.whereILike('text', `%${search}%`);
    if (setId) query = query.whereIn('id', db('card_set_white_cards').select('white_card_id').where({ card_set_id: Number(setId) }));
    const totalRow = await db('white_cards')
      .modify((q: any) => {
        if (search) q.whereILike('text', `%${search}%`);
        if (setId) q.whereIn('id', db('card_set_white_cards').select('white_card_id').where({ card_set_id: Number(setId) }));
      })
      .count('* as count')
      .first();
    const cards = await query.orderBy('id').limit(PAGE_SIZE).offset(offset);
    return { cards: cards.map((c: any) => ({ ...c, type: 'white' })), total: Number((totalRow as any)?.count ?? 0), page: pageNum };
  });

  // POST /api/editor/cards — nová karta + přidání do sady
  fastify.post('/editor/cards', { preHandler: verifyJwt }, async (request, reply) => {
    const { userId } = request.jwtUser!;
    const parsed = NewCardSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message });
    const { type, text, pick, setId, translations } = parsed.data;

    // Ověř vlastnictví sady
    const set = await db('card_sets').where({ id: setId, user_id: userId }).first();
    if (!set) return reply.status(403).send({ error: 'Sada nenalezena nebo nemáš přístup.' });

    if (type === 'black') {
      const [cardId] = await db('black_cards').insert({ text, pick });
      await db('card_set_black_cards').insert({ card_set_id: setId, black_card_id: cardId });
      if (translations) {
        const rows = Object.entries(translations).map(([language_code, t]) => ({ black_card_id: cardId, language_code, text: t }));
        if (rows.length > 0) await db('black_card_translations').insert(rows);
      }
      return { id: cardId, type: 'black', text, pick };
    } else {
      const [cardId] = await db('white_cards').insert({ text });
      await db('card_set_white_cards').insert({ card_set_id: setId, white_card_id: cardId });
      if (translations) {
        const rows = Object.entries(translations).map(([language_code, t]) => ({ white_card_id: cardId, language_code, text: t }));
        if (rows.length > 0) await db('white_card_translations').insert(rows);
      }
      return { id: cardId, type: 'white', text };
    }
  });
};

export default editorCardsRoutes;
```

**Step 2: Commit**

```bash
git add packages/backend/src/routes/editorCards.ts
git commit -m "feat: add editorCards routes (browse and create cards)"
```

---

## Task 6: editorCards.test.ts

**Files:**
- Create: `packages/backend/src/routes/editorCards.test.ts`

**Step 1: Vytvoř test soubor**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import editorCardsRoutes from './editorCards.js';

vi.mock('../db/db.js', () => ({ default: vi.fn() }));
vi.mock('../auth/middleware.js', () => ({
  verifyJwt: vi.fn(async (request: any) => { request.jwtUser = { userId: 1, provider: 'google' }; }),
}));

import db from '../db/db.js';
const mockDb = db as unknown as ReturnType<typeof vi.fn>;

describe('GET /api/editor/cards', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.resetAllMocks();
    app = Fastify({ logger: false });
    await app.register(cookie);
    await app.register(editorCardsRoutes, { prefix: '/api' });
    await app.ready();
  });

  it('returns black cards with type field', async () => {
    mockDb.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      modify: vi.fn().mockReturnThis(),
      count: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ count: '2' }),
      whereILike: vi.fn().mockReturnThis(),
      whereIn: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue([
        { id: 1, text: 'Karta 1', pick: 1 },
        { id: 2, text: 'Karta 2', pick: 2 },
      ]),
    });
    const res = await app.inject({ method: 'GET', url: '/api/editor/cards?type=black' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.cards[0].type).toBe('black');
    expect(body.total).toBe(2);
  });
});

describe('POST /api/editor/cards', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.resetAllMocks();
    app = Fastify({ logger: false });
    await app.register(cookie);
    await app.register(editorCardsRoutes, { prefix: '/api' });
    await app.ready();
  });

  it('returns 400 when text is empty', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/editor/cards',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'white', text: '', setId: 1 }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 403 when set does not belong to user', async () => {
    mockDb.mockReturnValue({
      where: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(null),
    });
    const res = await app.inject({
      method: 'POST', url: '/api/editor/cards',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'white', text: 'Nová karta', setId: 99 }),
    });
    expect(res.statusCode).toBe(403);
  });
});
```

**Step 2: Spusť testy**

```bash
npm test --workspace=packages/backend
```

**Step 3: Commit**

```bash
git add packages/backend/src/routes/editorCards.test.ts
git commit -m "test: add editorCards route tests"
```

---

## Task 7: Zaregistrovat routes v index.ts

**Files:**
- Modify: `packages/backend/src/index.ts`

**Step 1: Přidej importy a registraci**

Za řádek `import authRoutes from './routes/auth.js';` přidej:
```typescript
import editorSetsRoutes from './routes/editorSets.js';
import editorCardsRoutes from './routes/editorCards.js';
```

Za řádek `await app.register(roomsRoutes, { prefix: '/api' });` přidej:
```typescript
await app.register(editorSetsRoutes, { prefix: '/api' });
await app.register(editorCardsRoutes, { prefix: '/api' });
```

**Step 2: Spusť testy**

```bash
npm test --workspace=packages/backend
```

**Step 3: Commit**

```bash
git add packages/backend/src/index.ts
git commit -m "feat: register editor routes in app"
```

---

## Task 8: Shared typy pro editor

**Files:**
- Modify: `packages/shared/src/index.ts`

**Step 1: Přidej typy na konec souboru**

```typescript
// ── Editor types ──────────────────────────────────────────────────────────────

export interface UserCardSet {
  id: number;
  name: string;
  description: string | null;
  isPublic: boolean;
  blackCount: number;
  whiteCount: number;
}

export interface EditorCard {
  id: number;
  type: 'black' | 'white';
  text: string;
  pick?: number; // only for black cards
}

export interface EditorCardsPage {
  cards: EditorCard[];
  total: number;
  page: number;
}
```

**Step 2: Spusť testy**

```bash
npm test --workspace=packages/backend
```

**Step 3: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat: add editor types to shared package"
```

---

## Task 9: Frontend — editorStore.ts

**Files:**
- Create: `packages/frontend/src/stores/editorStore.ts`

**Reference:** Vzor viz `packages/frontend/src/stores/profileStore.ts` pro pattern API volání.

**Step 1: Vytvoř store**

```typescript
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { UserCardSet, EditorCard, EditorCardsPage } from '@kpl/shared';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';

export const useEditorStore = defineStore('editor', () => {
  const mySets = ref<UserCardSet[]>([]);
  const currentSet = ref<UserCardSet | null>(null);
  const cards = ref<EditorCard[]>([]);
  const cardsTotal = ref(0);
  const cardsPage = ref(1);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchMySets(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch(`${BACKEND_URL}/api/editor/sets`, { credentials: 'include' });
      if (!res.ok) throw new Error('Nepodařilo se načíst sady.');
      mySets.value = await res.json();
    } catch (e: any) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  async function fetchSet(id: number): Promise<void> {
    const res = await fetch(`${BACKEND_URL}/api/editor/sets/${id}`, { credentials: 'include' });
    if (!res.ok) { error.value = 'Sada nenalezena.'; return; }
    currentSet.value = await res.json();
  }

  async function createSet(data: { name: string; description?: string; isPublic: boolean }): Promise<UserCardSet | null> {
    const res = await fetch(`${BACKEND_URL}/api/editor/sets`, {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) { error.value = 'Nepodařilo se vytvořit sadu.'; return null; }
    const set = await res.json() as UserCardSet;
    mySets.value.push(set);
    return set;
  }

  async function updateSet(id: number, data: Partial<{ name: string; description: string | null; isPublic: boolean }>): Promise<void> {
    const res = await fetch(`${BACKEND_URL}/api/editor/sets/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) return;
    const updated = await res.json();
    const idx = mySets.value.findIndex((s) => s.id === id);
    if (idx !== -1) mySets.value[idx] = { ...mySets.value[idx], ...updated };
    if (currentSet.value?.id === id) currentSet.value = { ...currentSet.value, ...updated };
  }

  async function deleteSet(id: number): Promise<void> {
    await fetch(`${BACKEND_URL}/api/editor/sets/${id}`, { method: 'DELETE', credentials: 'include' });
    mySets.value = mySets.value.filter((s) => s.id !== id);
    if (currentSet.value?.id === id) currentSet.value = null;
  }

  async function fetchCards(params: { type: 'black' | 'white'; search?: string; setId?: number; page?: number }): Promise<void> {
    const url = new URL(`${BACKEND_URL}/api/editor/cards`);
    url.searchParams.set('type', params.type);
    if (params.search) url.searchParams.set('search', params.search);
    if (params.setId) url.searchParams.set('setId', String(params.setId));
    url.searchParams.set('page', String(params.page ?? 1));
    const res = await fetch(url.toString(), { credentials: 'include' });
    if (!res.ok) return;
    const data: EditorCardsPage = await res.json();
    cards.value = data.cards;
    cardsTotal.value = data.total;
    cardsPage.value = data.page;
  }

  async function addCardToSet(setId: number, type: 'black' | 'white', cardId: number): Promise<void> {
    await fetch(`${BACKEND_URL}/api/editor/sets/${setId}/cards`, {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type, cardId }),
    });
  }

  async function removeCardFromSet(setId: number, type: 'black' | 'white', cardId: number): Promise<void> {
    await fetch(`${BACKEND_URL}/api/editor/sets/${setId}/cards/${type}/${cardId}`, {
      method: 'DELETE', credentials: 'include',
    });
  }

  async function createCard(data: {
    type: 'black' | 'white'; text: string; pick?: number; setId: number;
    translations?: Partial<Record<'en' | 'ru' | 'uk' | 'es', string>>;
  }): Promise<EditorCard | null> {
    const res = await fetch(`${BACKEND_URL}/api/editor/cards`, {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    return res.json();
  }

  return {
    mySets, currentSet, cards, cardsTotal, cardsPage, loading, error,
    fetchMySets, fetchSet, createSet, updateSet, deleteSet,
    fetchCards, addCardToSet, removeCardFromSet, createCard,
  };
});
```

**Step 2: Commit**

```bash
git add packages/frontend/src/stores/editorStore.ts
git commit -m "feat: add editorStore Pinia store"
```

---

## Task 10: Router update + route guard

**Files:**
- Modify: `packages/frontend/src/router/index.ts`

**Step 1: Přidej editor routes**

```typescript
import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import { useProfileStore } from '../stores/profileStore';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomeView },
    {
      path: '/room/:token',
      component: () => import('../views/RoomView.vue'),
    },
    {
      path: '/editor',
      component: () => import('../views/EditorDashboardView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/editor/new',
      component: () => import('../views/EditorWizardView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/editor/:id',
      component: () => import('../views/EditorSetView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/privacy',
      component: () => import('../views/PrivacyView.vue'),
      meta: { public: true },
    },
    {
      path: '/terms-of-service',
      component: () => import('../views/TermsView.vue'),
      meta: { public: true },
    },
  ],
});

router.beforeEach((to) => {
  if (to.meta.requiresAuth) {
    const profileStore = useProfileStore();
    if (!profileStore.isAuthenticated) return '/';
  }
});

export default router;
```

**Step 2: Commit**

```bash
git add packages/frontend/src/router/index.ts
git commit -m "feat: add editor routes with auth guard to router"
```

---

## Task 11: EditorDashboardView + SetCard

**Files:**
- Create: `packages/frontend/src/components/editor/SetCard.vue`
- Create: `packages/frontend/src/views/EditorDashboardView.vue`

**Step 1: Vytvoř `SetCard.vue`**

```vue
<script setup lang="ts">
import type { UserCardSet } from '@kpl/shared';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ set: UserCardSet }>();
const emit = defineEmits<{ edit: [id: number]; delete: [id: number] }>();
const { t } = useI18n();
</script>

<template>
  <div class="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 flex flex-col gap-2">
    <div class="flex items-start justify-between gap-2">
      <h3 class="font-semibold text-zinc-900 dark:text-white truncate">{{ set.name }}</h3>
      <span v-if="set.isPublic" class="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-2 py-0.5 rounded-full shrink-0">Veřejná</span>
    </div>
    <p v-if="set.description" class="text-sm text-zinc-500 dark:text-zinc-400 line-clamp-2">{{ set.description }}</p>
    <div class="text-xs text-zinc-400 dark:text-zinc-500 flex gap-3">
      <span>⬛ {{ set.blackCount }} černých</span>
      <span>⬜ {{ set.whiteCount }} bílých</span>
    </div>
    <div class="flex gap-2 mt-1">
      <button @click="emit('edit', set.id)" class="flex-1 text-sm bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-200 rounded-lg px-3 py-1.5 transition">
        Upravit
      </button>
      <button @click="emit('delete', set.id)" class="text-sm bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded-lg px-3 py-1.5 transition">
        Smazat
      </button>
    </div>
  </div>
</template>
```

**Step 2: Vytvoř `EditorDashboardView.vue`**

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useEditorStore } from '../stores/editorStore';
import SetCard from '../components/editor/SetCard.vue';

const router = useRouter();
const editorStore = useEditorStore();
const confirmDeleteId = ref<number | null>(null);

onMounted(() => editorStore.fetchMySets());

async function handleDelete(id: number) {
  if (confirmDeleteId.value !== id) { confirmDeleteId.value = id; return; }
  await editorStore.deleteSet(id);
  confirmDeleteId.value = null;
}
</script>

<template>
  <div class="min-h-screen bg-zinc-50 dark:bg-zinc-900 p-4 md:p-8">
    <div class="max-w-4xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <div>
          <button @click="router.push('/')" class="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 mb-1">← Zpět</button>
          <h1 class="text-2xl font-bold text-zinc-900 dark:text-white">Moje sady karet</h1>
        </div>
        <button @click="router.push('/editor/new')" class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl px-4 py-2 transition">
          + Nová sada
        </button>
      </div>

      <div v-if="editorStore.loading" class="text-center py-12 text-zinc-400">Načítám...</div>
      <div v-else-if="editorStore.mySets.length === 0" class="text-center py-12 text-zinc-400">
        <p class="text-lg mb-4">Zatím nemáš žádné vlastní sady karet.</p>
        <button @click="router.push('/editor/new')" class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl px-5 py-2.5 transition">
          Vytvořit první sadu
        </button>
      </div>
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <SetCard
          v-for="set in editorStore.mySets"
          :key="set.id"
          :set="set"
          @edit="router.push(`/editor/${$event}`)"
          @delete="handleDelete"
        />
      </div>

      <div v-if="confirmDeleteId !== null" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div class="bg-white dark:bg-zinc-800 rounded-2xl p-6 max-w-sm w-full">
          <h2 class="text-lg font-semibold text-zinc-900 dark:text-white mb-2">Smazat sadu?</h2>
          <p class="text-zinc-500 dark:text-zinc-400 text-sm mb-4">Tato akce je nevratná. Karty přidané do sady zůstanou v databázi.</p>
          <div class="flex gap-3">
            <button @click="confirmDeleteId = null" class="flex-1 bg-zinc-100 dark:bg-zinc-700 rounded-xl px-4 py-2 text-sm font-medium">Zrušit</button>
            <button @click="handleDelete(confirmDeleteId!)" class="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-xl px-4 py-2 text-sm font-medium transition">Smazat</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
```

**Step 3: Commit**

```bash
git add packages/frontend/src/components/editor/SetCard.vue packages/frontend/src/views/EditorDashboardView.vue
git commit -m "feat: add EditorDashboardView and SetCard component"
```

---

## Task 12: WizardStep1 + EditorWizardView

**Files:**
- Create: `packages/frontend/src/components/editor/WizardStep1.vue`
- Create: `packages/frontend/src/views/EditorWizardView.vue`

**Step 1: Vytvoř `WizardStep1.vue`**

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useLobbyStore } from '../../stores/lobbyStore';

const emit = defineEmits<{
  submit: [data: { name: string; description: string; isPublic: boolean; replicateSetId: number | null }]
}>();

const lobbyStore = useLobbyStore();
const name = ref('');
const description = ref('');
const isPublic = ref(false);
const source = ref<'blank' | 'replicate'>('blank');
const replicateSetId = ref<number | null>(null);
const error = ref('');

onMounted(() => { if (lobbyStore.cardSets.length === 0) lobbyStore.fetchCardSets(); });

function submit() {
  if (!name.value.trim()) { error.value = 'Název sady je povinný.'; return; }
  emit('submit', { name: name.value.trim(), description: description.value.trim(), isPublic: isPublic.value, replicateSetId: source.value === 'replicate' ? replicateSetId.value : null });
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <div>
      <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Název sady *</label>
      <input v-model="name" maxlength="64" class="w-full rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-4 py-2.5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Např. Kancelářský humor" />
    </div>
    <div>
      <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Popis</label>
      <textarea v-model="description" maxlength="255" rows="2" class="w-full rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-4 py-2.5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" placeholder="Volitelný popis sady" />
    </div>
    <div class="flex items-center gap-3">
      <button @click="isPublic = !isPublic" :class="isPublic ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-600'" class="relative w-10 h-6 rounded-full transition-colors">
        <span :class="isPublic ? 'translate-x-4' : 'translate-x-0.5'" class="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform" />
      </button>
      <span class="text-sm text-zinc-700 dark:text-zinc-300">{{ isPublic ? 'Veřejná sada (viditelná všem hráčům)' : 'Soukromá sada' }}</span>
    </div>
    <div>
      <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Výchozí karty</label>
      <div class="flex flex-col gap-2">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="radio" v-model="source" value="blank" class="accent-indigo-600" />
          <span class="text-sm text-zinc-700 dark:text-zinc-300">Začít s prázdnou sadou</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="radio" v-model="source" value="replicate" class="accent-indigo-600" />
          <span class="text-sm text-zinc-700 dark:text-zinc-300">Replikovat existující sadu</span>
        </label>
      </div>
      <div v-if="source === 'replicate'" class="mt-2">
        <select v-model="replicateSetId" class="w-full rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-4 py-2.5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option :value="null">— Vyber sadu —</option>
          <option v-for="s in lobbyStore.cardSets" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </div>
    </div>
    <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
    <button @click="submit" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl px-4 py-3 transition">
      Pokračovat →
    </button>
  </div>
</template>
```

**Step 2: Vytvoř `EditorWizardView.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useEditorStore } from '../stores/editorStore';
import WizardStep1 from '../components/editor/WizardStep1.vue';
import WizardStep2 from '../components/editor/WizardStep2.vue';
import WizardStep3 from '../components/editor/WizardStep3.vue';

const router = useRouter();
const editorStore = useEditorStore();
const step = ref(1);
const setId = ref<number | null>(null);
const replicateSetId = ref<number | null>(null);

async function onStep1(data: { name: string; description: string; isPublic: boolean; replicateSetId: number | null }) {
  const set = await editorStore.createSet({ name: data.name, description: data.description || undefined, isPublic: data.isPublic });
  if (!set) return;
  setId.value = set.id;
  replicateSetId.value = data.replicateSetId;
  step.value = 2;
}

function onStep2Done() { step.value = 3; }
function onFinish() { router.push('/editor'); }
</script>

<template>
  <div class="min-h-screen bg-zinc-50 dark:bg-zinc-900 p-4 md:p-8">
    <div class="max-w-2xl mx-auto">
      <div class="mb-6">
        <button @click="router.push('/editor')" class="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 mb-2">← Zpět</button>
        <h1 class="text-2xl font-bold text-zinc-900 dark:text-white">Nová sada karet</h1>
        <div class="flex gap-2 mt-3">
          <div v-for="n in 3" :key="n" :class="step >= n ? 'bg-indigo-600' : 'bg-zinc-200 dark:bg-zinc-700'" class="h-1.5 flex-1 rounded-full transition-colors" />
        </div>
        <p class="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
          Krok {{ step }} ze 3 —
          <span v-if="step === 1">Základní informace</span>
          <span v-else-if="step === 2">Výběr karet</span>
          <span v-else>Přidání nových karet</span>
        </p>
      </div>
      <div class="bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-6">
        <WizardStep1 v-if="step === 1" @submit="onStep1" />
        <WizardStep2 v-else-if="step === 2 && setId" :set-id="setId" :replicate-set-id="replicateSetId" @done="onStep2Done" />
        <WizardStep3 v-else-if="step === 3 && setId" :set-id="setId" @finish="onFinish" />
      </div>
    </div>
  </div>
</template>
```

**Step 3: Commit**

```bash
git add packages/frontend/src/components/editor/WizardStep1.vue packages/frontend/src/views/EditorWizardView.vue
git commit -m "feat: add WizardStep1 and EditorWizardView"
```

---

## Task 13: CardFilterBar + CardBrowser

**Files:**
- Create: `packages/frontend/src/components/editor/CardFilterBar.vue`
- Create: `packages/frontend/src/components/editor/CardBrowser.vue`

**Step 1: Vytvoř `CardFilterBar.vue`**

```vue
<script setup lang="ts">
import { ref, watch } from 'vue';
import { useLobbyStore } from '../../stores/lobbyStore';

const props = defineProps<{
  type: 'black' | 'white';
  search: string;
  filterSetId: number | null;
}>();

const emit = defineEmits<{
  'update:type': [v: 'black' | 'white'];
  'update:search': [v: string];
  'update:filterSetId': [v: number | null];
}>();

const lobbyStore = useLobbyStore();
if (lobbyStore.cardSets.length === 0) lobbyStore.fetchCardSets();

let searchTimeout: ReturnType<typeof setTimeout>;
function onSearch(e: Event) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => emit('update:search', (e.target as HTMLInputElement).value), 300);
}
</script>

<template>
  <div class="flex flex-wrap gap-2 mb-4">
    <div class="flex rounded-xl overflow-hidden border border-zinc-300 dark:border-zinc-600">
      <button @click="emit('update:type', 'black')" :class="type === 'black' ? 'bg-zinc-900 text-white' : 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'" class="px-4 py-2 text-sm font-medium transition">
        ⬛ Černé ({{ type === 'black' ? '' : '' }})
      </button>
      <button @click="emit('update:type', 'white')" :class="type === 'white' ? 'bg-white text-zinc-900 border-l' : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-500'" class="px-4 py-2 text-sm font-medium transition border-l border-zinc-300 dark:border-zinc-600">
        ⬜ Bílé
      </button>
    </div>
    <input
      :value="search"
      @input="onSearch"
      type="search"
      placeholder="Hledat kartu..."
      class="flex-1 min-w-[160px] rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
    />
    <select
      :value="filterSetId ?? ''"
      @change="emit('update:filterSetId', ($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : null)"
      class="rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
    >
      <option value="">Všechny sady</option>
      <option v-for="s in lobbyStore.cardSets" :key="s.id" :value="s.id">{{ s.name }}</option>
    </select>
  </div>
</template>
```

**Step 2: Vytvoř `CardBrowser.vue`**

Přijímá `setId` (pro toggle membership), zobrazuje karty s checkboxy, stránkování.

```vue
<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useEditorStore } from '../../stores/editorStore';
import CardFilterBar from './CardFilterBar.vue';
import type { EditorCard } from '@kpl/shared';

const props = defineProps<{
  setId: number;
  selectedCardIds: Set<number>; // black or white depending on current type
  cardType: 'black' | 'white';
  initialFilterSetId?: number | null;
}>();

const emit = defineEmits<{
  toggle: [card: EditorCard, selected: boolean];
}>();

const editorStore = useEditorStore();
const type = ref<'black' | 'white'>(props.cardType);
const search = ref('');
const filterSetId = ref<number | null>(props.initialFilterSetId ?? null);

async function load() {
  await editorStore.fetchCards({ type: type.value, search: search.value, setId: filterSetId.value ?? undefined, page: editorStore.cardsPage });
}

watch([type, search, filterSetId], () => { editorStore.cardsPage = 1; load(); });
onMounted(load);

function changePage(p: number) {
  editorStore.cardsPage = p;
  load();
}
</script>

<template>
  <div>
    <CardFilterBar
      v-model:type="type"
      v-model:search="search"
      v-model:filterSetId="filterSetId"
    />
    <div class="text-xs text-zinc-400 mb-2">
      {{ editorStore.cardsTotal }} karet celkem · strana {{ editorStore.cardsPage }}
    </div>
    <div class="flex flex-col gap-1 max-h-96 overflow-y-auto pr-1">
      <label
        v-for="card in editorStore.cards"
        :key="card.id"
        class="flex items-start gap-3 p-2.5 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-700/50 cursor-pointer"
      >
        <input
          type="checkbox"
          :checked="selectedCardIds.has(card.id)"
          @change="emit('toggle', card, ($event.target as HTMLInputElement).checked)"
          class="mt-0.5 accent-indigo-600 shrink-0"
        />
        <span class="text-sm text-zinc-800 dark:text-zinc-200">
          {{ card.text }}
          <span v-if="card.type === 'black' && card.pick === 2" class="ml-1 text-xs text-zinc-400">(pick 2)</span>
        </span>
      </label>
    </div>
    <div v-if="editorStore.cardsTotal > 50" class="flex justify-between items-center mt-3">
      <button @click="changePage(editorStore.cardsPage - 1)" :disabled="editorStore.cardsPage <= 1" class="text-sm px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-700 disabled:opacity-40">← Předchozí</button>
      <span class="text-xs text-zinc-400">{{ editorStore.cardsPage }} / {{ Math.ceil(editorStore.cardsTotal / 50) }}</span>
      <button @click="changePage(editorStore.cardsPage + 1)" :disabled="editorStore.cardsPage >= Math.ceil(editorStore.cardsTotal / 50)" class="text-sm px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-700 disabled:opacity-40">Další →</button>
    </div>
  </div>
</template>
```

**Step 3: Commit**

```bash
git add packages/frontend/src/components/editor/CardFilterBar.vue packages/frontend/src/components/editor/CardBrowser.vue
git commit -m "feat: add CardFilterBar and CardBrowser shared editor components"
```

---

## Task 14: WizardStep2.vue

**Files:**
- Create: `packages/frontend/src/components/editor/WizardStep2.vue`

**Step 1: Vytvoř `WizardStep2.vue`**

Načte karty ze zdrojové sady (pokud replikace) a nastaví initial selection, pak uloží změny.

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useEditorStore } from '../../stores/editorStore';
import CardBrowser from './CardBrowser.vue';
import type { EditorCard } from '@kpl/shared';

const props = defineProps<{ setId: number; replicateSetId: number | null }>();
const emit = defineEmits<{ done: [] }>();

const editorStore = useEditorStore();
const selectedBlack = ref<Set<number>>(new Set());
const selectedWhite = ref<Set<number>>(new Set());
const activeType = ref<'black' | 'white'>('black');
const saving = ref(false);

onMounted(async () => {
  // Pokud replikace, načti karty zdrojové sady a předvyber
  if (props.replicateSetId) {
    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';
    // Načti všechny black karty zdrojové sady (max 500, stránkujeme)
    let page = 1, total = Infinity;
    while (selectedBlack.value.size < total) {
      const res = await fetch(`${BACKEND_URL}/api/editor/cards?type=black&setId=${props.replicateSetId}&page=${page}`, { credentials: 'include' });
      if (!res.ok) break;
      const data = await res.json();
      total = data.total;
      data.cards.forEach((c: EditorCard) => selectedBlack.value.add(c.id));
      if (data.cards.length < 50) break;
      page++;
    }
    page = 1; total = Infinity;
    while (selectedWhite.value.size < total) {
      const res = await fetch(`${BACKEND_URL}/api/editor/cards?type=white&setId=${props.replicateSetId}&page=${page}`, { credentials: 'include' });
      if (!res.ok) break;
      const data = await res.json();
      total = data.total;
      data.cards.forEach((c: EditorCard) => selectedWhite.value.add(c.id));
      if (data.cards.length < 50) break;
      page++;
    }
  }
});

async function toggle(card: EditorCard, selected: boolean) {
  const set = card.type === 'black' ? selectedBlack : selectedWhite;
  if (selected) {
    set.value.add(card.id);
    await editorStore.addCardToSet(props.setId, card.type, card.id);
  } else {
    set.value.delete(card.id);
    await editorStore.removeCardFromSet(props.setId, card.type, card.id);
  }
}
</script>

<template>
  <div>
    <p class="text-sm text-zinc-500 dark:text-zinc-400 mb-4">Vyber karty, které budou součástí sady. Změny se ukládají průběžně.</p>
    <div class="text-xs text-zinc-400 mb-3 flex gap-4">
      <span>⬛ {{ selectedBlack.size }} černých vybráno</span>
      <span>⬜ {{ selectedWhite.size }} bílých vybráno</span>
    </div>
    <CardBrowser
      :set-id="setId"
      :selected-card-ids="activeType === 'black' ? selectedBlack : selectedWhite"
      :card-type="activeType"
      :initial-filter-set-id="replicateSetId"
      @toggle="toggle"
    />
    <div class="flex justify-end mt-6">
      <button @click="emit('done')" class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl px-5 py-2.5 transition">
        Pokračovat →
      </button>
    </div>
  </div>
</template>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/editor/WizardStep2.vue
git commit -m "feat: add WizardStep2 card selection with replicate support"
```

---

## Task 15: WizardStep3.vue

**Files:**
- Create: `packages/frontend/src/components/editor/WizardStep3.vue`

**Step 1: Vytvoř `WizardStep3.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useEditorStore } from '../../stores/editorStore';
import type { EditorCard } from '@kpl/shared';

const props = defineProps<{ setId: number }>();
const emit = defineEmits<{ finish: [] }>();

const editorStore = useEditorStore();
const type = ref<'black' | 'white'>('white');
const text = ref('');
const pick = ref(1);
const showTranslations = ref(false);
const translations = ref({ en: '', ru: '', uk: '', es: '' });
const addedCards = ref<EditorCard[]>([]);
const error = ref('');
const saving = ref(false);

async function addCard() {
  if (!text.value.trim()) { error.value = 'Text karty je povinný.'; return; }
  saving.value = true;
  error.value = '';
  const trans = Object.fromEntries(
    Object.entries(translations.value).filter(([, v]) => v.trim())
  ) as Record<string, string>;
  const card = await editorStore.createCard({
    type: type.value, text: text.value.trim(),
    pick: type.value === 'black' ? pick.value : undefined,
    setId: props.setId,
    translations: Object.keys(trans).length > 0 ? trans : undefined,
  });
  saving.value = false;
  if (!card) { error.value = 'Nepodařilo se přidat kartu.'; return; }
  addedCards.value.unshift(card);
  text.value = '';
  pick.value = 1;
  translations.value = { en: '', ru: '', uk: '', es: '' };
  showTranslations.value = false;
}

async function removeAdded(card: EditorCard) {
  await editorStore.removeCardFromSet(props.setId, card.type, card.id);
  addedCards.value = addedCards.value.filter((c) => c.id !== card.id);
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <p class="text-sm text-zinc-500 dark:text-zinc-400">Přidej nové karty do sady. Tuto část můžeš přeskočit — karty lze přidávat i později.</p>

    <div class="flex rounded-xl overflow-hidden border border-zinc-300 dark:border-zinc-600 w-fit">
      <button @click="type = 'white'" :class="type === 'white' ? 'bg-zinc-100 dark:bg-zinc-600 font-semibold' : 'bg-white dark:bg-zinc-800'" class="px-4 py-2 text-sm transition">⬜ Bílá</button>
      <button @click="type = 'black'" :class="type === 'black' ? 'bg-zinc-900 text-white font-semibold' : 'bg-white dark:bg-zinc-800 dark:text-zinc-300'" class="px-4 py-2 text-sm transition border-l border-zinc-300 dark:border-zinc-600">⬛ Černá</button>
    </div>

    <textarea v-model="text" :placeholder="type === 'black' ? 'Text otázky (použij ____ pro doplnění)' : 'Text karty'" rows="3" class="w-full rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-4 py-3 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />

    <div v-if="type === 'black'" class="flex items-center gap-3">
      <span class="text-sm text-zinc-600 dark:text-zinc-400">Počet karet k výběru:</span>
      <select v-model="pick" class="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm">
        <option :value="1">1</option>
        <option :value="2">2</option>
      </select>
    </div>

    <div>
      <button @click="showTranslations = !showTranslations" class="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
        {{ showTranslations ? '▲ Skrýt překlady' : '▼ Přidat překlady (volitelné)' }}
      </button>
      <div v-if="showTranslations" class="grid grid-cols-2 gap-3 mt-2">
        <div v-for="lang in ['en', 'ru', 'uk', 'es']" :key="lang">
          <label class="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase mb-1 block">{{ lang }}</label>
          <textarea v-model="translations[lang as keyof typeof translations]" rows="2" class="w-full rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
        </div>
      </div>
    </div>

    <p v-if="error" class="text-sm text-red-500">{{ error }}</p>

    <button @click="addCard" :disabled="saving" class="bg-zinc-800 dark:bg-zinc-100 hover:bg-zinc-700 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-semibold rounded-xl px-4 py-2.5 transition disabled:opacity-60">
      {{ saving ? 'Ukládám...' : '+ Přidat kartu' }}
    </button>

    <div v-if="addedCards.length > 0" class="border-t border-zinc-200 dark:border-zinc-700 pt-4">
      <p class="text-xs text-zinc-400 mb-2">Přidáno v této session ({{ addedCards.length }})</p>
      <div class="flex flex-col gap-1 max-h-48 overflow-y-auto">
        <div v-for="card in addedCards" :key="card.id" class="flex items-center justify-between gap-2 text-sm bg-zinc-50 dark:bg-zinc-700/50 rounded-xl px-3 py-2">
          <span :class="card.type === 'black' ? 'text-zinc-900 dark:text-white' : 'text-zinc-700 dark:text-zinc-300'">
            {{ card.type === 'black' ? '⬛' : '⬜' }} {{ card.text }}
          </span>
          <button @click="removeAdded(card)" class="text-red-400 hover:text-red-600 text-xs shrink-0">Smazat</button>
        </div>
      </div>
    </div>

    <div class="flex justify-between items-center pt-2 border-t border-zinc-200 dark:border-zinc-700 mt-2">
      <span class="text-sm text-zinc-400">Karty lze přidávat i po dokončení průvodce.</span>
      <button @click="emit('finish')" class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl px-5 py-2.5 transition">
        Dokončit ✓
      </button>
    </div>
  </div>
</template>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/editor/WizardStep3.vue
git commit -m "feat: add WizardStep3 new card creation form"
```

---

## Task 16: EditorSetView.vue

**Files:**
- Create: `packages/frontend/src/views/EditorSetView.vue`

**Step 1: Vytvoř `EditorSetView.vue`**

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useEditorStore } from '../stores/editorStore';
import CardBrowser from '../components/editor/CardBrowser.vue';
import WizardStep3 from '../components/editor/WizardStep3.vue';
import type { EditorCard } from '@kpl/shared';

const route = useRoute();
const router = useRouter();
const editorStore = useEditorStore();
const setId = Number(route.params.id);
const selectedBlack = ref<Set<number>>(new Set());
const selectedWhite = ref<Set<number>>(new Set());
const editingName = ref(false);
const nameInput = ref('');
const activeTab = ref<'cards' | 'add'>('cards');

onMounted(async () => {
  await editorStore.fetchSet(setId);
  if (editorStore.currentSet) nameInput.value = editorStore.currentSet.name;
  // Načti aktuální membership pro black
  let page = 1;
  while (true) {
    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';
    const res = await fetch(`${BACKEND_URL}/api/editor/cards?type=black&setId=${setId}&page=${page}`, { credentials: 'include' });
    if (!res.ok) break;
    const data = await res.json();
    data.cards.forEach((c: EditorCard) => selectedBlack.value.add(c.id));
    if (data.cards.length < 50) break;
    page++;
  }
  page = 1;
  while (true) {
    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';
    const res = await fetch(`${BACKEND_URL}/api/editor/cards?type=white&setId=${setId}&page=${page}`, { credentials: 'include' });
    if (!res.ok) break;
    const data = await res.json();
    data.cards.forEach((c: EditorCard) => selectedWhite.value.add(c.id));
    if (data.cards.length < 50) break;
    page++;
  }
});

async function saveName() {
  if (nameInput.value.trim()) {
    await editorStore.updateSet(setId, { name: nameInput.value.trim() });
  }
  editingName.value = false;
}

async function toggle(card: EditorCard, selected: boolean) {
  const set = card.type === 'black' ? selectedBlack : selectedWhite;
  if (selected) { set.value.add(card.id); await editorStore.addCardToSet(setId, card.type, card.id); }
  else { set.value.delete(card.id); await editorStore.removeCardFromSet(setId, card.type, card.id); }
}
</script>

<template>
  <div class="min-h-screen bg-zinc-50 dark:bg-zinc-900 p-4 md:p-8">
    <div class="max-w-2xl mx-auto">
      <button @click="router.push('/editor')" class="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 mb-4">← Moje sady</button>

      <div v-if="editorStore.currentSet" class="mb-6">
        <div class="flex items-center gap-2" v-if="!editingName">
          <h1 class="text-2xl font-bold text-zinc-900 dark:text-white">{{ editorStore.currentSet.name }}</h1>
          <button @click="editingName = true; nameInput = editorStore.currentSet!.name" class="text-zinc-400 hover:text-zinc-600 text-sm">✏️</button>
        </div>
        <div v-else class="flex gap-2">
          <input v-model="nameInput" maxlength="64" class="flex-1 rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-4 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" @keyup.enter="saveName" @keyup.escape="editingName = false" />
          <button @click="saveName" class="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">Uložit</button>
        </div>
        <p class="text-sm text-zinc-400 mt-1">⬛ {{ editorStore.currentSet.blackCount }} · ⬜ {{ editorStore.currentSet.whiteCount }}</p>
      </div>

      <div class="flex gap-1 mb-4 bg-zinc-100 dark:bg-zinc-800 rounded-xl p-1 w-fit">
        <button @click="activeTab = 'cards'" :class="activeTab === 'cards' ? 'bg-white dark:bg-zinc-700 shadow' : ''" class="px-4 py-1.5 rounded-lg text-sm font-medium transition">Vybrat karty</button>
        <button @click="activeTab = 'add'" :class="activeTab === 'add' ? 'bg-white dark:bg-zinc-700 shadow' : ''" class="px-4 py-1.5 rounded-lg text-sm font-medium transition">Přidat nové</button>
      </div>

      <div class="bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-5">
        <CardBrowser v-if="activeTab === 'cards'"
          :set-id="setId"
          :selected-card-ids="selectedBlack"
          card-type="black"
          @toggle="toggle"
        />
        <WizardStep3 v-else :set-id="setId" @finish="router.push('/editor')" />
      </div>
    </div>
  </div>
</template>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/views/EditorSetView.vue
git commit -m "feat: add EditorSetView for editing existing card sets"
```

---

## Task 17: Tlačítko v HomeView

**Files:**
- Modify: `packages/frontend/src/views/HomeView.vue`

**Step 1: Přidej import a tlačítko**

V `<script setup>` přidej import router: `import { useRouter } from 'vue-router';` (už tam je) a ujisti se, že `profileStore.isAuthenticated` je dostupné.

V šabloně najdi sekci se seznamem karetních sad a přidej podmíněné tlačítko. Přesné umístění záleží na template — hledej oblast poblíž `lobbyStore.cardSets`. Přidej:

```html
<div v-if="profileStore.isAuthenticated" class="mt-4 text-center">
  <button
    @click="router.push('/editor')"
    class="text-sm text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
  >
    🃏 Spravovat moje sady karet →
  </button>
</div>
```

**Step 2: Zkontroluj v prohlížeči, že tlačítko je viditelné pro přihlášeného uživatele a skryté pro nepřihlášeného**

**Step 3: Commit**

```bash
git add packages/frontend/src/views/HomeView.vue
git commit -m "feat: add card editor link in HomeView for authenticated users"
```

---

## Závěrečná kontrola

```bash
# Backend testy
npm test --workspace=packages/backend

# Dev server — ověř UI průchod
npm run dev:backend &
npm run dev:frontend
```

Otevři `http://localhost:5173`, přihlas se přes OAuth, ověř:
1. Tlačítko "Moje sady karet" je viditelné
2. `/editor` zobrazí dashboard
3. Průvodce projde všemi 3 kroky
4. Editace existující sady funguje
