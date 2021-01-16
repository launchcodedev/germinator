import * as Knex from 'knex';

export const up = async (knex: Knex) => {
  await knex.schema.table('germinator_seed_entry', (table) => {
    table.string('schema_name').nullable();
  });
};

export const down = async (knex: Knex) => {
  await knex.schema.table('germinator_seed_entry', (table) => {
    table.dropColumn('schema_name');
  });
};
