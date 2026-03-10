# Card Deduplication & M:N Schema — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deduplikovat karty v DB a přejít na M:N vazbu mezi sadami a kartami přes junction tabulky.

**Architecture:** Jedna Knex migration načte stará data, deduplikuje v paměti, přestaví schéma a uloží čistá data. Dvě routes a jeden seed generátor se aktualizují pro nové schéma.

**Tech Stack:** Knex migrations (MySQL2), TypeScript, tsx

---

### Task 1: Knex migration — schéma + data

**Files:**
- Create: `packages/backend/src/db/migrations/20260310000000_deduplicate_cards.ts`

**Step 1: Vytvoř migration soubor**

```typescript
import type { Knex } from 'knex';

interface OldBlackCard {
  id: number;
  card_set_id: number;
  text: string;
  pick: number;
}

interface OldWhiteCard {
  id: number;
  card_set_id: number;
  text: string;
}

interface Translation {
  card_id: number;
  language_code: string;
  text: string;
}

export async function up(knex: Knex): Promise<void> {
  // ── 1. Načti stará data ──────────────────────────────────────────────────
  const oldBlack = await knex<OldBlackCard>('black_cards').select('id', 'card_set_id', 'text', 'pick');
  const oldWhite = await knex<OldWhiteCard>('white_cards').select('id', 'card_set_id', 'text');
  const blackTrans = await knex('black_card_translations').select<Translation[]>(
    'black_card_id as card_id', 'language_code', 'text',
  );
  const whiteTrans = await knex('white_card_translations').select<Translation[]>(
    'white_card_id as card_id', 'language_code', 'text',
  );

  // ── 2. Deduplikace ───────────────────────────────────────────────────────
  // Překlady indexované starým card ID
  const blackTransByOldId = groupBy(blackTrans, (t) => t.card_id);
  const whiteTransByOldId = groupBy(whiteTrans, (t) => t.card_id);

  // Black cards: klíč = "text|pick"
  const dedupBlack = deduplicate(
    oldBlack,
    (c) => `${c.text.trim()}|${c.pick}`,
    (c) => blackTransByOldId.get(c.id) ?? [],
  );

  // White cards: klíč = "text"
  const dedupWhite = deduplicate(
    oldWhite,
    (c) => c.text.trim(),
    (c) => whiteTransByOldId.get(c.id) ?? [],
  );

  // ── 3. Schema změny ──────────────────────────────────────────────────────
  await knex.schema.table('black_cards', (table) => {
    table.dropForeign(['card_set_id']);
    table.dropColumn('card_set_id');
  });
  await knex.schema.table('white_cards', (table) => {
    table.dropForeign(['card_set_id']);
    table.dropColumn('card_set_id');
  });

  await knex.schema.createTable('card_set_black_cards', (table) => {
    table.integer('card_set_id').unsigned().notNullable();
    table.integer('black_card_id').unsigned().notNullable();
    table.primary(['card_set_id', 'black_card_id']);
    table.foreign('card_set_id').references('id').inTable('card_sets').onDelete('CASCADE');
    table.foreign('black_card_id').references('id').inTable('black_cards').onDelete('CASCADE');
  });

  await knex.schema.createTable('card_set_white_cards', (table) => {
    table.integer('card_set_id').unsigned().notNullable();
    table.integer('white_card_id').unsigned().notNullable();
    table.primary(['card_set_id', 'white_card_id']);
    table.foreign('card_set_id').references('id').inTable('card_sets').onDelete('CASCADE');
    table.foreign('white_card_id').references('id').inTable('white_cards').onDelete('CASCADE');
  });

  // ── 4. Čistý zápis dat ───────────────────────────────────────────────────
  await knex.raw('SET FOREIGN_KEY_CHECKS=0');
  await knex('black_card_translations').truncate();
  await knex('white_card_translations').truncate();
  await knex('black_cards').truncate();
  await knex('white_cards').truncate();
  await knex.raw('SET FOREIGN_KEY_CHECKS=1');

  // INSERT karty (IDs budou 1, 2, 3, ...)
  if (dedupBlack.cards.length > 0) {
    await knex('black_cards').insert(
      dedupBlack.cards.map((c) => ({ text: c.text, pick: c.pick })),
    );
  }
  if (dedupWhite.cards.length > 0) {
    await knex('white_cards').insert(
      dedupWhite.cards.map((c) => ({ text: c.text })),
    );
  }

  // Načti nová IDs (přiřazená DB po insertu)
  const newBlack = await knex('black_cards').select<{ id: number; text: string; pick: number }[]>('id', 'text', 'pick');
  const newWhite = await knex('white_cards').select<{ id: number; text: string }[]>('id', 'text');

  // Mapuj klíč → nové ID
  const blackKeyToNewId = new Map(newBlack.map((c) => [`${c.text.trim()}|${c.pick}`, c.id]));
  const whiteKeyToNewId = new Map(newWhite.map((c) => [c.text.trim(), c.id]));

  // INSERT překlady s novými IDs
  const newBlackTrans = dedupBlack.translations
    .map(({ key, language_code, text }) => {
      const newId = blackKeyToNewId.get(key);
      return newId ? { black_card_id: newId, language_code, text } : null;
    })
    .filter(Boolean) as { black_card_id: number; language_code: string; text: string }[];

  const newWhiteTrans = dedupWhite.translations
    .map(({ key, language_code, text }) => {
      const newId = whiteKeyToNewId.get(key);
      return newId ? { white_card_id: newId, language_code, text } : null;
    })
    .filter(Boolean) as { white_card_id: number; language_code: string; text: string }[];

  if (newBlackTrans.length > 0) await knex('black_card_translations').insert(newBlackTrans);
  if (newWhiteTrans.length > 0) await knex('white_card_translations').insert(newWhiteTrans);

  // INSERT junction tabulky
  const blackJunction = dedupBlack.setMemberships
    .map(({ key, card_set_id }) => {
      const newId = blackKeyToNewId.get(key);
      return newId ? { card_set_id, black_card_id: newId } : null;
    })
    .filter(Boolean) as { card_set_id: number; black_card_id: number }[];

  const whiteJunction = dedupWhite.setMemberships
    .map(({ key, card_set_id }) => {
      const newId = whiteKeyToNewId.get(key);
      return newId ? { card_set_id, white_card_id: newId } : null;
    })
    .filter(Boolean) as { card_set_id: number; white_card_id: number }[];

  if (blackJunction.length > 0) await knex('card_set_black_cards').insert(blackJunction);
  if (whiteJunction.length > 0) await knex('card_set_white_cards').insert(whiteJunction);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('card_set_black_cards');
  await knex.schema.dropTableIfExists('card_set_white_cards');
  await knex.schema.table('black_cards', (table) => {
    table.integer('card_set_id').unsigned().nullable();
  });
  await knex.schema.table('white_cards', (table) => {
    table.integer('card_set_id').unsigned().nullable();
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function groupBy<T>(arr: T[], key: (item: T) => number): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const item of arr) {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
  }
  return map;
}

function deduplicate<T extends { id: number; card_set_id: number }>(
  cards: T[],
  keyFn: (c: T) => string,
  getTranslations: (c: T) => Translation[],
): {
  cards: T[];
  translations: { key: string; language_code: string; text: string }[];
  setMemberships: { key: string; card_set_id: number }[];
} {
  const seen = new Map<string, { card: T; langs: Map<string, string>; sets: Set<number> }>();

  for (const card of cards) {
    const key = keyFn(card);
    if (!seen.has(key)) {
      seen.set(key, { card, langs: new Map(), sets: new Set() });
    }
    const entry = seen.get(key)!;
    entry.sets.add(card.card_set_id);
    for (const t of getTranslations(card)) {
      if (!entry.langs.has(t.language_code)) {
        entry.langs.set(t.language_code, t.text);
      }
    }
  }

  const deduped = [...seen.values()];
  return {
    cards: deduped.map((e) => e.card),
    translations: deduped.flatMap((e) =>
      [...e.langs.entries()].map(([language_code, text]) => ({ key: keyFn(e.card), language_code, text })),
    ),
    setMemberships: deduped.flatMap((e) =>
      [...e.sets].map((card_set_id) => ({ key: keyFn(e.card), card_set_id })),
    ),
  };
}
```

**Step 2: Spusť migraci**

```bash
npm run migrate --workspace=packages/backend
```

Očekávej: `Batch N run: 1 migrations`

---

### Task 2: Aktualizuj `cardSets.ts` — COUNT přes junction tabulku

**Files:**
- Modify: `packages/backend/src/routes/cardSets.ts`

**Step 1: Uprav COUNT subquery**

Najdi řádky s `blackCardCount` a `whiteCardCount` a nahraď:

```typescript
// bylo:
db.raw('(SELECT COUNT(*) FROM black_cards WHERE card_set_id = card_sets.id) as blackCardCount'),
db.raw('(SELECT COUNT(*) FROM white_cards WHERE card_set_id = card_sets.id) as whiteCardCount'),

// nově:
db.raw('(SELECT COUNT(*) FROM card_set_black_cards WHERE card_set_id = card_sets.id) as blackCardCount'),
db.raw('(SELECT COUNT(*) FROM card_set_white_cards WHERE card_set_id = card_sets.id) as whiteCardCount'),
```

**Step 2: Manuálně ověř endpoint**

```bash
curl http://localhost:3000/api/card-sets | jq .
```

Očekávej: JSON se správnými `blackCardCount` a `whiteCardCount` pro obě sady.

---

### Task 3: Aktualizuj `lobbyHandlers.ts` — startGame queries

**Files:**
- Modify: `packages/backend/src/socket/lobbyHandlers.ts`

**Step 1: Najdi startGame card loading (kolem řádku 185)**

Nahraď oba dotazy:

```typescript
// bylo:
[blackCards, whiteCards] = await Promise.all([
  db('black_cards')
    .whereIn('card_set_id', room.selectedSetIds)
    .select<BlackCard[]>('id', 'text', 'pick'),
  db('white_cards')
    .whereIn('card_set_id', room.selectedSetIds)
    .select<WhiteCard[]>('id', 'text'),
]);

// nově:
[blackCards, whiteCards] = await Promise.all([
  db('black_cards')
    .join('card_set_black_cards as csbc', 'csbc.black_card_id', 'black_cards.id')
    .whereIn('csbc.card_set_id', room.selectedSetIds)
    .distinct()
    .select<BlackCard[]>('black_cards.id', 'black_cards.text', 'black_cards.pick'),
  db('white_cards')
    .join('card_set_white_cards as cswc', 'cswc.white_card_id', 'white_cards.id')
    .whereIn('cswc.card_set_id', room.selectedSetIds)
    .distinct()
    .select<WhiteCard[]>('white_cards.id', 'white_cards.text'),
]);
```

**Step 2: Ověř TypeScript kompilaci**

```bash
npx tsc --noEmit --project packages/backend/tsconfig.json
```

Očekávej: žádné chyby.

---

### Task 4: Spusť testy

**Files:** žádné změny — testy mockují Knex, nepotřebují živou DB

**Step 1: Spusť všechny testy**

```bash
npm test --workspace=packages/backend
```

Očekávej: 71 testů passing.

**Step 2: Commit**

```bash
git add packages/backend/src/db/migrations/20260310000000_deduplicate_cards.ts \
        packages/backend/src/routes/cardSets.ts \
        packages/backend/src/socket/lobbyHandlers.ts
git commit -m "feat: deduplicate cards and switch to M:N card set membership"
```

---

### Task 5: Generátor seedů

**Files:**
- Create: `packages/backend/scripts/generate-seeds.ts`

**Step 1: Vytvoř generátor**

```typescript
import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';
import knexLib from 'knex';

loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

const knex = knexLib({
  client: 'mysql2',
  connection: {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },
});

async function main() {
  const cardSets = await knex('card_sets').select('id', 'name', 'description', 'is_public', 'slug');
  const blackCards = await knex('black_cards').select('id', 'text', 'pick').orderBy('id');
  const whiteCards = await knex('white_cards').select('id', 'text').orderBy('id');
  const blackTrans = await knex('black_card_translations').select('black_card_id', 'language_code', 'text');
  const whiteTrans = await knex('white_card_translations').select('white_card_id', 'language_code', 'text');
  const blackAssign = await knex('card_set_black_cards').select('card_set_id', 'black_card_id');
  const whiteAssign = await knex('card_set_white_cards').select('card_set_id', 'white_card_id');

  await knex.destroy();

  const out = `import type { Knex } from 'knex';

// Auto-generated by scripts/generate-seeds.ts — $(date +%Y-%m-%d)
// DO NOT EDIT MANUALLY

export async function seed(knex: Knex): Promise<void> {
  await knex.raw('SET FOREIGN_KEY_CHECKS=0');
  await knex('card_set_black_cards').truncate();
  await knex('card_set_white_cards').truncate();
  await knex('black_card_translations').truncate();
  await knex('white_card_translations').truncate();
  await knex('black_cards').truncate();
  await knex('white_cards').truncate();
  await knex('card_sets').truncate();
  await knex.raw('SET FOREIGN_KEY_CHECKS=1');

  await knex('card_sets').insert(${JSON.stringify(cardSets, null, 4)});

  await knex('black_cards').insert(${JSON.stringify(blackCards.map(({ id, text, pick }) => ({ id, text, pick })), null, 4)});

  await knex('white_cards').insert(${JSON.stringify(whiteCards.map(({ id, text }) => ({ id, text })), null, 4)});
${blackTrans.length > 0 ? `
  await knex('black_card_translations').insert(${JSON.stringify(blackTrans, null, 4)});` : ''}
${whiteTrans.length > 0 ? `
  await knex('white_card_translations').insert(${JSON.stringify(whiteTrans, null, 4)});` : ''}

  await knex('card_set_black_cards').insert(${JSON.stringify(blackAssign, null, 4)});

  await knex('card_set_white_cards').insert(${JSON.stringify(whiteAssign, null, 4)});
}
`;

  const outPath = resolve(dirname(fileURLToPath(import.meta.url)), '../src/db/seeds/01_all_cards.ts');
  writeFileSync(outPath, out, 'utf-8');
  console.log(`Seed written to ${outPath}`);
  console.log(`  card_sets: ${cardSets.length}`);
  console.log(`  black_cards: ${blackCards.length} (deduplicated)`);
  console.log(`  white_cards: ${whiteCards.length} (deduplicated)`);
  console.log(`  black assignments: ${blackAssign.length}`);
  console.log(`  white assignments: ${whiteAssign.length}`);
}

main().catch(console.error);
```

**Step 2: Spusť generátor**

```bash
npx tsx packages/backend/scripts/generate-seeds.ts
```

Očekávej: výpis statistik (počty karet před/po deduplikaci).

**Step 3: Smaž staré seed soubory**

```bash
rm packages/backend/src/db/seeds/01_czech_set.ts
rm packages/backend/src/db/seeds/02_liberecaci_2026.ts
```

**Step 4: Ověř vygenerovaný seed kompiluje**

```bash
npx tsc --noEmit --project packages/backend/tsconfig.json
```

**Step 5: Commit**

```bash
git add packages/backend/scripts/generate-seeds.ts \
        packages/backend/src/db/seeds/
git commit -m "chore: generate seeds from deduplicated DB state"
```

---

### Task 6: Aktualizuj design dokument a MEMORY

**Files:**
- Modify: `docs/plans/2026-03-09-card-deduplication-design.md` — přidej poznatky z implementace
- Modify: `CLAUDE.md` — aktualizuj popis DB schématu a seed příkazu
