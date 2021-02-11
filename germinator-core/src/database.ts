import debug from 'debug';
import type Knex from 'knex';
import type { Options } from './seeds';

const log = debug('germinator:db');
const logSQL = debug('germinator:sql');

export const isTypescript = __filename.endsWith('.ts');
export const migrationFileExt = isTypescript ? '.ts' : '.js';
export const migrationFolder = `${__dirname}/migrations`;

interface Databases {
  main: Knex;
  tracking: Knex;
}

export type DB = Databases | Knex;

export async function setupDatabase(db: DB, options?: Options) {
  const setupLogging = (kx: Knex) =>
    kx.on('query', ({ sql, bindings = [] }: Knex.Sql) => {
      if (bindings?.length) {
        logSQL(`${sql} [${bindings.join(',')}]`);
      } else {
        logSQL(`${sql}`);
      }
    });

  const tracking = trackingDB(db);
  const main = mainDB(db);

  setupLogging(tracking);
  if (main !== tracking) {
    setupLogging(main);
  }

  if (!options?.noTracking) {
    log(`Running migrations from ${migrationFolder}`);

    // germinator has it's own migrations, which it uses to track data that it made
    await tracking.migrate.latest({
      tableName: 'germinator_migration',
      directory: migrationFolder,
      loadExtensions: [migrationFileExt],
    });
  }

  return tracking;
}

export function mainDB(kx: DB) {
  if ('main' in kx) {
    return kx.main;
  }

  return kx;
}

export function trackingDB(kx: DB) {
  if ('tracking' in kx) {
    return kx.tracking;
  }

  return kx;
}
