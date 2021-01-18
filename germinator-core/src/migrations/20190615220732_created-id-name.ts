import * as Knex from 'knex';

export const up = async (knex: Knex) => {
  await knex.schema.table('germinator_seed_entry', (table) => {
    table.string('created_id_name').defaultTo('id').notNullable();
  });
};

export const down = async () => {
  // this column is dropped later in migrations, so we can't drop it if those ran
};
