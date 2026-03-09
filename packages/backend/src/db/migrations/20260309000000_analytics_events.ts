import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('game_events', (table) => {
    table.bigIncrements('id').primary();
    table.enu('event_type', ['room_created', 'settings_updated', 'game_started']).notNullable();
    table.specificType('room_code', 'CHAR(6)').notNullable();
    table.specificType('occurred_at', 'TIMESTAMP(3)').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
    table.index(['room_code'], 'idx_room');
    table.index(['event_type', 'occurred_at'], 'idx_type');
    table.engine('InnoDB');
    table.charset('utf8mb4');
  });

  await knex.schema.createTable('game_event_room_created', (table) => {
    table.bigInteger('event_id').unsigned().primary();
    table.string('host_nickname', 100).notNullable();
    table.string('room_name', 100).notNullable();
    table.boolean('is_public').notNullable();
    table.tinyint('max_players').unsigned().notNullable();
    table.string('win_condition', 20).notNullable();
    table.smallint('target_score').unsigned().notNullable();
    table.smallint('target_rounds').unsigned().notNullable();
    table.smallint('game_time_limit').unsigned().notNullable();
    table.json('set_ids').notNullable();
    table.json('special_rules').notNullable();
    table.foreign('event_id').references('id').inTable('game_events').onDelete('CASCADE');
    table.engine('InnoDB');
    table.charset('utf8mb4');
  });

  await knex.schema.createTable('game_event_settings_updated', (table) => {
    table.bigInteger('event_id').unsigned().primary();
    table.string('changed_by', 100).notNullable();
    table.string('room_name', 100).nullable();
    table.boolean('is_public').nullable();
    table.tinyint('max_players').unsigned().nullable();
    table.string('win_condition', 20).nullable();
    table.smallint('target_score').unsigned().nullable();
    table.smallint('target_rounds').unsigned().nullable();
    table.smallint('game_time_limit').unsigned().nullable();
    table.json('set_ids').nullable();
    table.json('special_rules').nullable();
    table.foreign('event_id').references('id').inTable('game_events').onDelete('CASCADE');
    table.engine('InnoDB');
    table.charset('utf8mb4');
  });

  await knex.schema.createTable('game_event_game_started', (table) => {
    table.bigInteger('event_id').unsigned().primary();
    table.tinyint('player_count').unsigned().notNullable();
    table.json('players').notNullable();
    table.foreign('event_id').references('id').inTable('game_events').onDelete('CASCADE');
    table.engine('InnoDB');
    table.charset('utf8mb4');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('game_event_game_started');
  await knex.schema.dropTableIfExists('game_event_settings_updated');
  await knex.schema.dropTableIfExists('game_event_room_created');
  await knex.schema.dropTableIfExists('game_events');
}
