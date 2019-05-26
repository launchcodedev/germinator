import * as Knex from 'knex';
import { getLogger, createLogger } from '@servall/logger';
import { dbConnect } from './database';
import { loadFiles, Seed, SeedEntry } from './seed';

export type Config = {
  folder: string;
  db: Knex.ConnectionConfig | Knex.Sqlite3ConnectionConfig;
  client?: string;
};

export const runSeeds = async (config: Config) => {
  const logger = getLogger() || createLogger({ debug: !!process.env.DEBUG });

  const [conn, seeds] = await Promise.all([
    dbConnect(config.db, config.client),
    loadFiles(config.folder),
  ]);

  await conn.migrate.latest();

  logger.info('Running seeds');

  const seedEntries = new Map<string, SeedEntry>();

  // collect all $ref's
  for (const seed of seeds) {
    for (const entry of seed.entries) {
      if (seedEntries.has(entry.$ref)) {
        throw new Error(`Found duplicate seed entry '${entry.$ref}'!`);
      }

      seedEntries.set(entry.$ref, entry);
    }
  }

  // resolve all $ref's
  for (const entry of seedEntries.values()) {
    entry.resolve(seedEntries);
  }

  for (const entry of seedEntries.values()) {
    await entry.create(conn);
  }

  logger.info('Seeds complete');

  await conn.destroy();
};
