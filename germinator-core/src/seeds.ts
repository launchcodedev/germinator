import Knex from 'knex';
import debug from 'debug';
import { DataType, Mapping, mapper } from '@lcdev/mapper';
import Ajv from 'ajv';
import SnakeCase from 'to-snake-case';
import * as Hogan from 'hogan.js';
import stringify from 'json-stable-stringify';
import objectHash from 'object-hash';
import {
  InvalidSeed,
  InvalidSeedEntryCreation,
  UpdateOfDeletedEntry,
  UpdateOfMultipleEntries,
} from './errors';

const currentEnv = () => process.env.NODE_ENV;

const log = debug('germinator:seed');

export type JsonPrimitive = string | number | boolean | null | JsonPrimitive[];
export type JsonObject = { [k: string]: Json };
export type Json = JsonObject | JsonPrimitive;

/** Represents a unique key used to identify database records. Array means composite keys. */
export type PrimaryOrForeignKey = number | string | (number | string)[];

/** A renaming map used to resolve "EntityName" to "real_entity_name_table" */
export type TableMapping = Record<string, string>;

/** A strategy for mapping table and column names from what's in seed files to database queries */
export type NamingStrategy = (name: string) => string;

/** Known NamingStrategies that will be interpreted */
const NamingStrategies: Record<string, NamingStrategy> = {
  AsIs: (name) => name,
  SnakeCase,
};

/**
 * The type of parsed objects in YAML seed files.
 *
 * - MyTableName:
 *     $id: foo-bar
 *     column_name: value
 */
interface SeedEntryYaml {
  [entityName: string]: {
    $id: string | JsonObject;
    $idColumnName?: string | string[];
    $schemaName?: string;
    $synchronize?: boolean | string[];
    $env?: string | string[];
    [prop: string]: Json | undefined;
  };
}

/**
 * The type of the full YAML object parsed from seed files.
 */
interface SeedFileYaml {
  germinator: 'v2';
  synchronize: boolean | string[];
  $env?: string | string[];
  namingStrategy?: keyof typeof NamingStrategies;
  schemaName?: string;
  tables?: TableMapping;
  entities: SeedEntryYaml[];
}

/** Options for SeedEntry constructor */
interface SeedEntryOptions {
  namingStrategy: NamingStrategy;
  tableMapping: TableMapping;
  schemaName?: string;
  synchronize: boolean | string[];
  environment?: string[];
}

interface RawSeedEntryRecord {
  /* eslint-disable camelcase */
  $id: string;
  table_name: string;
  schema_name: string | null;
  object_hash: string;
  synchronize: boolean;
  created_ids: string[];
  created_id_names: string[];
  created_at: Date;
  /* eslint-enable camelcase */
}

/** A map of known seed entries that already exist in the database */
type Cache = Map<string, RawSeedEntryRecord>;

/** A single entry, which will correspond to a single database entry */
export class SeedEntry {
  /** The globally unique $id of this entry */
  readonly $id: string;
  /** The primary column(s) for the given table */
  readonly $idColumnName: string[];

  /** Database table */
  readonly tableName: string;
  /** Database schema that table belongs to */
  readonly schemaName?: string;
  /** Should this seed entry stay synchronized when changes to it are detected? */
  readonly synchronize: boolean | string[];
  /** Which environments should this seed run in? */
  readonly environments?: string[];

  /** State: Database column values (mutated when dependencies are resolved) */
  private properties: JsonObject;

  /** State: Is this.dependencies fully resolved to every dependency required? */
  private isResolved = false;
  /** State: The other seed entries that this one depends on via Foreign Keys */
  private dependencies: SeedEntry[] = [];
  /** State: Does this seed entry exist in the database yet */
  private created?: Promise<SeedEntry>;

  // State: Database primary key once inserted or found
  private id?: PrimaryOrForeignKey;

  /** If defined, the primary key */
  get primaryID(): PrimaryOrForeignKey | undefined {
    return this.id;
  }

  /** Has been created in the database */
  get isCreated(): boolean {
    return !!this.id;
  }

  /** If this entry qualifies to be created in the database, depending on the current environment */
  get shouldUpsert(): boolean {
    if (!this.environments) return true;

    if (Array.isArray(this.environments)) {
      return this.environments.some((env) => env === currentEnv());
    }

    return this.environments === currentEnv();
  }

  /** If this entry should be updated or deleted on subsequent runs of germinator */
  get shouldSynchronize(): boolean {
    return typeof this.synchronize === 'boolean'
      ? this.synchronize
      : this.synchronize.some((env) => env === currentEnv());
  }

  constructor(
    raw: SeedEntryYaml,
    { namingStrategy, tableMapping, schemaName, synchronize, environment }: SeedEntryOptions,
  ) {
    if (Object.keys(raw).length === 0) {
      throw new InvalidSeed('SeedEntry created with no name');
    } else if (Object.keys(raw).length > 1) {
      throw new InvalidSeed('SeedEntry created with multiple names');
    }

    const [
      [tableName, { $id, $idColumnName, $schemaName, $synchronize, $env, ...props }],
    ] = Object.entries(raw);

    // choose either parent or entry override
    this.synchronize = $synchronize ?? synchronize;
    this.schemaName = $schemaName ?? schemaName;

    this.tableName =
      tableName in tableMapping ? tableMapping[tableName] : namingStrategy(tableName);

    this.environments = toArray<string>($env ?? environment);

    // mapping for $id, $idColumnName
    const mapping: Mapping = {
      [DataType.String]: (str) => {
        // fast path (most seeds won't use this)
        if (!str.includes('{')) return str;

        // context provided to strings, allowing $id: "{tableName}-1"
        // we use single curly delimiters here to avoid conflicting with the parent handlebars
        const tmpl = Hogan.compile(str, { delimiters: '{ }' }) as Hogan.Template;

        return tmpl.render({
          table: this.tableName,
          tableName: this.tableName,
          idColumn: this.$idColumnName,
          idColumnName: this.$idColumnName,
        });
      },
      [DataType.Date]: (date) => {
        return date.toISOString();
      },
    };

    // mapping for properties of the entry (like renaming keys)
    const propMapping: Mapping = {
      ...mapping,
      [DataType.Object]: (obj, ctx?: string) => {
        if (ctx) return obj;

        const jsonObj = obj as JsonObject;

        // go through each property name, renaming them with namingStrategy
        for (const [key, val] of Object.entries(jsonObj)) {
          if (key === '$id') {
            // the $id property is treated specially
            jsonObj.$id = mapper(val, mapping) as Json;
          } else {
            const newKeyName = namingStrategy(key);
            delete jsonObj[key];

            jsonObj[newKeyName] = mapper(val, mapping) as Json;
          }
        }

        return obj;
      },
    };

    const resolved$id = mapper($id, mapping) as string | JsonObject;

    // $id can be a string, or an object, which will be stringified
    this.$id = typeof resolved$id === 'string' ? resolved$id : stringify(resolved$id);
    this.$idColumnName = toArray(mapper($idColumnName ?? 'id', mapping) as string | string[]);
    this.properties = mapper(props, propMapping) as JsonObject;
  }

  resolveDependencies(allEntries: Map<string, SeedEntry>) {
    this.properties = mapper(this.properties, {
      [DataType.Object]: (reference) => {
        if (!('$id' in reference)) {
          return reference;
        }

        const { $id } = reference as { $id: string };
        const entry = allEntries.get($id);

        if (!entry) {
          throw new InvalidSeed(`Unable to resolve $id to ${$id}`);
        }

        this.dependencies.push(entry);

        return entry;
      },
    }) as JsonObject;

    this.isResolved = true;
  }

  async upsert(knex: Knex, cache?: Cache) {
    if (this.created) return this.created;

    // store the promise of creation, so that a diamond dependency doesn't end up
    // starting the create function more than once
    this.created = this.upsertNonLazy(knex, cache);

    return this.created;
  }

  async upsertNonLazy(knex: Knex, cache?: Cache) {
    if (!this.shouldUpsert) {
      throw new InvalidSeedEntryCreation(
        `Tried to create a seed entry (${this.$id}) that should not have been.`,
      );
    }

    if (!this.isResolved) {
      // normally, it would be a problem if dependencies weren't resolved yet
      // we don't care if there would be nothing to resolve though
      // resolveDependencies will fail if there are any dependencies
      this.resolveDependencies(new Map());
    }

    // here's the important bit - all dependencies are created before ths current entry is
    const refs = await Promise.all(this.dependencies.map((entry) => entry.upsert(knex, cache)));

    // resolve properties with the ids of dependencies that were just created
    const toInsert = mapper(this.properties, {
      [DataType.Object]: (obj) => {
        if (!('$id' in obj)) {
          return obj;
        }

        const { $id } = obj as { $id: string };
        const found = refs.find((ref) => $id === ref.$id);

        if (!found) {
          throw new InvalidSeedEntryCreation(`The reference to $id ${$id} failed to lookup`);
        }

        if (found.id === undefined) {
          throw new InvalidSeedEntryCreation(`The reference to $id ${$id} failed to lookup`);
        }

        return found.id;
      },
    }) as JsonObject;

    let existingEntry: RawSeedEntryRecord | undefined;

    if (cache) {
      existingEntry = cache.get(this.$id);
    }

    if (!existingEntry) {
      existingEntry = await knex('germinator_seed_entry')
        .first<RawSeedEntryRecord>()
        .where({ $id: this.$id });
    }

    // here is the "insert" pathway, when it has not existed yet
    if (!existingEntry) {
      await knex.transaction(async (trx) => {
        log(`Running insert of seed: ${this.$id}`);

        let entryQueryBuilder = trx.queryBuilder();

        if (this.schemaName) {
          entryQueryBuilder = entryQueryBuilder.withSchema(this.schemaName);
        }

        let [inserted] = (await entryQueryBuilder
          .from(this.tableName)
          .insert(toInsert)
          .returning(this.$idColumnName)) as [Record<string, number | string>];

        // sqlite3 doesn't have RETURNING
        if (knex.client.config?.client === 'sqlite3') {
          if (this.$idColumnName.length > 1) {
            throw new InvalidSeedEntryCreation(`SQLite support does not include composite IDs`);
          }

          [inserted] = await trx.raw(`SELECT last_insert_rowid() as ${this.$idColumnName[0]}`);
        }

        if (this.$idColumnName.length === 1) {
          this.id = inserted[this.$idColumnName[0]];
        } else {
          this.id = this.$idColumnName.map((columnName) => inserted[columnName]);
        }

        if (!this.id) {
          throw new InvalidSeed(`Seed ${this.$id} did not return its created ID correctly`);
        }

        await trx('germinator_seed_entry').insert({
          $id: this.$id,
          table_name: this.tableName,
          object_hash: objectHash(toInsert),
          synchronize: this.shouldSynchronize,
          created_ids: this.id,
          created_id_names: this.$idColumnName,
          created_at: new Date(),
        });

        await trx.commit();
      });
    }

    // below lies the "update" pathway (seed entry had previously existed)
    if (existingEntry) {
      this.id = existingEntry.created_ids;

      if (this.shouldSynchronize && existingEntry.synchronize) {
        const currentHash = objectHash(toInsert);

        if (currentHash !== existingEntry.object_hash) {
          log(`Running update of seed: ${this.$id}`);

          await knex.transaction(async (trx) => {
            let entryQueryBuilder = trx.queryBuilder();

            if (this.schemaName) {
              entryQueryBuilder = entryQueryBuilder.withSchema(this.schemaName);
            }

            const primaryKey = toArray(this.id!);

            // create a where clause with all primary keys
            const idLookupClause = this.$idColumnName.reduce(
              (clause, columnName, i) => ({ ...clause, [columnName]: primaryKey[i] }),
              {},
            );

            const count = await entryQueryBuilder
              .from(this.tableName)
              .update(toInsert)
              .where(idLookupClause);

            if (count === 0) {
              throw new UpdateOfDeletedEntry(
                `Tried to perform an update on deleted entry: $id ${this.$id}`,
              );
            }

            if (count > 1) {
              throw new UpdateOfMultipleEntries(
                `Tried to perform an update on $id ${this.$id}, but ended up changing more than one database record!`,
              );
            }

            await trx('germinator_seed_entry')
              .update({
                object_hash: currentHash,
                synchronize: true,
                created_at: new Date(),
              })
              .where({ $id: this.$id });
          });
        }
      } else if (existingEntry.synchronize) {
        // this seed was inserted with 'synchronize = true', but is not anymore
        await knex('germinator_seed_entry').update({ synchronize: false }).where({ $id: this.$id });
      }

      return this;
    }

    return this;
  }
}

/** A collection of SeedEntry's */
export class SeedFile {
  static validate = new Ajv().compile<SeedFileYaml>({
    $schema: 'http://json-schema.org/draft-07/schema#',

    type: 'object',
    required: ['germinator', 'synchronize', 'entities'],
    additionalProperties: false,

    properties: {
      germinator: {
        type: 'string',
        pattern: '^v2$',
      },
      namingStrategy: {
        type: 'string',
        enum: Object.keys(NamingStrategies),
      },
      schemaName: {
        type: 'string',
      },
      tables: {
        type: 'object',
        additionalProperties: {
          type: 'string',
        },
      },
      synchronize: {
        $ref: '#/definitions/Synchronize',
      },
      $env: {
        $ref: '#/definitions/Environment',
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
            $idColumnName: {
              anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
            },
            $schemaName: { type: 'string' },
            $synchronize: {
              $ref: '#/definitions/Synchronize',
            },
            $env: {
              $ref: '#/definitions/Environment',
            },
          },
        },
      },
      Environment: {
        anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'string' }],
      },
      Synchronize: {
        oneOf: [
          { type: 'boolean' },
          { type: 'array', items: { $ref: '#/definitions/Environment' } },
        ],
      },
    },
  });

  static loadFromRenderedFile(rawData: any, fileName: string) {
    const { validate } = SeedFile;
    const valid = validate(rawData);

    if (valid) {
      return new SeedFile(rawData);
    }

    const err = validate.errors
      ?.map(({ dataPath, message }) => `${dataPath || 'root'}: ${message ?? 'No message'}`)
      .join(', ');

    throw new InvalidSeed(`Validation error in ${fileName}: ${err ?? 'unknown error'}`);
  }

  public readonly entries: SeedEntry[];

  constructor({
    entities,
    synchronize,
    $env,
    namingStrategy,
    schemaName,
    tables: tableMapping = {},
  }: SeedFileYaml) {
    const resolvedNamingStrategy = namingStrategy
      ? NamingStrategies[namingStrategy]
      : NamingStrategies.SnakeCase;

    if (!resolvedNamingStrategy) {
      throw new InvalidSeed(`Invalid namingStrategy ${namingStrategy!}`);
    }

    const environment = toArray<string>($env);

    this.entries = entities.map(
      (v) =>
        new SeedEntry(v, {
          namingStrategy: resolvedNamingStrategy,
          tableMapping,
          schemaName,
          synchronize,
          environment,
        }),
    );
  }

  static resolveAllEntries(seeds: SeedFile[]) {
    const seedEntries = new Map<string, SeedEntry>();

    // collect all SeedEntry's into a map, avoiding conflicting $id's
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
      entry.resolveDependencies(seedEntries);
    }

    function entries() {
      return seedEntries;
    }

    async function upsertAll(conn: Knex, cache: Cache = new Map<string, RawSeedEntryRecord>()) {
      if (cache.size === 0) {
        for (const entry of await conn('germinator_seed_entry').select<RawSeedEntryRecord[]>()) {
          cache.set(entry.$id, entry);
        }
      }

      for (const entry of seedEntries.values()) {
        if (entry.shouldUpsert) {
          await entry.upsert(conn, cache);
        }
      }

      return seedEntries;
    }

    async function synchronize(conn: Knex, cache: Cache = new Map<string, RawSeedEntryRecord>()) {
      const shouldDeleteIfMissing = await conn('germinator_seed_entry')
        .select<RawSeedEntryRecord[]>()
        // ordering this way has the best chance of avoiding FK constraint problems
        .orderBy('created_at', 'DESC')
        .where({ synchronize: true });

      // first, we'll create any new
      await upsertAll(conn, cache);

      // then delete any seed entries that should no longer exist
      for (const entry of shouldDeleteIfMissing) {
        if (!seedEntries.has(entry.$id)) {
          log(`Running delete of seed: ${entry.$id}`);

          await conn.transaction(async (trx) => {
            let entryQueryBuilder = trx.queryBuilder().from(entry.table_name);

            if (entry.schema_name) {
              entryQueryBuilder = entryQueryBuilder.withSchema(entry.schema_name);
            }

            // create a where clause with all primary keys
            const idLookupClause = entry.created_id_names.reduce(
              (clause, columnName, i) => ({ ...clause, [columnName]: entry.created_ids[i] }),
              {},
            );

            await entryQueryBuilder.delete().where(idLookupClause);

            await trx('germinator_seed_entry').delete().where({ $id: entry.$id });
          });
        }
      }

      return seedEntries;
    }

    return {
      entries,
      upsertAll,
      synchronize,
    };
  }
}

function toArray(i: undefined): undefined;
function toArray<I>(i: I | I[]): I[];
function toArray<I>(i?: I | I[]): I[] | undefined;

function toArray<I>(i?: I | I[]): I[] | undefined {
  if (typeof i === 'undefined') return undefined;
  if (Array.isArray(i)) return i;
  return [i];
}
