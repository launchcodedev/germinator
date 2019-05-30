import * as Knex from 'knex';
import { getLogger, createLogger } from '@servall/logger';
import { dbConnect } from './database';
import { loadFile, loadFiles, Seed, SeedEntry } from './seed';

export { loadFile, loadFiles, Seed, SeedEntry };

export type Config = ({ folder: string } | { seeds: Seed[] }) & {
  db: Knex.ConnectionConfig | Knex.Sqlite3ConnectionConfig;
  client?: string;
};

export const runSeeds = async (config: Config) => {
  const logger = getLogger() || createLogger({ debug: !!process.env.DEBUG });

  const [conn, seeds] = await Promise.all([
    dbConnect(config.db, config.client),
    'seeds' in config ? config.seeds : loadFiles(config.folder),
  ]);

  await conn.migrate.latest();

  logger.info('Running seeds');

  const seedEntries = new Map<string, SeedEntry>();

  // collect all $id's
  for (const seed of seeds) {
    for (const entry of seed.entries) {
      if (seedEntries.has(entry.$id)) {
        throw new Error(`Found duplicate seed entry '${entry.$id}'!`);
      }

      seedEntries.set(entry.$id, entry);
    }
  }

  // resolve all $id's
  for (const entry of seedEntries.values()) {
    entry.resolve(seedEntries);
  }

  for (const entry of seedEntries.values()) {
    await entry.create(conn);
  }

  logger.info('Seeds complete');

  await conn.destroy();
};
