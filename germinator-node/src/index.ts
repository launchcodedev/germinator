import type Knex from 'knex';
import debug from 'debug';
import { resolve, join } from 'path';
import { readdir, readFile } from 'fs-extra';
import { SeedFile, Helpers, renderSeed, resolveAllEntries, setupDatabase } from '@germinator/core';

const log = debug('germinator:node');

export function loadRawFile(filename: string, contents: string, helpers: Helpers) {
  return SeedFile.loadFromRenderedFile(renderSeed(contents, helpers));
}

export async function loadFile(filename: string, helpers: Helpers) {
  const contents = (await readFile(filename)).toString('utf8');

  return loadRawFile(filename, contents, helpers);
}

export async function loadFiles(folder: string, helpers: Helpers) {
  const files = await readdir(resolve(folder));

  return Promise.all(
    files
      .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
      .map((file) => join(folder, file))
      .map((file) => loadFile(file, helpers)),
  );
}

export type Config = ({ folder: string } | { seeds: SeedFile[] }) & {
  helpers: Helpers;
  db: Knex | Knex.Config;
};

export async function runSeeds(config: Config) {
  let kx: Knex;
  let seeds: SeedFile[];
  let destroyConnection: boolean = false;

  if ('seeds' in config) {
    seeds = config.seeds;
  } else {
    log('Loading seed files');

    seeds = await loadFiles(config.folder, config.helpers);
  }

  const { synchronize } = resolveAllEntries(seeds);

  if ('__knex__' in config.db || (config.db as any).name === 'knex') {
    kx = config.db as Knex;
  } else {
    const { default: Knex } = await import('knex');

    kx = Knex(config.db as Knex.ConnectionConfig);
    destroyConnection = true;
  }

  try {
    log('Setting up database');

    await setupDatabase(kx);

    log('Running seeds');

    await synchronize(kx);
  } finally {
    if (destroyConnection) {
      await kx.destroy();
    }
  }
}
