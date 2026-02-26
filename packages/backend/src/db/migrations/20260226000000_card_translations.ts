import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('black_card_translations', (table) => {
    table.increments('id').primary();
    table.integer('black_card_id').unsigned().notNullable();
    table.string('language_code', 5).notNullable();
    table.text('text').notNullable();
    table.unique(['black_card_id', 'language_code']);
    table.foreign('black_card_id').references('id').inTable('black_cards').onDelete('CASCADE');
  });

  await knex.schema.createTable('white_card_translations', (table) => {
    table.increments('id').primary();
    table.integer('white_card_id').unsigned().notNullable();
    table.string('language_code', 5).notNullable();
    table.text('text').notNullable();
    table.unique(['white_card_id', 'language_code']);
    table.foreign('white_card_id').references('id').inTable('white_cards').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('white_card_translations');
  await knex.schema.dropTableIfExists('black_card_translations');
}
