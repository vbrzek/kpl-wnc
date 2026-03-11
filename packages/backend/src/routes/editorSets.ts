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

async function isCardMaster(userId: number): Promise<boolean> {
  const user = await db('users').where({ id: userId }).select('role').first();
  return user?.role === 'card-master';
}

async function findSetForUser(setId: number, userId: number): Promise<any> {
  if (await isCardMaster(userId)) {
    return db('card_sets').where({ id: setId }).first();
  }
  return db('card_sets').where({ id: setId, user_id: userId }).first();
}

const editorSetsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest('jwtUser', undefined);

  // GET /api/editor/sets?view=mine|all — moje sady (+ veřejné), nebo všechny (card-master only)
  fastify.get('/editor/sets', { preHandler: verifyJwt }, async (request, reply) => {
    const { userId } = request.jwtUser!;
    const { view } = request.query as { view?: string };
    const cardMaster = await isCardMaster(userId);

    let query = db('card_sets')
      .select(
        'card_sets.id', 'card_sets.name', 'card_sets.description', 'card_sets.is_public', 'card_sets.user_id',
        db.raw('(SELECT COUNT(*) FROM card_set_black_cards WHERE card_set_id = card_sets.id) as black_count'),
        db.raw('(SELECT COUNT(*) FROM card_set_white_cards WHERE card_set_id = card_sets.id) as white_count'),
        db.raw('(SELECT nickname FROM users WHERE users.id = card_sets.user_id) as owner_nickname'),
      )
      .orderBy('card_sets.name');

    if (view === 'all' && cardMaster) {
      // card-master vidí všechny sady (uživatelské + systémové veřejné)
      query = query.where(function () {
        this.whereNotNull('card_sets.user_id').orWhere({ 'card_sets.is_public': true });
      });
    } else {
      // vlastní + veřejné (včetně systémových)
      query = query.where(function () {
        this.where({ 'card_sets.user_id': userId }).orWhere({ 'card_sets.is_public': true });
      });
    }

    const rows = await query;
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isPublic: Boolean(r.is_public),
      isOwn: r.user_id === userId,
      ownerNickname: r.owner_nickname ?? null,
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
    const user = await db('users').where({ id: userId }).select('role').first();
    const canPublish = user?.role === 'card-master';
    const finalIsPublic = canPublish && isPublic;
    const [id] = await db('card_sets').insert({ name, description: description ?? null, is_public: finalIsPublic, user_id: userId });
    return { id, name, description: description ?? null, isPublic: finalIsPublic, blackCount: 0, whiteCount: 0 };
  });

  // GET /api/editor/sets/:id — detail sady
  fastify.get('/editor/sets/:id', { preHandler: verifyJwt }, async (request, reply) => {
    const { userId } = request.jwtUser!;
    const { id } = request.params as { id: string };
    const row = await findSetForUser(Number(id), userId);
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
    const existing = await findSetForUser(Number(id), userId);
    if (!existing) return reply.status(404).send({ error: 'Sada nenalezena.' });
    const canPublish = await isCardMaster(userId);
    const updates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;
    if (parsed.data.isPublic !== undefined) updates.is_public = canPublish ? parsed.data.isPublic : false;
    await db('card_sets').where({ id: Number(id) }).update(updates);
    const updated = await db('card_sets').where({ id: Number(id) }).first();
    return { id: updated.id, name: updated.name, description: updated.description, isPublic: Boolean(updated.is_public) };
  });

  // DELETE /api/editor/sets/:id
  fastify.delete('/editor/sets/:id', { preHandler: verifyJwt }, async (request, reply) => {
    const { userId } = request.jwtUser!;
    const { id } = request.params as { id: string };
    const existing = await findSetForUser(Number(id), userId);
    if (!existing) return reply.status(404).send({ error: 'Sada nenalezena.' });
    await db('card_sets').where({ id: Number(id) }).delete();
    return { ok: true };
  });

  // POST /api/editor/sets/:id/replicate — zkopíruj karty ze zdrojové sady
  fastify.post('/editor/sets/:id/replicate', { preHandler: verifyJwt }, async (request, reply) => {
    const { userId } = request.jwtUser!;
    const { id } = request.params as { id: string };
    const { sourceSetId } = request.body as { sourceSetId: number };
    if (!sourceSetId) return reply.status(400).send({ error: 'Chybí sourceSetId.' });
    const target = await findSetForUser(Number(id), userId);
    if (!target) return reply.status(404).send({ error: 'Cílová sada nenalezena.' });
    // Zkopíruj black karty
    const blackCards = await db('card_set_black_cards').where({ card_set_id: sourceSetId }).select('black_card_id');
    if (blackCards.length > 0) {
      await db('card_set_black_cards').insert(blackCards.map((r: any) => ({ card_set_id: Number(id), black_card_id: r.black_card_id }))).onConflict().ignore();
    }
    // Zkopíruj white karty
    const whiteCards = await db('card_set_white_cards').where({ card_set_id: sourceSetId }).select('white_card_id');
    if (whiteCards.length > 0) {
      await db('card_set_white_cards').insert(whiteCards.map((r: any) => ({ card_set_id: Number(id), white_card_id: r.white_card_id }))).onConflict().ignore();
    }
    return { ok: true, blackCount: blackCards.length, whiteCount: whiteCards.length };
  });

  // POST /api/editor/sets/:id/cards — přidej kartu do sady
  fastify.post('/editor/sets/:id/cards', { preHandler: verifyJwt }, async (request, reply) => {
    const { userId } = request.jwtUser!;
    const { id } = request.params as { id: string };
    const { type, cardId } = request.body as { type: 'black' | 'white'; cardId: number };
    if (!type || !cardId) return reply.status(400).send({ error: 'Chybí type nebo cardId.' });
    const existing = await findSetForUser(Number(id), userId);
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
    const existing = await findSetForUser(Number(id), userId);
    if (!existing) return reply.status(404).send({ error: 'Sada nenalezena.' });
    const table = type === 'black' ? 'card_set_black_cards' : 'card_set_white_cards';
    const cardCol = type === 'black' ? 'black_card_id' : 'white_card_id';
    await db(table).where({ card_set_id: Number(id), [cardCol]: Number(cardId) }).delete();
    return { ok: true };
  });
};

export default editorSetsRoutes;
