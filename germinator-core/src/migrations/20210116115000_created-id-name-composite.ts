import * as Knex from 'knex';

export const up = async (knex: Knex) => {
  await knex.schema.table('germinator_seed_entry', (table) => {
    table.specificType('created_id_names', 'text[]').defaultTo('array[created_id_name]');
    table.specificType('created_ids', 'text[]').defaultTo('array[created_id]');;
  });
};

export const down = async (knex: Knex) => {
  await knex.schema.table('germinator_seed_entry', (table) => {
    table.dropColumn('created_id_names');
    table.dropColumn('created_ids');
  });
};
