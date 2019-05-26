import * as Knex from 'knex';

export const up = async (knex: Knex) => {
  return knex.schema
    .createTable('germinator_seed_entry', (table) => {
      table.increments('id').primary();
      table.string('ref').unique();
      table.timestamp('created_at');
    });
};

export const down = async (knex: Knex) => {
  return knex.schema
    .dropTable('germinator_seed_entry');
};
