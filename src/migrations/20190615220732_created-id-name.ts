import * as Knex from 'knex';

export const up = async (knex: Knex) => {
  await knex.schema.table('germinator_seed_entry', (table) => {
    table.string('created_id_name').defaultTo('id').notNullable();
  });
};

export const down = async (knex: Knex) => {
  await knex.schema.table('germinator_seed_entry', (table) => {
    table.dropColumn('created_id_name');
  });
};
