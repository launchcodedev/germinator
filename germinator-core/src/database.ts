import debug from 'debug';
import type Knex from 'knex';
import type { Options } from './seeds';

const log = debug('germinator:db');
const logSQL = debug('germinator:sql');

export const isTypescript = __filename.endsWith('.ts');
export const migrationFileExt = isTypescript ? '.ts' : '.js';
export const migrationFolder = `${__dirname}/migrations`;

export async function setupDatabase(knexion: Knex, options?: Options) {
  knexion.on('query', ({ sql, bindings = [] }: Knex.Sql) => {
    if (bindings?.length) {
      logSQL(`sql: ${sql} (${bindings.join(',')})`);
    } else {
      logSQL(`sql: ${sql}`);
    }
  });

  if (!options?.noTracking) {
    log(`Running migrations from ${migrationFolder}`);

    // germinator has it's own migrations, which it uses to track data that it made
    await knexion.migrate.latest({
      tableName: 'germinator_migration',
      directory: migrationFolder,
      loadExtensions: [migrationFileExt],
    });
  }

  return knexion;
}
