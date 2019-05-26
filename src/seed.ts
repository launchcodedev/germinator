import * as Knex from 'knex';
import { Json } from '@servall/ts';
import toSnakeCase = require('to-snake-case');
import { mapper, structuredMapper, DataType } from '@servall/mapper';
import { readFile, readdir } from 'fs-extra';
import { join } from 'path';
import * as Ajv from 'ajv';
import * as YAML from 'js-yaml';

export class InvalidSeed extends Error {}

type SeedEntryRaw = {
  [entityName: string]: {
    $ref: string;
    [prop: string]: Json;
  };
};

export class SeedEntry {
  private created = false;
  tableName: string;
  $ref: string;
  id?: number;
  props: { [prop: string]: Json };
  dependencies: SeedEntry[] = [];

  constructor(raw: SeedEntryRaw) {
    const [[tableName, { $ref, ...props }]] = Object.entries(raw);

    this.$ref = $ref;
    this.tableName = toSnakeCase(tableName);
    this.props = mapper(props, {
      [DataType.Object]: (obj: any) => {
        for (const [key, val] of Object.entries(obj)) {
          if (key === '$ref') continue;
          delete obj[key];
          obj[toSnakeCase(key)] = val;
        }

        return obj;
      },
    });
  }

  resolve(allEntries: Map<string, SeedEntry>) {
    this.props = mapper(this.props, {
      custom: [
        [
          (val) => val.$ref,
          ({ $ref }) => {
            const entry = allEntries.get($ref);

            if (!entry) {
              throw new Error(`Unable to resolve $ref to ${$ref}`);
            }

            this.dependencies.push(entry);

            return entry;
          },
        ],
      ],
    });
  }

  async create(knex: Knex) {
    if (this.created) return this;

    const refs = await Promise.all(this.dependencies.map(entry => entry.create(knex)));

    // resolve our props with the ids created
    const toInsert = mapper(this.props, {
      [DataType.Object]: (v: any) => {
        if (v.$ref) {
          return refs.find(({ id, $ref }) => $ref === v.$ref)!.id;
        }

        return v;
      },
    });

    let id!: number;
    await knex.transaction(async (trx) => {
      let inserted = await trx(this.tableName).insert(toInsert, ['id']);

      // sqlite3 doesn't have RETURNING
      if (knex.client.config && knex.client.config.client === 'sqlite3') {
        [inserted] = await trx.raw('SELECT last_insert_rowid() as id');
      }

      await trx('germinator_seed_entry')
        .insert({
          ref: this.$ref,
          created_at: new Date(),
        });

      await trx.commit();

      id = inserted.id;
    });

    this.id = id;
    this.created = true;

    return this;
  }
}

export class Seed {
  static schema = new Ajv().compile({
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    required: ['germinator', 'entities'],
    properties: {
      germinator: {
        type: 'string',
        pattern: '^v2$',
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
          required: ['$ref'],
          properties: {
            $ref: { type: 'string' },
          },
        },
      },
    },
  });

  entries: SeedEntry[];

  constructor(public readonly name: string, private readonly raw: any) {
    const valid = Seed.schema(raw);

    if (!valid) {
      const err = Seed.schema.errors!
        .map(({ dataPath, message }) => `${dataPath || 'root'}: ${message}`)
        .join(', ');

      throw new InvalidSeed(err);
    }

    this.entries = structuredMapper<any, SeedEntry[]>(
      raw.entities,
      [(v: any) => new SeedEntry(v)],
    );
  }
}

export const loadFile = async (filename: string) => {
  const fileContents = await readFile(filename);

  return new Seed(filename, YAML.safeLoad(fileContents.toString('utf8')));
};

export const loadFiles = async (folder: string) => {
  const files = await readdir(folder);

  return Promise.all(files.map(file => join(folder, file)).map(loadFile));
};
