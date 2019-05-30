import * as Knex from 'knex';

export const up = async (knex: Knex) => {
  return knex.schema
    .createTable('germinator_seed_entry', (table) => {
      table.increments('id').primary();
      table.timestamp('created_at').notNullable();
      table.string('$id').unique().notNullable();
      table.string('table_name').notNullable();
      table.string('object_hash').notNullable();
      table.integer('created_id').notNullable();
      table.unique(['table_name', 'created_id']);
    });
};

export const down = async (knex: Knex) => {
  return knex.schema
    .dropTable('germinator_seed_entry');
};
