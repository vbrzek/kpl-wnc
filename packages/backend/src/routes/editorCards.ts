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
