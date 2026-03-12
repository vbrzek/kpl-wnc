# LLM Translation Feature — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Přeložit pomocí AI" button to the card edit modal that calls Claude Haiku and fills in all four translation fields.

**Architecture:** Frontend button → `editorStore.translateCard()` → `POST /api/editor/cards/translate` (JWT + card-master guard) → Anthropic SDK → returns `{en, ru, uk, es}` → fills `modalTranslations` (no auto-save).

**Tech Stack:** `@anthropic-ai/sdk`, Fastify, Vue 3, Pinia, Vitest

**Worktree:** `.worktrees/feature/llm-translation`

---

### Task 1: Install Anthropic SDK and add env var

**Files:**
- Modify: `packages/backend/package.json`
- Modify: `.env.example`
- Modify: `.env`

**Step 1: Install SDK**

```bash
cd .worktrees/feature/llm-translation
npm install @anthropic-ai/sdk --workspace=packages/backend
```

Expected: `@anthropic-ai/sdk` appears in `packages/backend/package.json` dependencies.

**Step 2: Add env var to .env.example**

Add this line to `.env.example`:
```
ANTHROPIC_API_KEY=
```

**Step 3: Add real API key to .env**

Add to `.env` (real key, not committed):
```
ANTHROPIC_API_KEY=sk-ant-...
```

**Step 4: Commit**

```bash
git add packages/backend/package.json package-lock.json .env.example
git commit -m "chore: add @anthropic-ai/sdk dependency and ANTHROPIC_API_KEY env var"
```

---

### Task 2: Backend — write failing test for translate endpoint

**Files:**
- Modify: `packages/backend/src/routes/editorCards.test.ts`

**Step 1: Add test describe block at end of file**

```typescript
describe('POST /api/editor/cards/translate', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.resetAllMocks();
    app = Fastify({ logger: false });
    await app.register(cookie);
    await app.register(editorCardsRoutes, { prefix: '/api' });
    await app.ready();
  });

  it('returns 403 when user is not card-master', async () => {
    mockDb.mockReturnValue({
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ role: 'user' }),
    });
    const res = await app.inject({
      method: 'POST', url: '/api/editor/cards/translate',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Testovací karta', type: 'white' }),
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 when text is empty', async () => {
    mockDb.mockReturnValue({
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ role: 'card-master' }),
    });
    const res = await app.inject({
      method: 'POST', url: '/api/editor/cards/translate',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: '', type: 'white' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns translations when card-master calls with valid text', async () => {
    mockDb.mockReturnValue({
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ role: 'card-master' }),
    });
    const res = await app.inject({
      method: 'POST', url: '/api/editor/cards/translate',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Testovací karta', type: 'white' }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.translations).toHaveProperty('en');
    expect(body.translations).toHaveProperty('ru');
    expect(body.translations).toHaveProperty('uk');
    expect(body.translations).toHaveProperty('es');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test --workspace=packages/backend 2>&1 | tail -20
```

Expected: 3 new tests FAIL (endpoint doesn't exist yet).

---

### Task 3: Backend — implement translate endpoint

**Files:**
- Modify: `packages/backend/src/routes/editorCards.ts`

**Step 1: Add Anthropic import at top of file** (after existing imports, line 5)

```typescript
import Anthropic from '@anthropic-ai/sdk';
```

**Step 2: Add translate endpoint** before the closing `};` of `editorCardsRoutes` (after the DELETE handler, around line 212)

```typescript
  // POST /api/editor/cards/translate — AI překlad do EN, RU, UK, ES — card-master only
  fastify.post('/editor/cards/translate', { preHandler: verifyJwt }, async (request, reply) => {
    const { userId } = request.jwtUser!;
    if (!(await isCardMaster(userId))) return reply.status(403).send({ error: 'Nemáš přístup.' });

    const TranslateSchema = z.object({
      text: z.string().min(1).max(500).trim(),
      type: z.enum(['black', 'white']),
    });
    const parsed = TranslateSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message });

    const { text } = parsed.data;

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: `You are a translation assistant for a Cards Against Humanity style party game called KPL.
Translate the given Czech card text into English, Russian, Ukrainian, and Spanish.

Rules:
- Preserve the original meaning, tone, and humor exactly
- Keep proper nouns and cultural references unchanged (do not adapt them)
- The game contains adult, politically incorrect, and dark humor — translate faithfully without softening
- Return ONLY valid JSON in this exact format: {"en":"...","ru":"...","uk":"...","es":"..."}
- No explanations, no markdown, just the JSON object`,
      messages: [{ role: 'user', content: text }],
    });

    const content = message.content[0];
    if (content.type !== 'text') return reply.status(500).send({ error: 'Neplatná odpověď z AI.' });

    let translations: Record<string, string>;
    try {
      translations = JSON.parse(content.text);
    } catch {
      return reply.status(500).send({ error: 'AI vrátila neplatný formát.' });
    }

    return { translations };
  });
```

**Step 3: Mock Anthropic in test file**

At top of `editorCards.test.ts`, add mock after existing mocks (line 9):

```typescript
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '{"en":"Test card","ru":"Тестовая карта","uk":"Тестова картка","es":"Tarjeta de prueba"}' }],
      }),
    },
  })),
}));
```

**Step 4: Run tests**

```bash
npm test --workspace=packages/backend 2>&1 | tail -20
```

Expected: All 144 tests pass (141 original + 3 new).

**Step 5: Commit**

```bash
git add packages/backend/src/routes/editorCards.ts packages/backend/src/routes/editorCards.test.ts
git commit -m "feat: add POST /api/editor/cards/translate endpoint with Claude Haiku"
```

---

### Task 4: Frontend store — add translateCard method

**Files:**
- Modify: `packages/frontend/src/stores/editorStore.ts`

**Step 1: Add method** before the `return {` statement (around line 144)

```typescript
  async function translateCard(text: string, type: 'black' | 'white'): Promise<Record<string, string> | null> {
    const res = await fetch(`${BACKEND_URL}/api/editor/cards/translate`, {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, type }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.translations ?? null;
  }
```

**Step 2: Expose in return object** — add `translateCard` to the return statement:

```typescript
    fetchCards, fetchCardDetail, updateCard, deleteCard, addCardToSet, removeCardFromSet, replicateSet, createCard, translateCard,
```

**Step 3: Commit**

```bash
git add packages/frontend/src/stores/editorStore.ts
git commit -m "feat: add translateCard action to editorStore"
```

---

### Task 5: Frontend — add translate button to modal

**Files:**
- Modify: `packages/frontend/src/views/EditorCardsView.vue`

**Step 1: Add modalTranslating ref** in the script setup block, after `modalSaving` (around line 25):

```typescript
const modalTranslating = ref(false);
```

**Step 2: Add translateModal function** in script setup, after `handleDelete` function (around line 92):

```typescript
async function translateModal() {
  if (!modalText.value.trim()) return;
  modalTranslating.value = true;
  const result = await editorStore.translateCard(modalText.value.trim(), modalCard.value?.type ?? 'white');
  if (result) {
    for (const lang of ['en', 'ru', 'uk', 'es']) {
      if (result[lang]) modalTranslations.value[lang] = result[lang];
    }
  }
  modalTranslating.value = false;
}
```

**Step 3: Add translate button in template** — insert between the Text section and Překlady section (between `</div>` closing the Pick block and `<!-- Překlady -->` comment, around line 197). Add also `v-if` for card-master check. Import `useProfileStore` at top:

Add to imports in script setup:
```typescript
import { useProfileStore } from '../stores/profileStore';
const profileStore = useProfileStore();
const isCardMaster = computed(() => profileStore.oauthUser?.role === 'card-master');
```

Add `computed` to the vue import line (it's already there).

Insert in template between Pick block and Překlady section:

```html
          <!-- AI překlad -->
          <div v-if="isCardMaster">
            <button
              @click="translateModal"
              :disabled="modalTranslating || !modalText.trim()"
              class="w-full rounded-xl border border-indigo-400 dark:border-indigo-500 text-indigo-600 dark:text-indigo-400 px-4 py-2 text-sm font-semibold hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {{ modalTranslating ? 'Překládám…' : 'Přeložit pomocí AI' }}
            </button>
          </div>
```

**Step 4: Commit**

```bash
git add packages/frontend/src/views/EditorCardsView.vue packages/frontend/src/stores/editorStore.ts
git commit -m "feat: add AI translate button to card edit modal"
```

---

### Task 6: Final verification

**Step 1: Run all backend tests**

```bash
npm test --workspace=packages/backend 2>&1 | tail -10
```

Expected: 144 tests pass, 0 failures.

**Step 2: Build check**

```bash
npm run build 2>&1 | tail -20
```

Expected: No TypeScript errors.

**Step 3: Commit if build revealed any fixes needed, then done.**
