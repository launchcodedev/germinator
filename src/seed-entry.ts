import * as Knex from 'knex';
import * as objectHash from 'object-hash';
import * as Hogan from 'hogan.js';
import { Json } from '@servall/ts';
import { mapper, Mapping, DataType } from '@servall/mapper';
import {
  NamingStrategy,
  TableMapping,
  InvalidSeed,
  CorruptedSeed,
} from './seed';

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
  private isResolved = false;

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
    if (Object.keys(raw).length === 0) {
      throw new InvalidSeed('SeedEntry created with no name');
    } else if (Object.keys(raw).length > 1) {
      throw new InvalidSeed('SeedEntry created with multiple names');
    }

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

    this.isResolved = true;
  }

  async create(knex: Knex) {
    if (this.isCreated) return this;

    if (!this.isResolved) {
      // this will fail if there were any references
      this.resolve(new Map());
    }

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
