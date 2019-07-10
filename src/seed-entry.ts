import * as Knex from 'knex';
import * as moment from 'moment';
import * as objectHash from 'object-hash';
import * as Hogan from 'hogan.js';
import { getLogger } from '@servall/logger';
import { Json } from '@servall/ts';
import { mapper, Mapping, DataType } from '@servall/mapper';
import { toEnv, currentEnv, Environment, RawEnvironment } from './environment';
import {
  NamingStrategy,
  TableMapping,
  InvalidSeed,
  CorruptedSeed,
} from './seed';

export class BadCreate extends Error {}

type SeedEntryRaw = {
  [entityName: string]: {
    $id: string;
    $idColumnName?: string;
    $env?: string | string[];
    [prop: string]: Json | undefined;
  };
};

type SeedEntryOptions = {
  namingStrategy: NamingStrategy;
  tableMapping: TableMapping;
  synchronize: boolean;
  environment?: Environment | Environment[];
};

export type Cache = Map<string, {
  table_name: string;
  object_hash: string;
  synchronize: boolean;
  created_id: number;
  created_at: Date,
}>;

export class SeedEntry {
  tableName: string;
  synchronize: boolean;
  environment?: Environment | Environment[];
  $id: string;
  $idColumnName: string;
  props: { [prop: string]: Json };
  dependencies: SeedEntry[] = [];
  private isResolved = false;
  private created?: Promise<SeedEntry>;

  // database id once inserted or found
  private id?: number;
  get createdId() { return this.id };

  constructor(
    raw: SeedEntryRaw,
    {
      namingStrategy,
      tableMapping,
      synchronize,
      environment,
    }: SeedEntryOptions,
  ) {
    if (Object.keys(raw).length === 0) {
      throw new InvalidSeed('SeedEntry created with no name');
    } else if (Object.keys(raw).length > 1) {
      throw new InvalidSeed('SeedEntry created with multiple names');
    }

    const [[tableName, { $id, $idColumnName, $env, ...props }]] = Object.entries(raw);

    this.synchronize = synchronize;
    this.environment = $env ? toEnv($env as RawEnvironment | RawEnvironment[]) : environment;

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
        // fast path
        if (!str.includes('{') && !str.includes('}')) return str;

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
        return moment(date).toISOString();
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

  get shouldCreate() {
    if (!this.environment) return true;
    if (Array.isArray(this.environment)) return this.environment.some(env => env === currentEnv());
    return this.environment === currentEnv();
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

    this.isResolved = true;
  }

  async create(knex: Knex, cache?: Cache) {
    if (this.created) return this.created;

    // store the promise of creation, so that a diamond dependency doesn't end up
    // starting the create function more than once
    return this.created = this._create(knex, cache);
  }

  private async _create(knex: Knex, cache?: Cache) {
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
          const found = refs.find(({ id, $id }) => $id === v.$id);

          if (!found) {
            throw new CorruptedSeed(`The ref to $id ${v.$id} failed to lookup`);
          }

          return found.id;
        }

        return v;
      },
    });

    const [exists] = cache ? [cache.get(this.$id)]
      : await knex('germinator_seed_entry').where({ $id: this.$id });

    if (exists) {
      this.id = exists.created_id;

      if (this.synchronize) {
        if (objectHash(toInsert) !== exists.object_hash) {
          getLogger()!.info(`Running update of seed: ${this.$id}`);

          await knex.transaction(async (trx) => {
            await trx(this.tableName)
              .update(toInsert)
              .where({ [this.$idColumnName]: this.id });
            await trx('germinator_seed_entry')
              .update({
                object_hash: objectHash(toInsert),
                synchronize: this.synchronize,
                created_at: new Date(),
              })
              .where({ $id: this.$id });
          });
        }
      }

      return this;
    }

    await knex.transaction(async (trx) => {
      getLogger()!.info(`Running insert of seed: ${this.$id}`);

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
          created_id_name: this.$idColumnName,
          created_at: new Date(),
        });

      await trx.commit();
    });

    return this;
  }
}
