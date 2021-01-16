import debug from 'debug';
import type Knex from 'knex';

const log = debug('germinator:db');

export const isTypescript = __filename.endsWith('.ts');
export const migrationFileExt = isTypescript ? '.ts' : '.js';
export const migrationFolder = `${__dirname}/migrations`;

export async function setupDatabase(knexion: Knex) {
  knexion.on('query', ({ sql, bindings = [] }: Knex.Sql) => {
    if (bindings?.length) {
      log(`sql: ${sql} (${bindings.join(',')})`);
    } else {
      log(`sql: ${sql}`);
    }
  });

  log(`Running migrations from ${migrationFolder}`);

  // germinator has it's own migrations, which it uses to track data that it made
  await knexion.migrate.latest({
    tableName: 'germinator_migration',
    directory: migrationFolder,
    loadExtensions: [migrationFileExt],
  });

  return knexion;
}
