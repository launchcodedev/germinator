import type Knex from 'knex';
import debug from 'debug';
import { resolve, join } from 'path';
import { readdir, readFile } from 'fs-extra';
import {
  SeedFile,
  Helpers,
  Options,
  renderSeed,
  resolveAllEntries,
  setupDatabase,
} from '@germinator/core';

const log = debug('germinator:info');

export async function loadFile(
  filename: string,
  helpers: Helpers,
  options?: Options,
): Promise<SeedFile> {
  log(`Reading seed file ${filename}`);

  const contents = (await readFile(filename)).toString('utf8');

  return SeedFile.loadFromRenderedFile(renderSeed(contents, helpers), options, filename);
}

export async function loadFiles(
  folder: string,
  helpers: Helpers,
  options?: Options,
): Promise<SeedFile[]> {
  log(`Looking for seeds in ${resolve(folder)}`);

  const files = await readdir(resolve(folder));

  return Promise.all(
    files
      .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
      .map((file) => join(folder, file))
      .map((file) => loadFile(file, helpers, options)),
  );
}

export type Config = ({ file: string } | { folder: string } | { seeds: SeedFile[] }) & {
  helpers: Helpers;
  db: Knex | Knex.Config;
  /** Only does inserts and updates, no deletes */
  upsertsOnly?: boolean;
  /** Only does deletes of previously inserted seeds that are no longer present */
  deletesOnly?: boolean;
};

export async function runSeeds(config: Config, options?: Options) {
  let kx: Knex;
  let seeds: SeedFile[];
  let destroyConnection: boolean = false;

  if ('seeds' in config) {
    seeds = config.seeds;
  } else if ('file' in config) {
    seeds = [await loadFile(config.file, config.helpers, options)];
  } else {
    seeds = await loadFiles(config.folder, config.helpers, options);
  }

  const { synchronize, upsertAll, deleteMissing } = resolveAllEntries(seeds, options);

  if ('__knex__' in config.db || (config.db as { name: string }).name === 'knex') {
    kx = config.db as Knex;
  } else {
    log('Setting up database connection');

    const { default: Kx } = await import('knex');

    kx = Kx(config.db as Knex.ConnectionConfig);
    destroyConnection = true;
  }

  try {
    log('Preparing database');

    await setupDatabase(kx, options);

    if (config.upsertsOnly) {
      await upsertAll(kx);
    } else if (config.deletesOnly) {
      await deleteMissing(kx);
    } else {
      await synchronize(kx);
    }

    log(`Seeds completed successfully`);
  } finally {
    if (destroyConnection) {
      await kx.destroy();
    }
  }
}
