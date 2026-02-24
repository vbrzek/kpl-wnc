import type { FastifyPluginAsync } from 'fastify';
import db from '../db/db.js';

interface CardSetRow {
  id: number;
  name: string;
  description: string | null;
  slug: string | null;
  isPublic: number;
  blackCardCount: string;
  whiteCardCount: string;
}

const cardSetsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/card-sets', async (_request, reply) => {
    try {
      const rows = await db('card_sets').select<CardSetRow[]>(
        'id',
        'name',
        'description',
        'slug',
        db.raw('is_public as isPublic'),
        db.raw('(SELECT COUNT(*) FROM black_cards WHERE card_set_id = card_sets.id) as blackCardCount'),
        db.raw('(SELECT COUNT(*) FROM white_cards WHERE card_set_id = card_sets.id) as whiteCardCount'),
      ).orderBy('name');

      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        slug: r.slug,
        isPublic: Boolean(r.isPublic),
        blackCardCount: Number(r.blackCardCount),
        whiteCardCount: Number(r.whiteCardCount),
      }));
    } catch (err) {
      fastify.log.error(err, 'card-sets query failed');
      return reply.status(500).send({ error: 'Nepodařilo se načíst sady karet.' });
    }
  });
};

export default cardSetsRoutes;
