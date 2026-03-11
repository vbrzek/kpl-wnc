import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('card_sets', (table) => {
    table.integer('user_id').unsigned().nullable().references('id').inTable('users').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('card_sets', (table) => {
    table.dropColumn('user_id');
  });
}
