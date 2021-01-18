/* eslint-disable import/no-duplicates */
import type Knex from 'knex';
import type { QueryBuilder } from 'knex';

import debug from 'debug';
import { DataType, Mapping, mapper } from '@lcdev/mapper';
import Ajv from 'ajv';
import plimit from 'p-limit';
import SnakeCase from 'to-snake-case';
import * as Hogan from 'hogan.js';
import stringify from 'json-stable-stringify';
import objectHash from 'object-hash';
import {
  InvalidSeed,
  InvalidSeedEntryCreation,
  UpdateOfDeletedEntry,
  UpdateOfMultipleEntries,
  SynchronizeWithNoTracking,
  UnresolvableID,
  DuplicateID,
} from './errors';

const currentEnv = () => process.env.NODE_ENV;

const log = debug('germinator:seed');
const logLoading = debug('germinator:loading');

export type YamlPrimitive = string | number | boolean | Date | null;
export type YamlObject = { [k: string]: Yaml };
export type Yaml = YamlObject | YamlPrimitive | Yaml[];

/** Represents a unique key used to identify database records. Array means composite keys. */
export type PrimaryOrForeignKey = number | string | (number | string)[];

/** Type within YAML for references between entries */
export interface EntryReference {
  $id: string;
  $idColumn?: string;
}

/** A renaming map used to resolve "EntityName" to "real_entity_name_table" */
export type TableMapping = Record<string, string>;

/** A strategy for mapping table and column names from what's in seed files to database queries */
export type NamingStrategy = (name: string) => string;

/** Known NamingStrategies that will be interpreted */
export const NamingStrategies = {
  AsIs: (name: string) => name,
  SnakeCase,
};

/** Options for how germinator should run */
export interface Options {
  /** Does not actually INSERT or UPDATE records, only prints out queries that it normally would have */
  dryRun?: boolean;
  /** Never tracks seed entries that are made - incompatible with synchronize */
  noTracking?: boolean;
}

/**
 * The type of parsed objects in YAML seed files.
 *
 * - MyTableName:
 *     $id: foo-bar
 *     column_name: value
 */
interface SeedEntryYaml {
  [entityName: string]: {
    $id: string | YamlObject;
    $idColumnName?: string | string[];
    $namingStrategy?: keyof typeof NamingStrategies;
    $schemaName?: string;
    $synchronize?: boolean | string[];
    $env?: string | string[];
    [prop: string]: Yaml | EntryReference | undefined;
  };
}

/**
 * The type of the full YAML object parsed from seed files.
 */
interface SeedFileYaml {
  synchronize: boolean | string[];
  $env?: string | string[];
  namingStrategy?: keyof typeof NamingStrategies;
  schemaName?: string;
  tables?: TableMapping;
  entities: SeedEntryYaml[];
}

/** Options for SeedEntry constructor */
interface SeedEntryOptions {
  namingStrategy?: NamingStrategy;
  tableMapping?: TableMapping;
  schemaName?: string;
  synchronize?: boolean | string[];
  environments?: string[];
}

interface RawSeedEntryRecord {
  /* eslint-disable camelcase */
  $id: string;
  table_name: string;
  schema_name: string | null;
  object_hash: string;
  synchronize: boolean;
  created_ids: string | string[];
  created_id_names: string | string[];
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

  /**
   * Should this seed entry stay synchronized when changes to it are detected?
   * Array means environments that should be synchronized.
   */
  readonly synchronize: boolean | string[];
  /** Which environments should this seed run in? */
  readonly environments?: string[];

  /** The selected naming strategy for tables and columns */
  readonly namingStrategy?: NamingStrategy;

  /** State: Database column values (mutated when dependencies are resolved) */
  private properties: YamlObject;

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

    return this.environments.includes(currentEnv()!);
  }

  /** If this entry should be updated or deleted on subsequent runs of germinator */
  get shouldSynchronize(): boolean {
    return typeof this.synchronize === 'boolean'
      ? this.synchronize
      : this.synchronize.includes(currentEnv()!);
  }

  /** This is a subset of properties, excluding references */
  get ownColumns() {
    return Object.entries(this.properties).reduce((acc, [key, val]) => {
      if (val && typeof val === 'object' && '$id' in val) return acc;

      return Object.assign(acc, { [key]: val });
    }, {});
  }

  constructor(
    raw: SeedEntryYaml,
    {
      namingStrategy = NamingStrategies.AsIs,
      tableMapping = {},
      schemaName,
      environments,
      synchronize = false,
    }: SeedEntryOptions,
    private readonly options?: Options,
  ) {
    if (Object.keys(raw).length === 0) {
      throw new InvalidSeed('SeedEntry created with no name');
    } else if (Object.keys(raw).length > 1) {
      throw new InvalidSeed('SeedEntry created with multiple names');
    }

    const [
      [
        tableName,
        { $id, $idColumnName, $namingStrategy, $schemaName, $synchronize, $env, ...props },
      ],
    ] = Object.entries(raw);

    // choose either parent or entry override
    this.synchronize = $synchronize ?? synchronize;
    this.schemaName = $schemaName ?? schemaName;

    this.namingStrategy = $namingStrategy ? NamingStrategies[$namingStrategy] : namingStrategy;

    if (!this.namingStrategy) {
      throw new InvalidSeed(`Invalid $namingStrategy: ${$namingStrategy ?? 'undefined'}`);
    }

    this.tableName =
      tableName in tableMapping ? tableMapping[tableName] : namingStrategy(tableName);

    this.environments = toArray<string>($env ?? environments);

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

        const jsonObj = obj as YamlObject;

        // go through each property name, renaming them with namingStrategy
        for (const [key, val] of Object.entries(jsonObj)) {
          if (key !== '$id') {
            const newKeyName = namingStrategy(key);
            delete jsonObj[key];

            jsonObj[newKeyName] = mapper(val, mapping) as Yaml;
          }
        }

        return obj;
      },
    };

    const resolved$id = mapper($id, mapping) as string | YamlObject;

    // $id can be a string, or an object, which will be stringified
    this.$id = typeof resolved$id === 'string' ? resolved$id : stringify(resolved$id);
    this.$idColumnName = toArray(mapper($idColumnName ?? 'id', mapping) as string | string[]);
    this.properties = mapper(props, propMapping) as YamlObject;

    logLoading(`Loaded seed entry ${this.$id}`);
  }

  resolveDependencies(allEntries: Map<string, SeedEntry>) {
    this.properties = mapper(this.properties, {
      [DataType.Object]: (reference) => {
        if (!('$id' in reference)) {
          return reference;
        }

        const { $id } = reference as EntryReference;
        const entry = allEntries.get($id);

        if (!entry) {
          throw new UnresolvableID(`Unable to resolve $id to ${$id}`);
        }

        logLoading(`Resolved reference to $id: ${$id}`);
        this.dependencies.push(entry);

        return reference;
      },
    }) as YamlObject;

    this.isResolved = true;

    return this.dependencies;
  }

  async upsert(kx: Knex, cache?: Cache) {
    if (this.created) return this.created;

    // store the promise of creation, so that a diamond dependency doesn't end up
    // starting the create function more than once
    this.created = this.upsertNonLazy(kx, cache);

    return this.created;
  }

  async upsertNonLazy(kx: Knex, cache?: Cache) {
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
    const refs = new Map<string, SeedEntry>();

    for (const dep of await Promise.all(
      this.dependencies.map((entry) => entry.upsert(kx, cache)),
    )) {
      refs.set(dep.$id, dep);
    }

    // resolve properties with the ids of dependencies that were just created
    const toInsert = mapper(this.properties, {
      [DataType.Object]: (obj) => {
        if (!('$id' in obj)) {
          return obj;
        }

        const { $id, $idColumn } = obj as EntryReference;

        const found = refs.get($id);

        if (found?.id === undefined) {
          throw new UnresolvableID(`The reference to $id ${$id} failed to lookup`);
        }

        if ($idColumn) {
          const index = found.$idColumnName.indexOf($idColumn);

          if (index < 0) {
            throw new InvalidSeed(
              `Reference to $id ${$id} referenced $idColumn ${$idColumn}, but the entry itself does not have that column in $idColumnNames`,
            );
          }

          const resolvedValue = toArray(found.id)[index];

          if (typeof resolvedValue === 'undefined') {
            throw new InvalidSeedEntryCreation(`Reference to $idColumn ${$idColumn} was undefined`);
          }

          return resolvedValue;
        }

        return found.id;
      },
    }) as YamlObject;

    let existingEntry: RawSeedEntryRecord | undefined;

    if (cache) {
      existingEntry = cache.get(this.$id);
    } else if (!this.options?.noTracking) {
      existingEntry = await kx('germinator_seed_entry')
        .first<RawSeedEntryRecord>()
        .where({ $id: this.$id });
    }

    // here is the "insert" pathway, when it has not existed yet
    if (!existingEntry) {
      await kx.transaction(async (trx) => {
        log(`Running insert of seed: ${this.$id}`);

        const isSqlite =
          (kx.client as { config?: { client: string } }).config?.client === 'sqlite3';

        let insertQuery = trx.queryBuilder();

        if (this.schemaName) {
          insertQuery = insertQuery.withSchema(this.schemaName);
        }

        insertQuery = insertQuery.insert(toInsert).from(this.tableName);

        if (!isSqlite) {
          insertQuery = insertQuery.returning(this.$idColumnName);
        }

        const insertRet = await executeMutation<Record<string, number | string>[]>(
          insertQuery,
          this.options,
        );

        let inserted: Record<string, number | string> | undefined;

        if (insertRet && !isSqlite) {
          [inserted] = insertRet;
        }

        // sqlite3 doesn't have RETURNING
        if (!inserted && isSqlite && !this.options?.dryRun) {
          // we lookup what the primary key(s) are based on last rowid
          const [{ rowid }] = await trx.raw<{ rowid: number }[]>(
            `SELECT last_insert_rowid() as rowid`,
          );

          let getBackEntry = trx
            .queryBuilder()
            .select<Record<string, number | string>>(this.$idColumnName)
            .from(this.tableName)
            .where({ rowid })
            .first();

          if (this.schemaName) {
            getBackEntry = getBackEntry.withSchema(this.schemaName);
          }

          inserted = await getBackEntry;
        }

        // at this point in a dry run, we can quit out
        if (this.options?.dryRun) {
          return;
        }

        if (!inserted) {
          throw new InvalidSeedEntryCreation(
            `Seed ${this.$id} did not return its created ID correctly`,
          );
        }

        if (this.$idColumnName.length === 1) {
          this.id = inserted[this.$idColumnName[0]];
        } else {
          this.id = this.$idColumnName.map((columnName) => inserted![columnName]);
        }

        if (!this.id) {
          throw new InvalidSeedEntryCreation(`Seed ${this.$id} returned an invalid ID`);
        }

        if (!this.options?.noTracking) {
          await trx('germinator_seed_entry').insert({
            $id: this.$id,
            table_name: this.tableName,
            object_hash: objectHash(toInsert),
            synchronize: this.shouldSynchronize,
            created_ids: toArray(this.id),
            created_id_names: this.$idColumnName,
            created_at: new Date(),
          });
        }
      });
    }

    // below lies the "update" pathway (seed entry had previously existed)
    if (existingEntry) {
      this.id = sqlArray(existingEntry.created_ids);

      if (this.options?.noTracking && (this.shouldSynchronize || existingEntry.synchronize)) {
        throw new SynchronizeWithNoTracking(
          'When using noTracking, "synchronize" seed entries cannot be created',
        );
      }

      if (this.shouldSynchronize && existingEntry.synchronize) {
        const currentHash = objectHash(toInsert);

        if (currentHash !== existingEntry.object_hash) {
          log(`Running update of seed: ${this.$id}`);

          await kx.transaction(async (trx) => {
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

            const count = await executeMutation(
              entryQueryBuilder.from(this.tableName).update(toInsert).where(idLookupClause),
              this.options,
            );

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

            await executeMutation(
              trx('germinator_seed_entry')
                .update({ object_hash: currentHash })
                .where({ $id: this.$id }),
              this.options,
            );
          });
        }
      } else if (existingEntry.synchronize) {
        log(`Marking ${this.$id} as non-synchronize`);

        // this seed was inserted with 'synchronize = true', but is not anymore
        await executeMutation(
          kx('germinator_seed_entry').update({ synchronize: false }).where({ $id: this.$id }),
          this.options,
        );
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
      schemaName: {
        type: 'string',
      },
      tables: {
        type: 'object',
        additionalProperties: {
          type: 'string',
        },
      },
      namingStrategy: {
        $ref: '#/definitions/NamingStrategy',
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
            $namingStrategy: {
              $ref: '#/definitions/NamingStrategy',
            },
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
      NamingStrategy: {
        type: 'string',
        enum: Object.keys(NamingStrategies),
      },
    },
  });

  static loadFromRenderedFile(rawData: any, options?: Options, fileName?: string) {
    const { validate } = SeedFile;
    const valid = validate(rawData);

    if (valid) {
      return new SeedFile(rawData, options);
    }

    const err = validate.errors
      ?.map(({ dataPath, message }) => `${dataPath || 'root'}: ${message ?? 'No message'}`)
      .join(', ');

    throw new InvalidSeed(
      `Validation error in ${fileName ?? 'unknown file'}: ${err ?? 'unknown error'}`,
    );
  }

  public readonly entries: SeedEntry[];

  constructor(
    {
      entities,
      synchronize,
      $env,
      namingStrategy,
      schemaName,
      tables: tableMapping = {},
    }: SeedFileYaml,
    options?: Options,
  ) {
    const resolvedNamingStrategy = namingStrategy
      ? NamingStrategies[namingStrategy]
      : NamingStrategies.SnakeCase;

    if (!resolvedNamingStrategy) {
      throw new InvalidSeed(`Invalid namingStrategy ${namingStrategy!}`);
    }

    const environments = toArray<string>($env);

    this.entries = entities.map(
      (v) =>
        new SeedEntry(
          v,
          {
            namingStrategy: resolvedNamingStrategy,
            tableMapping,
            schemaName,
            synchronize,
            environments,
          },
          options,
        ),
    );
  }
}

export function resolveAllEntries(seeds: SeedFile[], options?: Options) {
  const seedEntries = new Map<string, SeedEntry>();

  // collect all SeedEntry's into a map, avoiding conflicting $id's
  for (const seed of seeds) {
    for (const entry of seed.entries) {
      if (seedEntries.has(entry.$id)) {
        throw new DuplicateID(`Found duplicate seed entry '${entry.$id}'!`);
      }

      seedEntries.set(entry.$id, entry);
    }
  }

  logLoading('Resolving inter-seed references');

  // resolve all $id's
  for (const entry of seedEntries.values()) {
    entry.resolveDependencies(seedEntries);
  }

  function entries() {
    return seedEntries;
  }

  async function upsertAll(kx: Knex, cache: Cache = new Map<string, RawSeedEntryRecord>()) {
    log(`Running upserts for ${seedEntries.size} seeds`);

    if (cache.size === 0 && !options?.noTracking) {
      log('Populating cache');

      for (const entry of await kx('germinator_seed_entry').select<RawSeedEntryRecord[]>()) {
        cache.set(entry.$id, entry);
      }
    }

    const pool = plimit(50);
    const work: Promise<SeedEntry>[] = [];

    for (const entry of seedEntries.values()) {
      if (entry.shouldUpsert) {
        work.push(pool(() => entry.upsert(kx, cache)));
      }
    }

    return Promise.all(work);
  }

  async function synchronize(kx: Knex, cache: Cache = new Map<string, RawSeedEntryRecord>()) {
    // first, we'll create and update
    await upsertAll(kx, cache);

    if (options?.noTracking) {
      return seedEntries;
    }

    log('Checking for any seeds that were previously present and no longer are');

    // then delete any seed entries that should no longer exist
    const shouldDeleteIfMissing = await kx('germinator_seed_entry')
      .select<RawSeedEntryRecord[]>()
      // ordering this way has the best chance of avoiding FK constraint problems
      .orderBy('created_at', 'DESC')
      .where({ synchronize: true })
      // we have to limit the whereNotIn to 999 entries, as this caps SQL limits
      // to compensate, we check if seedEntries.has(entry.$id) below
      .whereNotIn('$id', [...seedEntries.keys()].slice(0, 999));

    for (const entry of shouldDeleteIfMissing) {
      if (!seedEntries.has(entry.$id)) {
        log(`Running delete of seed: ${entry.$id}`);

        const createdIds = sqlArray(entry.created_ids);
        const createdIdNames = sqlArray(entry.created_id_names);

        await kx.transaction(async (trx) => {
          let deleteInserted = trx.queryBuilder().delete().from(entry.table_name);

          if (entry.schema_name) {
            deleteInserted = deleteInserted.withSchema(entry.schema_name);
          }

          // create a where clause with all primary keys
          const idLookupClause = createdIdNames.reduce(
            (clause, columnName, i) => ({ ...clause, [columnName]: createdIds[i] }),
            {},
          );

          await executeMutation(
            [
              deleteInserted.where(idLookupClause),
              trx('germinator_seed_entry').delete().where({ $id: entry.$id }),
            ],
            options,
          );
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

function toArray(i: undefined): undefined;
function toArray<I>(i: I | I[]): I[];
function toArray<I>(i?: I | I[]): I[] | undefined;

function toArray<I>(i?: I | I[]): I[] | undefined {
  if (typeof i === 'undefined') return undefined;
  if (Array.isArray(i)) return i;
  return [i];
}

function sqlArray(inp: string | string[]): string[] {
  if (Array.isArray(inp)) return inp;
  return inp.split(',');
}

async function executeMutation(query: QueryBuilder, options?: Options): Promise<number>;

async function executeMutation<TRecord>(
  query: QueryBuilder<TRecord>,
  options?: Options,
): Promise<TRecord>;

async function executeMutation<TRecord>(
  query: QueryBuilder<TRecord>[],
  options?: Options,
): Promise<TRecord[]>;

async function executeMutation<TRecord>(
  query: QueryBuilder<TRecord> | QueryBuilder<TRecord>[],
  options?: Options,
) {
  if (options?.dryRun) {
    /* eslint-disable-next-line no-console */
    console.log(`dry-run: ${query.toString()}`);
  } else if (Array.isArray(query)) {
    return Promise.all(query);
  } else {
    return query;
  }
}
