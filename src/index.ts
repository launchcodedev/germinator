import * as Knex from 'knex';
import { getLogger, createLogger } from '@lcdev/logger';
import { dbConnect } from './database';
import { loadFile, loadFiles, Seed } from './seed';
import { SeedEntry } from './seed-entry';

export { loadFile, loadFiles, Seed, SeedEntry };

export type Config = ({ folder: string } | { seeds: Seed[] }) & {
  db: Knex.ConnectionConfig | Knex.MsSqlConnectionConfig | Knex.Sqlite3ConnectionConfig | Knex;
  client?: string;
};

export const runSeeds = async (config: Config) => {
  const logger = getLogger() || createLogger({ debug: !!process.env.DEBUG });

  const knexPassedIn = '__knex__' in config.db || (config.db as any).name === 'knex';

  const [conn, seeds] = await Promise.all([
    knexPassedIn
      ? (config.db as Knex)
      : dbConnect(config.db as Knex.ConnectionConfig, config.client),
    'seeds' in config ? config.seeds : loadFiles(config.folder),
  ]);

  logger.info('Running seed migration');

  await conn.migrate.latest();

  logger.info('Running seeds');

  await Seed.resolveAllEntries(seeds).synchronize(conn);

  logger.info('Seeds complete');

  await conn.destroy();
};

export const validate = async (config: Config) => {
  const seeds = await ('seeds' in config ? config.seeds : loadFiles(config.folder));

  Seed.resolveAllEntries(seeds);
};
