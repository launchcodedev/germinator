import * as Knex from 'knex';
import toSnakeCase = require('to-snake-case');
import { structuredMapper } from '@servall/mapper';
import { readFile, readdir } from 'fs-extra';
import { join, resolve } from 'path';
import * as Ajv from 'ajv';
import { SeedEntry, Cache } from './seed-entry';
import { renderSeed } from './template';

export class InvalidSeed extends Error {}
export class CorruptedSeed extends Error {}
export class TemplateError extends Error {}

export type TableMapping = { [key: string]: string };

export type NamingStrategy = (name: string) => string;

export const NamingStrategies: { [key: string]: NamingStrategy } = {
  SnakeCase: toSnakeCase,
  AsIs: name => name,
};

export class Seed {
  static schema = new Ajv().compile({
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    required: ['germinator', 'synchronize', 'entities'],
    properties: {
      germinator: {
        type: 'string',
        pattern: '^v2$',
      },
      namingStrategy: {
        type: 'string',
        enum: Object.keys(NamingStrategies),
      },
      tables: {
        type: 'object',
        additionalProperties: {
          type: 'string',
        },
      },
      synchronize: {
        type: 'boolean',
      },
      entities: {
        type: 'array',
        items: {
          $ref: '#/definitions/Entity',
        },
      },
    },
    definitions: {
      Entity: {
        type: 'object',
        minProperties: 1,
        maxProperties: 1,
        additionalProperties: {
          type: 'object',
          required: ['$id'],
          properties: {
            $id: { type: 'string' },
            $idColumnName: { type: 'string' },
          },
        },
      },
    },
  });

  public entries: SeedEntry[];

  constructor(public readonly name: string, raw: any) {
    const valid = Seed.schema(raw);

    if (!valid) {
      const err = Seed.schema.errors!
        .map(({ dataPath, message }) => `${dataPath || 'root'}: ${message}`)
        .join(', ');

      throw new InvalidSeed(`validation error in ${name}: ${err}`);
    }

    const namingStrategy = raw.namingStrategy
      ? NamingStrategies[raw.namingStrategy]
      : NamingStrategies.SnakeCase;

    if (!namingStrategy) {
      throw new InvalidSeed(`Invalid namingStrategy ${raw.namingStrategy}`);
    }

    const tableMapping = raw.tables || {};
    const synchronize = raw.synchronize;

    this.entries = structuredMapper<any, SeedEntry[]>(
      raw.entities,
      [(v: any) => new SeedEntry(v, { namingStrategy, tableMapping, synchronize })],
    );
  }

  static resolveAllEntries(seeds: Seed[]) {
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

    const resolved = {
      entries() {
        return seedEntries;
      },
      async createAll(conn: Knex, cache: Cache = new Map()) {
        if (cache.size === 0) {
          for (const entry of await conn('germinator_seed_entry').select()) {
            cache.set(entry.$id, entry);
          }
        }

        for (const entry of seedEntries.values()) {
          await entry.create(conn, cache);
        }

        return seedEntries;
      },
      async synchronize(conn: Knex, cache: Cache = new Map()) {
        if (cache.size === 0) {
          for (const entry of await conn('germinator_seed_entry').select()) {
            cache.set(entry.$id, entry);
          }
        }

        await resolved.createAll(conn, cache);

        // TODO: deletes

        return seedEntries;
      }
    };

    return resolved;
  }
}

export const loadRawFile = (filename: string, contents: string) => {
  return new Seed(filename, renderSeed(contents));
};

export const loadFile = async (filename: string) => {
  const contents = (await readFile(filename)).toString('utf8');

  return loadRawFile(filename, contents);
};

export const loadFiles = async (folder: string) => {
  const files = await readdir(folder);

  return Promise.all(
    files
      .filter(file => /\.yml$/.test(file) || /\.yaml$/.test(file))
      .map(file => join(folder, file))
      .map(loadFile)
  );
};
