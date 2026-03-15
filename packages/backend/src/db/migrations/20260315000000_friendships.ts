import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('friendships', (t) => {
    t.increments('id').primary();
    t.integer('requester_id').unsigned().notNullable();
    t.integer('addressee_id').unsigned().notNullable();
    t.enum('status', ['pending', 'accepted']).defaultTo('pending').notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['requester_id', 'addressee_id']);
    t.foreign('requester_id').references('users.id').onDelete('CASCADE');
    t.foreign('addressee_id').references('users.id').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('friendships');
}
