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
