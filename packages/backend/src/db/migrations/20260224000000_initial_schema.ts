import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('card_sets', (table) => {
    table.increments('id').primary();
    table.string('name', 255).notNullable();
    table.text('description').nullable();
    table.boolean('is_public').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.string('slug', 50).unique().nullable();
  });

  await knex.schema.createTable('black_cards', (table) => {
    table.increments('id').primary();
    table.integer('card_set_id').unsigned().notNullable();
    table.text('text').notNullable();
    table.tinyint('pick').defaultTo(1);
    table.foreign('card_set_id').references('id').inTable('card_sets').onDelete('CASCADE');
  });

  await knex.schema.createTable('white_cards', (table) => {
    table.increments('id').primary();
    table.integer('card_set_id').unsigned().notNullable();
    table.text('text').notNullable();
    table.foreign('card_set_id').references('id').inTable('card_sets').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('white_cards');
  await knex.schema.dropTableIfExists('black_cards');
  await knex.schema.dropTableIfExists('card_sets');
}
