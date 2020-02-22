import * as Knex from 'knex';
import * as moment from 'moment';
import * as objectHash from 'object-hash';
import * as Hogan from 'hogan.js';
import { getLogger } from '@lcdev/logger';
import { Json } from '@lcdev/ts';
import { mapper, Mapping, DataType } from '@lcdev/mapper';
import { toEnv, currentEnv, Environment, RawEnvironment } from './environment';
import { NamingStrategy, TableMapping, InvalidSeed, CorruptedSeed } from './seed';

/* eslint-disable camelcase, react/static-property-placement */

export class BadCreate extends Error {}

type SeedEntryRaw = {
  [entityName: string]: {
    $id: string;
    $idColumnName?: string | string[];
    $synchronize?: boolean | RawEnvironment[];
    $env?: RawEnvironment | RawEnvironment[];
    [prop: string]: Json | undefined;
  };
};

type SeedEntryOptions = {
  namingStrategy: NamingStrategy;
  tableMapping: TableMapping;
  schemaName?: string;
  synchronize: boolean | Environment[];
  environment?: Environment | Environment[];
};

type DBSeedEntry = {
  table_name: string;
  object_hash: string;
  synchronize: boolean;
  created_id: string;
  created_at: Date;
};

export type Cache = Map<string, DBSeedEntry>;

export class SeedEntry {
  tableName: string;
  schemaName?: string;
  synchronize: boolean;
  environment?: Environment | Environment[];
  $id: string;
  $idColumnName: string[];
  props: { [prop: string]: Json };
  dependencies: SeedEntry[] = [];
  private isResolved = false;
  private created?: Promise<SeedEntry>;

  // database id once inserted or found
  id?: (number | string)[];
  get createdId() {
    return this.id;
  }

  constructor(
    raw: SeedEntryRaw,
    { namingStrategy, tableMapping, schemaName, synchronize, environment }: SeedEntryOptions,
  ) {
    if (Object.keys(raw).length === 0) {
      throw new InvalidSeed('SeedEntry created with no name');
    } else if (Object.keys(raw).length > 1) {
      throw new InvalidSeed('SeedEntry created with multiple names');
    }

    const [[tableName, { $id, $idColumnName, $synchronize, $env, ...props }]] = Object.entries(raw);

    this.environment = $env ? toEnv($env) : environment;
    this.schemaName = schemaName;

    // choose either parent or entry override's $synchronize
    const resolvedSynchronize = $synchronize !== undefined ? $synchronize : synchronize;
    // then resolve it potentially depending on environment
    this.synchronize =
      typeof resolvedSynchronize === 'boolean'
        ? resolvedSynchronize
        : toEnv(resolvedSynchronize).some(env => env === currentEnv());

    const mapping: Mapping = {
      [DataType.String]: str => {
        // fast path
        if (!str.includes('{')) return str;

        // context provided to strings, allowing $id: "{tableName}-1"
        // we use single curly delimiters here to avoid conflicting with the parent handlebars
        const tmpl = Hogan.compile(str, { delimiters: '{ }' }) as Hogan.Template;

        return tmpl.render({
          table: this.tableName,
          tableName: this.tableName,
        });
      },
      [DataType.Date]: date => {
        return moment(date).toISOString();
      },
    };

    const propMapping: Mapping = {
      ...mapping,
      [DataType.Object]: (obj: any, ctx?: string) => {
        // see nested json test for an example
        if (ctx) return obj;

        for (const [key, val] of Object.entries(obj)) {
          if (key === '$id') {
            obj[key] = mapper(val, mapping);
          } else {
            delete obj[key];
            obj[namingStrategy(key)] = mapper(val, mapping);
          }
        }

        return obj;
      },
    };

    this.tableName = tableMapping[tableName] || namingStrategy(tableName);
    this.$id = mapper($id, mapping);

    // Ensure $idColumnName is an array to support composite keys
    this.$idColumnName = mapper(
      !Array.isArray($idColumnName) ? [$idColumnName ?? 'id'] : $idColumnName,
      mapping,
    );

    this.props = mapper(props, propMapping);
  }

  get isCreated() {
    return !!this.id;
  }

  get shouldCreate() {
    if (!this.environment) return true;
    if (Array.isArray(this.environment)) return this.environment.some(env => env === currentEnv());
    return this.environment === currentEnv();
  }

  resolve(allEntries: Map<string, SeedEntry>) {
    this.props = mapper(this.props, {
      custom: [
        [
          val => val && !!val.$id,
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

    this.isResolved = true;
  }

  async create(knex: Knex, cache?: Cache) {
    if (this.created) return this.created;

    // store the promise of creation, so that a diamond dependency doesn't end up
    // starting the create function more than once
    return (this.created = this.privateCreate(knex, cache));
  }

  private async privateCreate(knex: Knex, cache?: Cache) {
    if (!this.shouldCreate) {
      throw new BadCreate(`Tried to create a seed entry (${this.$id}) that should not have been.`);
    }

    if (!this.isResolved) {
      // this will fail if there were any references
      this.resolve(new Map());
    }

    const refs = await Promise.all(this.dependencies.map(entry => entry.create(knex, cache)));

    // resolve our props with the ids created
    const toInsert = mapper(this.props, {
      [DataType.Object]: (v: any) => {
        if (v.$id) {
          const found = refs.find(({ $id }) => $id === v.$id);

          if (!found?.id) {
            throw new CorruptedSeed(`The ref to $id ${v.$id} failed to lookup`);
          }

          if (found.id.length > 1) {
            throw new InvalidSeed(
              `Cannot associate $id '${this.$id}' with ref $id '${v.$id}' since it has multiple ID columns. Composite foreign keys are not currently supported`,
            );
          }

          return found.id[0];
        }

        return v;
      },
    });

    const [dbSeedEntry] = cache
      ? [cache.get(this.$id)]
      : await knex<DBSeedEntry>('germinator_seed_entry').where({ $id: this.$id });

    if (dbSeedEntry) {
      this.id = JSON.parse(dbSeedEntry.created_id);

      if (this.synchronize && dbSeedEntry.synchronize) {
        if (objectHash(toInsert) !== dbSeedEntry.object_hash) {
          getLogger()!.info(`Running update of seed: ${this.$id}`);

          await knex.transaction(async trx => {
            const entryQueryBuilder = trx.queryBuilder();

            if (this.schemaName) {
              entryQueryBuilder.withSchema(this.schemaName);
            }

            await entryQueryBuilder
              .from(this.tableName)
              .update(toInsert)
              .where(
                this.$idColumnName.reduce(
                  (merged, columnName, index) => ({
                    ...merged,
                    [columnName]: this.id![index],
                  }),
                  {},
                ),
              );

            await trx('germinator_seed_entry')
              .update({
                object_hash: objectHash(toInsert),
                synchronize: this.synchronize,
                created_at: new Date(),
              })
              .where({ $id: this.$id });
          });
        }
      } else if (dbSeedEntry.synchronize) {
        // this seed was inserted with 'synchronize', but is not anymore
        await knex('germinator_seed_entry')
          .update({
            synchronize: false,
          })
          .where({ $id: this.$id });
      }

      return this;
    }

    await knex.transaction(async trx => {
      getLogger()!.info(`Running insert of seed: ${this.$id}`);

      const entryQueryBuilder = trx.queryBuilder();

      if (this.schemaName) {
        entryQueryBuilder.withSchema(this.schemaName);
      }

      let insertedIds = await entryQueryBuilder
        .from(this.tableName)
        .insert(toInsert)
        .returning<(string | number)[]>(this.$idColumnName);

      // sqlite3 doesn't have RETURNING
      if (knex.client.config && knex.client.config.client === 'sqlite3') {
        const sqliteQueryBuilder = trx.queryBuilder();

        if (this.schemaName) {
          sqliteQueryBuilder.withSchema(this.schemaName);
        }

        const insertedEntry: { [columnName: string]: string | number } = await sqliteQueryBuilder
          .from(this.tableName)
          .select(this.$idColumnName)
          .whereRaw('rowid = last_insert_rowid()')
          .first();

        insertedIds = this.$idColumnName.map(columnName => insertedEntry[columnName]);
      }

      // mssql returns results differently
      // if (knex.client.config && knex.client.config.client === 'mssql') {
      //   inserted = this.$idColumnName.reduce(
      //     (acc, columnName, index) => ({
      //       ...acc,
      //       [columnName]: ((inserted as unknown) as (string | number)[])[index],
      //     }),
      //     {},
      //   );
      // }

      this.id = insertedIds;

      if (!this.id) {
        throw new InvalidSeed(`Seed ${this.$id} did not return its created ID correctly`);
      }

      await trx('germinator_seed_entry').insert({
        $id: this.$id,
        table_name: this.tableName,
        object_hash: objectHash(toInsert),
        synchronize: this.synchronize,
        created_id: JSON.stringify(this.id),
        created_id_name: JSON.stringify(this.$idColumnName),
        created_at: new Date(),
      });

      await trx.commit();
    });

    return this;
  }
}
