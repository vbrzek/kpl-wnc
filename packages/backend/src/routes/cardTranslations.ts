import type { FastifyPluginAsync } from 'fastify';
import type { Knex } from 'knex';
import db from '../db/db.js';

const SUPPORTED_LANGS = ['cs', 'en', 'ru', 'uk', 'es'] as const;
type SupportedLang = typeof SUPPORTED_LANGS[number];

export async function fetchCardTranslations(
  knex: Knex,
  lang: string,
  blackIds: number[],
  whiteIds: number[],
): Promise<{ black: Record<string, string>; white: Record<string, string> }> {
  const black: Record<string, string> = {};
  const white: Record<string, string> = {};

  if (blackIds.length > 0) {
    const rows = await knex('black_cards as b')
      .select<{ id: number; text: string }[]>(
        'b.id',
        knex.raw('COALESCE(t.text, b.text) as text'),
      )
      .leftJoin('black_card_translations as t', function () {
        this.on('t.black_card_id', '=', 'b.id').andOnVal('t.language_code', lang);
      })
      .whereIn('b.id', blackIds);
    for (const row of rows) black[String(row.id)] = row.text;
  }

  if (whiteIds.length > 0) {
    const rows = await knex('white_cards as w')
      .select<{ id: number; text: string }[]>(
        'w.id',
        knex.raw('COALESCE(t.text, w.text) as text'),
      )
      .leftJoin('white_card_translations as t', function () {
        this.on('t.white_card_id', '=', 'w.id').andOnVal('t.language_code', lang);
      })
      .whereIn('w.id', whiteIds);
    for (const row of rows) white[String(row.id)] = row.text;
  }

  return { black, white };
}

function parseIds(raw: string): number[] {
  return raw
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
}

const cardTranslationsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { lang?: string; blackIds?: string; whiteIds?: string };
  }>('/cards/translations', async (request, reply) => {
    const { lang = 'cs', blackIds = '', whiteIds = '' } = request.query;
    const safeLang = SUPPORTED_LANGS.includes(lang as SupportedLang) ? lang : 'cs';

    try {
      return await fetchCardTranslations(
        db,
        safeLang,
        parseIds(blackIds),
        parseIds(whiteIds),
      );
    } catch (err) {
      fastify.log.error(err, 'card translations query failed');
      return reply.status(500).send({ error: 'Failed to fetch translations' });
    }
  });
};

export default cardTranslationsRoute;
