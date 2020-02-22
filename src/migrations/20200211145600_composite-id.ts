import * as Knex from 'knex';

export const up = async (knex: Knex) => {
  const seedEntries: any[] = await knex('germinator_seed_entry').select();

  // Only way to alter columns in SQLite is to drop and re-create the table
  // TODO: more efficient column alter for non-sqlite DBs
  await knex.schema.dropTable('germinator_seed_entry');

  await knex.schema.createTable('germinator_seed_entry', table => {
    table.increments('id').primary();
    table.timestamp('created_at').notNullable();
    table
      .string('$id')
      .unique()
      .notNullable();
    table.string('table_name').notNullable();
    table.string('object_hash').notNullable();
    table.boolean('synchronize').notNullable();
    table.string('created_id').notNullable();
    table
      .string('created_id_name')
      .defaultTo(JSON.stringify(['id']))
      .notNullable();
    table.unique(['table_name', 'created_id']);
  });

  // Re-insert all seed entries
  // Convert 'created_id' from integer to single element JSON array
  // Convert 'created_id_name' from string to single element JSON array
  for (const seedEntry of seedEntries) {
    await knex('germinator_seed_entry').insert({
      ...seedEntry,
      created_id: JSON.stringify([seedEntry.created_id]),
      created_id_name: JSON.stringify([seedEntry.created_id_name]),
    });
  }
};

export const down = async (knex: Knex) => {
  const seedEntries: any[] = await knex('germinator_seed_entry').select();

  // Only way to alter columns in SQLite is to drop and re-create the table
  // TODO: more efficient column alter for non-sqlite DBs
  await knex.schema.dropTable('germinator_seed_entry');

  await knex.schema.createTable('germinator_seed_entry', table => {
    table.increments('id').primary();
    table.timestamp('created_at').notNullable();
    table
      .string('$id')
      .unique()
      .notNullable();
    table.string('table_name').notNullable();
    table.string('object_hash').notNullable();
    table.boolean('synchronize').notNullable();
    table.integer('created_id').notNullable();
    table
      .string('created_id_name')
      .defaultTo('id')
      .notNullable();
    table.unique(['table_name', 'created_id']);
  });

  // Re-insert all seed entries
  // Convert 'created_id' from JSON array to single integer
  // Convert 'created_id_name' from JSON array to single string
  for (const seedEntry of seedEntries) {
    const createdId = JSON.parse(seedEntry.created_id);
    const [newCreatedId] = createdId;

    if (createdId.length > 1 || !Number.isInteger(newCreatedId)) {
      throw new Error(
        `Column 'created_id' in seed_entry ${seedEntry.id} contains more than one ID, or an ID that is not an integer. Data loss will occur. Please modify the data before migrating down.`,
      );
    }

    const createdIdName = JSON.parse(seedEntry.created_id_name);
    const [newCreatedIdName] = createdIdName;

    if (createdIdName.length > 1) {
      throw new Error(
        `Column 'created_id_name' in seed_entry ${seedEntry.id} contains more than one column name. Data loss will occur. Please modify the data before migrating down.`,
      );
    }

    await knex('germinator_seed_entry').insert({
      ...seedEntry,
      created_id: newCreatedId,
      created_id_name: newCreatedIdName,
    });
  }
};
