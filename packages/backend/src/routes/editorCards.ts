import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import db from '../db/db.js';
import { verifyJwt } from '../auth/middleware.js';
import Anthropic from '@anthropic-ai/sdk';

async function canAccessSet(setId: number, userId: number): Promise<boolean> {
  const user = await db('users').where({ id: userId }).select('role').first();
  if (user?.role === 'card-master') {
    const set = await db('card_sets').where({ id: setId }).first();
    return !!set;
  }
  const set = await db('card_sets').where({ id: setId, user_id: userId }).first();
  return !!set;
}

async function isCardMaster(userId: number): Promise<boolean> {
  const user = await db('users').where({ id: userId }).select('role').first();
  return user?.role === 'card-master';
}

const UpdateCardSchema = z.object({
  text: z.string().min(1).max(500).trim().optional(),
  pick: z.number().int().min(1).max(4).optional(),
  translations: z.record(z.enum(['en', 'ru', 'uk', 'es']), z.string().max(500).trim()).optional(),
});

const NewCardSchema = z.object({
  type: z.enum(['black', 'white']),
  text: z.string().min(1).max(500).trim(),
  pick: z.number().int().min(1).max(4).optional().default(1),
  setId: z.number().int().positive(),
  translations: z.record(z.enum(['en', 'ru', 'uk', 'es']), z.string().max(500).trim()).optional(),
});

const editorCardsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest('jwtUser', undefined);

  // GET /api/editor/cards?type=black|white&search=...&setId=...&excludeSetId=...&page=...
  fastify.get('/editor/cards', { preHandler: verifyJwt }, async (request) => {
    const { type, search, setId, excludeSetId, untranslated, unassigned, page } = request.query as {
      type?: 'black' | 'white';
      search?: string;
      setId?: string;
      excludeSetId?: string;
      untranslated?: string;
      unassigned?: string;
      page?: string;
    };
    const PAGE_SIZE = 15;
    const pageNum = Math.max(1, Number(page ?? 1));
    const offset = (pageNum - 1) * PAGE_SIZE;

    function applyBlackFilters(q: any) {
      if (search) q.whereILike('text', `%${search}%`);
      if (setId) q.whereIn('id', db('card_set_black_cards').select('black_card_id').where({ card_set_id: Number(setId) }));
      if (excludeSetId) q.whereNotIn('id', db('card_set_black_cards').select('black_card_id').where({ card_set_id: Number(excludeSetId) }));
      if (untranslated === 'true') q.where(db.raw('(SELECT COUNT(*) FROM black_card_translations WHERE black_card_id = black_cards.id) < 4'));
      if (unassigned === 'true') q.whereNotIn('id', db('card_set_black_cards').select('black_card_id'));
    }

    function applyWhiteFilters(q: any) {
      if (search) q.whereILike('text', `%${search}%`);
      if (setId) q.whereIn('id', db('card_set_white_cards').select('white_card_id').where({ card_set_id: Number(setId) }));
      if (excludeSetId) q.whereNotIn('id', db('card_set_white_cards').select('white_card_id').where({ card_set_id: Number(excludeSetId) }));
      if (untranslated === 'true') q.where(db.raw('(SELECT COUNT(*) FROM white_card_translations WHERE white_card_id = white_cards.id) < 4'));
      if (unassigned === 'true') q.whereNotIn('id', db('card_set_white_cards').select('white_card_id'));
    }

    if (type === 'black' || !type) {
      let query = db('black_cards').select('id', 'text', 'pick');
      applyBlackFilters(query);
      const totalRow = await db('black_cards').modify(applyBlackFilters).count('* as count').first();
      const cards = await query.orderBy('id').limit(PAGE_SIZE).offset(offset);
      if (type === 'black') {
        return { cards: cards.map((c: any) => ({ ...c, type: 'black' })), total: Number((totalRow as any)?.count ?? 0), page: pageNum };
      }
    }

    // type === 'white' or no type
    let query = db('white_cards').select('id', 'text');
    applyWhiteFilters(query);
    const totalRow = await db('white_cards')
      .modify(applyWhiteFilters)
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

    // Ověř přístup k sadě
    if (!(await canAccessSet(setId, userId))) return reply.status(403).send({ error: 'Sada nenalezena nebo nemáš přístup.' });

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
  // GET /api/editor/cards/:type/:id — detail karty (text, překlady, sady) — card-master only
  fastify.get('/editor/cards/:type/:id', { preHandler: verifyJwt }, async (request, reply) => {
    const { userId } = request.jwtUser!;
    if (!(await isCardMaster(userId))) return reply.status(403).send({ error: 'Nemáš přístup.' });
    const { type, id } = request.params as { type: 'black' | 'white'; id: string };
    const cardId = Number(id);

    if (type === 'black') {
      const card = await db('black_cards').where({ id: cardId }).first();
      if (!card) return reply.status(404).send({ error: 'Karta nenalezena.' });
      const translations = await db('black_card_translations').where({ black_card_id: cardId }).select('language_code', 'text');
      const sets = await db('card_set_black_cards')
        .join('card_sets', 'card_sets.id', 'card_set_black_cards.card_set_id')
        .where({ black_card_id: cardId })
        .select('card_sets.id', 'card_sets.name');
      return { id: card.id, type: 'black', text: card.text, pick: card.pick, translations: Object.fromEntries(translations.map((t: any) => [t.language_code, t.text])), sets };
    } else {
      const card = await db('white_cards').where({ id: cardId }).first();
      if (!card) return reply.status(404).send({ error: 'Karta nenalezena.' });
      const translations = await db('white_card_translations').where({ white_card_id: cardId }).select('language_code', 'text');
      const sets = await db('card_set_white_cards')
        .join('card_sets', 'card_sets.id', 'card_set_white_cards.card_set_id')
        .where({ white_card_id: cardId })
        .select('card_sets.id', 'card_sets.name');
      return { id: card.id, type: 'white', text: card.text, translations: Object.fromEntries(translations.map((t: any) => [t.language_code, t.text])), sets };
    }
  });

  // PATCH /api/editor/cards/:type/:id — úprava karty — card-master only
  fastify.patch('/editor/cards/:type/:id', { preHandler: verifyJwt }, async (request, reply) => {
    const { userId } = request.jwtUser!;
    if (!(await isCardMaster(userId))) return reply.status(403).send({ error: 'Nemáš přístup.' });
    const { type, id } = request.params as { type: 'black' | 'white'; id: string };
    const cardId = Number(id);
    const parsed = UpdateCardSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message });
    const { text, pick, translations } = parsed.data;

    if (type === 'black') {
      const card = await db('black_cards').where({ id: cardId }).first();
      if (!card) return reply.status(404).send({ error: 'Karta nenalezena.' });
      const updates: Record<string, unknown> = {};
      if (text !== undefined) updates.text = text;
      if (pick !== undefined) updates.pick = pick;
      if (Object.keys(updates).length > 0) await db('black_cards').where({ id: cardId }).update(updates);
      if (translations) {
        for (const [lang, t] of Object.entries(translations)) {
          if (t) {
            await db('black_card_translations').insert({ black_card_id: cardId, language_code: lang, text: t }).onConflict(['black_card_id', 'language_code']).merge();
          } else {
            await db('black_card_translations').where({ black_card_id: cardId, language_code: lang }).delete();
          }
        }
      }
    } else {
      const card = await db('white_cards').where({ id: cardId }).first();
      if (!card) return reply.status(404).send({ error: 'Karta nenalezena.' });
      if (text !== undefined) await db('white_cards').where({ id: cardId }).update({ text });
      if (translations) {
        for (const [lang, t] of Object.entries(translations)) {
          if (t) {
            await db('white_card_translations').insert({ white_card_id: cardId, language_code: lang, text: t }).onConflict(['white_card_id', 'language_code']).merge();
          } else {
            await db('white_card_translations').where({ white_card_id: cardId, language_code: lang }).delete();
          }
        }
      }
    }
    return { ok: true };
  });

  // DELETE /api/editor/cards/:type/:id — smazání karty — card-master only, jen pokud není v žádné sadě
  fastify.delete('/editor/cards/:type/:id', { preHandler: verifyJwt }, async (request, reply) => {
    const { userId } = request.jwtUser!;
    if (!(await isCardMaster(userId))) return reply.status(403).send({ error: 'Nemáš přístup.' });
    const { type, id } = request.params as { type: 'black' | 'white'; id: string };
    const cardId = Number(id);

    if (type === 'black') {
      const card = await db('black_cards').where({ id: cardId }).first();
      if (!card) return reply.status(404).send({ error: 'Karta nenalezena.' });
      const inSets = await db('card_set_black_cards').where({ black_card_id: cardId }).count('* as count').first();
      if (Number((inSets as any)?.count ?? 0) > 0) return reply.status(409).send({ error: 'Karta je součástí sady, nelze smazat.' });
      await db('black_card_translations').where({ black_card_id: cardId }).delete();
      await db('black_cards').where({ id: cardId }).delete();
    } else {
      const card = await db('white_cards').where({ id: cardId }).first();
      if (!card) return reply.status(404).send({ error: 'Karta nenalezena.' });
      const inSets = await db('card_set_white_cards').where({ white_card_id: cardId }).count('* as count').first();
      if (Number((inSets as any)?.count ?? 0) > 0) return reply.status(409).send({ error: 'Karta je součástí sady, nelze smazat.' });
      await db('white_card_translations').where({ white_card_id: cardId }).delete();
      await db('white_cards').where({ id: cardId }).delete();
    }
    return { ok: true };
  });

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
};

export default editorCardsRoutes;
