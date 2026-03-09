import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.enum('provider', ['google', 'discord']).notNullable();
    table.string('provider_id', 255).notNullable();
    table.string('nickname', 50).nullable();
    table.string('locale', 5).defaultTo('cs');
    table.enum('avatar_type', ['oauth', 'dicebear']).defaultTo('oauth');
    table.text('avatar_url').nullable();
    table.string('dicebear_style', 50).nullable();
    table.string('dicebear_seed', 100).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.unique(['provider', 'provider_id']);
  });

  await knex.schema.createTable('user_player_tokens', (table) => {
    table.integer('user_id').unsigned().notNullable();
    table.string('player_token', 36).notNullable();
    table.string('room_code', 6).notNullable();
    table.timestamp('last_seen').defaultTo(knex.fn.now());
    table.primary(['player_token', 'room_code']);
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_player_tokens');
  await knex.schema.dropTableIfExists('users');
}
