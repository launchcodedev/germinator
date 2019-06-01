import * as Knex from 'knex';
import { get } from 'lodash';
import { Json } from '@servall/ts';
import toSnakeCase = require('to-snake-case');
import * as objectHash from 'object-hash';
import { mapper, structuredMapper, Mapping, DataType } from '@servall/mapper';
import { readFile, readdir } from 'fs-extra';
import { join, resolve } from 'path';
import * as Hogan from 'hogan.js';
import * as Handlebars from 'handlebars';
import * as faker from 'faker';
import * as bcrypt from 'bcrypt';
import * as Ajv from 'ajv';
import * as YAML from 'js-yaml';

export class InvalidSeed extends Error {}
export class CorruptedSeed extends Error {}
export class TemplateError extends Error {}

export type TableMapping = { [key: string]: string };

export type NamingStrategy = (name: string) => string;

export const NamingStrategies: { [key: string]: NamingStrategy } = {
  SnakeCase: toSnakeCase,
  AsIs: name => name,
};

type SeedEntryRaw = {
  [entityName: string]: {
    $id: string;
    $idColumnName: string;
    [prop: string]: Json;
  };
};

type SeedEntryOptions = {
  namingStrategy: NamingStrategy;
  tableMapping: TableMapping;
  synchronize: boolean;
};

export class SeedEntry {
  tableName: string;
  synchronize: boolean;
  $id: string;
  $idColumnName: string;
  props: { [prop: string]: Json };
  dependencies: SeedEntry[] = [];

  // database id once inserted or found
  private id?: number;
  get createdId() { return this.id };

  constructor(
    raw: SeedEntryRaw,
    {
      namingStrategy,
      tableMapping,
      synchronize,
    }: SeedEntryOptions,
  ) {
    const [[tableName, { $id, $idColumnName, ...props }]] = Object.entries(raw);
    this.synchronize = synchronize;

    const mapping: Mapping = {
      [DataType.Object]: (obj: any) => {
        for (const [key, val] of Object.entries(obj)) {
          if (key === '$id') {
            obj[key] = mapper(val, mapping);
            continue;
          }

          delete obj[key];
          obj[namingStrategy(key)] = mapper(val, mapping);
        }

        return obj;
      },
      [DataType.String]: (str) => {
        // context provided to strings, allowing $id: "{tableName}-1" or "{rawHash}"
        // we use single curly delimiters here to avoid conflicting with the parent handlebars
        const tmpl = Hogan.compile(str, { delimiters: '{ }' }) as Hogan.Template;

        return tmpl.render({
          table: this.tableName,
          tableName: this.tableName,
          idColumn: this.$idColumnName,
          idColumnName: this.$idColumnName,
          rawHash: objectHash(props),
        });
      },
    };

    this.tableName = tableMapping[tableName] || namingStrategy(tableName);
    this.$id = mapper($id, mapping);
    this.$idColumnName = mapper($idColumnName || 'id', mapping);
    this.props = mapper(props, mapping);
  }

  get isCreated() {
    return !!this.id;
  }

  resolve(allEntries: Map<string, SeedEntry>) {
    this.props = mapper(this.props, {
      custom: [
        [
          (val) => val && !!val.$id,
          ({ $id }) => {
            const entry = allEntries.get($id);

            if (!entry) {
              throw new InvalidSeed(`Unable to resolve $id to ${$id}`);
            }

            this.dependencies.push(entry);

            return entry;
          },
        ],
      ],
    });
  }

  async create(knex: Knex) {
    if (this.isCreated) return this;

    const refs = await Promise.all(this.dependencies.map(entry => entry.create(knex)));

    // resolve our props with the ids created
    const toInsert = mapper(this.props, {
      [DataType.Object]: (v: any) => {
        if (v.$id) {
          const found = refs.find(({ id, $id }) => $id === v.$id);

          if (!found) {
            throw new CorruptedSeed(`The ref to $id ${v.$id} failed to lookup`);
          }

          return found.id;
        }

        return v;
      },
    });

    const exists = await knex('germinator_seed_entry').where({ $id: this.$id });

    if (exists.length) {
      this.id = exists[0].created_id;

      if (objectHash(toInsert) !== exists[0].object_hash) {
        if (this.synchronize) {
          await knex(this.tableName).update(toInsert).where({ [this.$idColumnName]: this.id });
        } else {
          throw new CorruptedSeed(
            `The seed ($id: ${this.$id}) was not the same as the one previously inserted`,
          );
        }
      }

      return this;
    }

    await knex.transaction(async (trx) => {
      let [inserted] = await trx(this.tableName).insert(toInsert).returning([this.$idColumnName]);

      // sqlite3 doesn't have RETURNING
      if (knex.client.config && knex.client.config.client === 'sqlite3') {
        [inserted] = await trx.raw(`SELECT last_insert_rowid() as ${this.$idColumnName}`);
      }

      this.id = inserted[this.$idColumnName];

      if (!this.id) {
        throw new InvalidSeed(`Seed ${this.$id} did not return its created ID correctly`);
      }

      await trx('germinator_seed_entry')
        .insert({
          $id: this.$id,
          table_name: this.tableName,
          object_hash: objectHash(toInsert),
          synchronize: this.synchronize,
          created_id: this.id,
          created_at: new Date(),
        });

      await trx.commit();
    });

    return this;
  }
}

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
      async createAll(conn: Knex) {
        for (const entry of seedEntries.values()) {
          await entry.create(conn);
        }

        return seedEntries;
      },
      async synchronize(conn: Knex) {
        await resolved.createAll(conn);

        // TODO: deletes

        return seedEntries;
      }
    };

    return resolved;
  }
}

export const loadFileContents = (filename: string, contents: string) => {
  // using --- break between non-template and templated sections
  const split = contents.split('---');

  let topSection: string | undefined;
  let templateSection: string;

  if (split.length === 2) {
    [topSection, templateSection] = split;
  } else if (split.length === 1) {
    templateSection = split[0];
  } else {
    throw new InvalidSeed('Including too many --- breaks');
  }

  const data = {};
  const seed = {};
  let fakerSeed = 42;

  if (topSection) {
    const props = YAML.safeLoad(topSection);

    // `data` key is used to feed the handlebar template
    if (props.data) {
      Object.assign(data, props.data);
      delete props.data;
    }

    // `fakerSeed` key is used to change the random seed of faker.js
    if (props.fakerSeed) {
      fakerSeed = props.fakerSeed;
      delete props.fakerSeed;
    }

    Object.assign(seed, props);
  }

  // faker has to act deterministically, per-file, for object hashes to match correctly
  faker.seed(fakerSeed);

  const renderedContents = Handlebars.compile(templateSection)(data, {
    helpers: {
      ...require('handlebars-helpers')(),
      repeat: require('handlebars-helper-repeat-root-fixed'),
      password(password?: string, ctx?: { hash: { rounds?: number } }) {
        if (!password || typeof password === 'object') {
          throw new TemplateError('password helper requires password {{password "pwd"}}');
        }

        const rounds = ctx && ctx.hash && ctx.hash.rounds || 10;

        return bcrypt.hashSync(password, rounds);
      },
      faker(name: string | object | undefined, ctx: { hash: any }) {
        if (!name || typeof name === 'object') {
          throw new TemplateError('faker helper requires data type {{faker "email"}}');
        }

        const fn = get(faker, name);

        if (!fn) {
          throw new TemplateError(`${name} is not a valid faker.js value type`);
        }

        return fn(Object.keys(ctx.hash).length > 0 ? ({ ...ctx.hash }) : undefined);
      },
    },
  });

  Object.assign(seed, YAML.safeLoad(renderedContents));

  return new Seed(filename, seed);
};

export const loadFile = async (filename: string) => {
  const contents = (await readFile(filename)).toString('utf8');

  return loadFileContents(resolve(filename), contents);
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
