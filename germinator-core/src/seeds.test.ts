import Knex from 'knex';
import { SeedEntry, SeedFile, NamingStrategies, resolveAllEntries } from './seeds';
import {
  InvalidSeedEntryCreation,
  UnresolvableID,
  DuplicateID,
  UpdateOfDeletedEntry,
} from './errors';
import { withSqlite, anyDbTest } from './test-util';

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe('SeedEntry', () => {
  it('fails with an empty entry', () => {
    expect(() => new SeedEntry({}, {})).toThrow();
  });

  it('fails with an double entry', () => {
    expect(() => new SeedEntry({ table_1: { $id: 'id1' }, table_2: { $id: 'id2' } }, {})).toThrow();
  });

  it('is not marked as created, initially', () => {
    const entry = new SeedEntry({ my_table: { $id: 'id' } }, {});

    expect(entry.isCreated).toBe(false);
    expect(entry.primaryID).toBeUndefined();
    expect(entry.shouldUpsert).toBe(true);
    expect(entry.shouldSynchronize).toBe(false);
  });

  it('sets own properties correctly', () => {
    const entry = new SeedEntry({ my_table: { $id: 'id' } }, {});

    expect(entry.$id).toBe('id');
    expect(entry.$idColumnName).toEqual(['id']);
    expect(entry.tableName).toBe('my_table');
    expect(entry.schemaName).toBeUndefined();
    expect(entry.synchronize).toBe(false);
    expect(entry.environments).toBeUndefined();
  });

  it('uses namingStrategy', () => {
    const entry = new SeedEntry(
      { MyTable: { $id: 'id' } },
      { namingStrategy: NamingStrategies.SnakeCase },
    );

    expect(entry.namingStrategy).toBe(NamingStrategies.SnakeCase);
  });

  it('uses $namingStrategy', () => {
    const entry = new SeedEntry(
      { MyTable: { $id: 'id', $namingStrategy: 'AsIs' } },
      { namingStrategy: NamingStrategies.SnakeCase },
    );

    expect(entry.namingStrategy).toBe(NamingStrategies.AsIs);
  });

  it('fails with invalid namingStrategy', () => {
    expect(
      () =>
        new SeedEntry(
          { MyTable: { $id: 'id' } },
          { namingStrategy: (null as unknown) as undefined },
        ),
    ).toThrow();

    expect(
      () =>
        new SeedEntry(
          {
            MyTable: {
              $id: 'id',
              $namingStrategy: ('Foo' as unknown) as keyof typeof NamingStrategies,
            },
          },
          {},
        ),
    ).toThrow();
  });

  it('uses tableMapping and schemaName', () => {
    const entry = new SeedEntry(
      { MyTable: { $id: 'id' } },
      { tableMapping: { MyTable: 'my_table' }, schemaName: 'dbo' },
    );

    expect(entry.tableName).toBe('my_table');
    expect(entry.schemaName).toBe('dbo');
  });

  it('uses $schemaName', () => {
    const entry = new SeedEntry(
      { MyTable: { $id: 'id', $schemaName: 'oob' } },
      { schemaName: 'dbo' },
    );

    expect(entry.schemaName).toBe('oob');
  });

  it('uses $idColumnName', () => {
    const entry1 = new SeedEntry({ MyTable: { $id: 'id', $idColumnName: 'guid' } }, {});

    expect(entry1.$idColumnName).toEqual(['guid']);

    const entry2 = new SeedEntry({ MyTable: { $id: 'id', $idColumnName: ['c', 'd'] } }, {});

    expect(entry2.$idColumnName).toEqual(['c', 'd']);
  });

  it('uses environments', () => {
    const entry = new SeedEntry({ MyTable: { $id: 'id' } }, { environments: ['staging'] });

    expect(entry.environments).toEqual(['staging']);
  });

  it('uses $env', () => {
    const entry = new SeedEntry(
      { MyTable: { $id: 'id', $env: ['staging', 'production'] } },
      { environments: ['staging'] },
    );

    expect(entry.environments).toEqual(['staging', 'production']);
  });

  it('uses synchronize', () => {
    const entry = new SeedEntry({ MyTable: { $id: 'id' } }, { synchronize: true });

    expect(entry.synchronize).toBe(true);

    const entry2 = new SeedEntry({ MyTable: { $id: 'id' } }, { synchronize: ['staging'] });

    expect(entry2.synchronize).toEqual(['staging']);
  });

  it('uses $synchronize', () => {
    const entry = new SeedEntry(
      { MyTable: { $id: 'id', $synchronize: false } },
      { synchronize: true },
    );

    expect(entry.synchronize).toBe(false);
  });

  it('uses current environment to check shouldUpsert', () => {
    process.env.NODE_ENV = 'production';

    const entry = new SeedEntry({ MyTable: { $id: 'id' } }, { environments: ['staging'] });

    expect(entry.environments).toEqual(['staging']);
    expect(entry.shouldUpsert).toBe(false);

    process.env.NODE_ENV = 'staging';
    expect(entry.shouldUpsert).toBe(true);

    delete process.env.NODE_ENV;
    expect(entry.shouldUpsert).toBe(false);
  });

  it('uses current environment to check shouldSynchronize', () => {
    process.env.NODE_ENV = 'production';

    const entry = new SeedEntry({ MyTable: { $id: 'id' } }, { synchronize: ['staging'] });

    expect(entry.synchronize).toEqual(['staging']);
    expect(entry.shouldSynchronize).toBe(false);

    process.env.NODE_ENV = 'staging';
    expect(entry.shouldSynchronize).toBe(true);

    delete process.env.NODE_ENV;
    expect(entry.shouldSynchronize).toBe(false);
  });

  it('should accept object $id properties', () => {
    const e1 = new SeedEntry({ my_table: { $id: {} } }, {});
    expect(e1.$id).toBe('{}');

    const e2 = new SeedEntry({ my_table: { $id: { foo: 1 } } }, {});
    expect(e2.$id).toBe('{"foo":1}');

    const e3 = new SeedEntry({ my_table: { $id: { foo: 1, bar: 2 } } }, {});
    expect(e3.$id).toBe('{"bar":2,"foo":1}');
  });

  describe('rendering meta properties', () => {
    it('should render meta properties in $id', () => {
      const entry = new SeedEntry({ my_table: { $id: '{tableName}' } }, {});

      expect(entry.$id).toBe('my_table');
    });

    it('should render meta properties in column properties', () => {
      const entry = new SeedEntry({ my_table: { $id: 'id', col_1: '{table}-val' } }, {});

      expect(entry.ownColumns).toEqual({ col_1: 'my_table-val' });
    });
  });

  describe('ownColumns', () => {
    it('uses established namingStrategy', () => {
      const entry = new SeedEntry(
        { my_table: { $id: 'id', colA: 42 } },
        { namingStrategy: NamingStrategies.SnakeCase },
      );

      expect(entry.ownColumns).toEqual({ col_a: 42 });
    });

    it('maps any dates in ISO format', () => {
      const entry = new SeedEntry(
        { my_table: { $id: 'id', colA: new Date('2020-01-01T00:00:00.0000Z') } },
        {},
      );

      expect(entry.ownColumns).toEqual({ colA: '2020-01-01T00:00:00.000Z' });
    });

    it('maps JSONB-like values without renaming fields', () => {
      const entry = new SeedEntry(
        { my_table: { $id: 'id', colA: { valA: 'foobar' } } },
        { namingStrategy: NamingStrategies.SnakeCase },
      );

      expect(entry.ownColumns).toEqual({ col_a: { valA: 'foobar' } });
    });

    it('excludes references', () => {
      const entry = new SeedEntry({ my_table: { $id: 'id', ref: { $id: 'other-id' } } }, {});

      expect(entry.ownColumns).toEqual({});
    });
  });

  describe('resolveDependencies', () => {
    const setupEntries = () => [
      new SeedEntry({ a: { $id: '{tableName}-1', refToB: { $id: 'b-1' } } }, {}),
      new SeedEntry({ b: { $id: '{tableName}-1' } }, {}),
    ];

    it('fails when a dependency is not found', () => {
      const [entryA] = setupEntries();

      expect(() => entryA.resolveDependencies(new Map())).toThrow();
    });

    it('looks up a simple dependency', () => {
      const [entryA, entryB] = setupEntries();
      const otherEntries = new Map([[entryB.$id, entryB]]);

      expect(entryA.resolveDependencies(otherEntries)).toEqual([entryB]);
    });
  });
});

describe('SeedFile', () => {
  it('parses a empty file', () => {
    const file = new SeedFile({
      entities: [],
      synchronize: false,
    });

    expect(file.entries).toHaveLength(0);
  });

  it('passes options down into entities', () => {
    const file = new SeedFile({
      entities: [
        {
          table_a: {
            $id: '{table}-1',
          },
        },
      ],
      synchronize: true,
      $env: ['staging'],
      namingStrategy: 'AsIs',
    });

    expect(file.entries).toHaveLength(1);
    expect(file.entries[0].environments).toEqual(['staging']);
    expect(file.entries[0].synchronize).toBe(true);
    expect(file.entries[0].shouldSynchronize).toBe(true);
    expect(file.entries[0].namingStrategy).toBe(NamingStrategies.AsIs);
  });

  describe('loadFromRenderedFile', () => {
    it('fails with an invalid file', () => {
      expect(() => SeedFile.loadFromRenderedFile({})).toThrow();
    });

    it('loads a valid file', () => {
      SeedFile.loadFromRenderedFile({ germinator: 'v2', synchronize: false, entities: [] });
    });
  });
});

describe('Running Seeds', () => {
  const makeTableA = (kx: Knex) =>
    kx.schema.createTable('table_a', (table) => {
      table.increments('id').primary().notNullable();
      table.text('foo_bar').notNullable();
    });

  const makeTableB = (kx: Knex) =>
    kx.schema.createTable('table_b', (table) => {
      table.increments('id').primary().notNullable();
      table.integer('table_a_ref');
      table.foreign('table_a_ref').references('table_a.id');
    });

  const makeTableC = (kx: Knex) =>
    kx.schema.createTable('table_c', (table) => {
      table.uuid('guid').primary().notNullable();
      table.text('foo_bar');
    });

  const makeTableD = (kx: Knex) =>
    kx.schema.createTable('table_d', (table) => {
      table.increments('id1').notNullable();
      table.integer('id2').notNullable();
      table.unique(['id1', 'id2']);
    });

  const makeTableE = (kx: Knex) =>
    kx.schema.createTable('table_e', (table) => {
      table.increments('id').primary().notNullable();
      table.integer('table_d_ref_id1');
      table.integer('table_d_ref_id2');
    });

  const makeTableF = (kx: Knex) =>
    kx.schema.createTable('table_f', (table) => {
      table.increments('non_standard_id').primary().notNullable();
    });

  const makeTableG = (kx: Knex) =>
    kx.schema.createTable('table_g', (table) => {
      table.increments('id').primary().notNullable();
      table.integer('table_f_ref').notNullable();
    });

  const makeTableH = (kx: Knex) =>
    kx.schema.createTable('table_h', (table) => {
      table.uuid('id').primary().notNullable();
      table.text('foo_bar');
    });

  const makeTableI = (kx: Knex) =>
    kx.schema.createTable('table_i', (table) => {
      table.uuid('id').primary().notNullable();
      table.uuid('table_h_ref');
      table.foreign('table_h_ref').references('table_h.id');
      table.text('foo_bar');
    });

  anyDbTest('runs no seeds', async (kx) => {
    await resolveAllEntries([]).upsertAll(kx);
  });

  anyDbTest('runs a simple seed', async (kx) => {
    await makeTableA(kx);

    const { upsertAll } = resolveAllEntries([
      new SeedFile({
        synchronize: true,
        entities: [{ TableA: { $id: '{table}-1', fooBar: 'baz' } }],
      }),
    ]);

    await upsertAll(kx);

    await expect(kx('table_a')).resolves.toEqual([{ id: 1, foo_bar: 'baz' }]);
  });

  anyDbTest('upserts twice without issue', async (kx) => {
    await makeTableA(kx);

    const { entries, upsertAll } = resolveAllEntries([
      new SeedFile({
        synchronize: true,
        entities: [{ TableA: { $id: '{table}-1', fooBar: 'baz' } }],
      }),
    ]);

    expect(Array.from(entries().values()).map((e) => e.isCreated)).not.toContain(true);
    await upsertAll(kx);

    expect(Array.from(entries().values()).map((e) => e.isCreated)).not.toContain(false);
    await upsertAll(kx);

    expect(Array.from(entries().values()).map((e) => e.isCreated)).not.toContain(false);

    await expect(kx('table_a')).resolves.toEqual([{ id: 1, foo_bar: 'baz' }]);
  });

  anyDbTest('fails to upsert a seed when environment excludes it', async (kx) => {
    const { entries } = resolveAllEntries([
      new SeedFile({
        synchronize: true,
        $env: ['staging'],
        entities: [{ TableA: { $id: '{table}-1' } }],
      }),
    ]);

    await expect(entries().get('table_a-1')!.upsert(kx)).rejects.toThrow(InvalidSeedEntryCreation);
  });

  it('fails when two seed entries have the same $id', () => {
    const file = new SeedFile({
      synchronize: true,
      entities: [{ TableA: { $id: '1' } }, { TableA: { $id: '1' } }],
    });

    expect(() => resolveAllEntries([file])).toThrow(DuplicateID);
  });

  anyDbTest('fails to upsert if dependencies were unresolved', async (kx) => {
    const { entries } = new SeedFile({
      synchronize: true,
      entities: [{ TableA: { $id: '1', refA: { $id: 'ref-id' } } }],
    });

    await expect(entries[0].upsert(kx)).rejects.toThrow(UnresolvableID);
  });

  anyDbTest('uses $idColumnName for non "id" primary keys', async (kx, client) => {
    await makeTableC(kx);

    const guid = '12bea5e8-f872-4614-9653-8c52c513cd36';

    const {
      entries: [entry],
    } = new SeedFile({
      synchronize: true,
      entities: [{ TableC: { $id: '1', $idColumnName: 'guid', guid } }],
    });

    await entry.upsert(kx);
    await expect(kx('table_c')).resolves.toEqual([{ guid, foo_bar: null }]);

    switch (client) {
      case 'sqlite': {
        await expect(kx('germinator_seed_entry')).resolves.toMatchObject([
          {
            table_name: 'table_c',
            created_id_names: 'guid',
            created_ids: guid,
          },
        ]);

        break;
      }
      default: {
        await expect(kx('germinator_seed_entry')).resolves.toMatchObject([
          {
            table_name: 'table_c',
            created_id_names: ['guid'],
            created_ids: [guid],
          },
        ]);

        break;
      }
    }

    expect(entry.primaryID).toEqual(guid);

    const {
      entries: [entryUpdated],
    } = new SeedFile({
      synchronize: true,
      entities: [{ TableC: { $id: '1', $idColumnName: 'guid', guid, fooBar: 'baz' } }],
    });

    await entryUpdated.upsert(kx);
    await expect(kx('table_c')).resolves.toEqual([{ guid, foo_bar: 'baz' }]);
  });

  it('inserts composite ID when using sqlite', () =>
    withSqlite(async (kx) => {
      await makeTableA(kx);

      const { entries } = new SeedFile({
        synchronize: true,
        entities: [{ TableA: { $id: '1', $idColumnName: ['id', 'foo_bar'], fooBar: 'baz' } }],
      });

      await entries[0].upsert(kx);
      await expect(kx('table_a')).resolves.toEqual([{ id: 1, foo_bar: 'baz' }]);
      await expect(kx('germinator_seed_entry')).resolves.toMatchObject([
        {
          table_name: 'table_a',
          created_id_names: 'id,foo_bar',
          created_ids: '1,baz',
        },
      ]);

      expect(entries[0].primaryID).toEqual([1, 'baz']);
    }));

  anyDbTest('inserts entries with dependencies', async (kx) => {
    await makeTableA(kx);
    await makeTableB(kx);

    const { upsertAll } = resolveAllEntries([
      new SeedFile({
        synchronize: true,
        entities: [
          { TableA: { $id: '1', fooBar: 'baz' } },
          { TableB: { $id: '2', tableARef: { $id: '1' } } },
        ],
      }),
    ]);

    await upsertAll(kx);

    await expect(kx('table_a')).resolves.toEqual([{ id: 1, foo_bar: 'baz' }]);
    await expect(kx('table_b')).resolves.toEqual([{ id: 1, table_a_ref: 1 }]);
  });

  anyDbTest('inserts entries with complex dependencies', async (kx) => {
    await makeTableA(kx);
    await makeTableB(kx);

    const { upsertAll } = resolveAllEntries([
      new SeedFile({
        synchronize: true,
        entities: [
          { TableA: { $id: 'a1', fooBar: 'foo1' } },
          { TableA: { $id: 'a2', fooBar: 'foo2' } },
          { TableA: { $id: 'a3', fooBar: 'foo3' } },
          { TableA: { $id: 'a4', fooBar: 'foo4' } },
          { TableA: { $id: 'a5', fooBar: 'foo5' } },
          { TableB: { $id: 'b1', tableARef: { $id: 'a1' } } },
          { TableB: { $id: 'b2', tableARef: { $id: 'a1' } } },
          { TableB: { $id: 'b3', tableARef: { $id: 'a2' } } },
          { TableB: { $id: 'b4', tableARef: { $id: 'a5' } } },
        ],
      }),
    ]);

    await upsertAll(kx);

    await expect(kx('table_a')).resolves.toMatchObject([
      { foo_bar: 'foo1' },
      { foo_bar: 'foo2' },
      { foo_bar: 'foo3' },
      { foo_bar: 'foo4' },
      { foo_bar: 'foo5' },
    ]);

    await expect(kx('table_b')).resolves.toMatchObject([
      { table_a_ref: 1 },
      { table_a_ref: 1 },
      { table_a_ref: 2 },
      { table_a_ref: 5 },
    ]);
  });

  anyDbTest('references a table with composite primary key', async (kx) => {
    await makeTableD(kx);
    await makeTableE(kx);

    const { upsertAll } = resolveAllEntries([
      new SeedFile({
        synchronize: true,
        entities: [
          { TableD: { $id: 'd1', $idColumnName: ['id1', 'id2'], id2: 200 } },
          { TableD: { $id: 'd2', $idColumnName: ['id1', 'id2'], id2: 201 } },
          {
            TableE: {
              $id: 'e1',
              table_d_ref_id1: { $id: 'd2', $idColumn: 'id1' },
              table_d_ref_id2: 201,
            },
          },
        ],
      }),
    ]);

    await upsertAll(kx);

    await expect(kx('table_d')).resolves.toMatchObject([
      { id1: 1, id2: 200 },
      { id1: 2, id2: 201 },
    ]);

    await expect(kx('table_e')).resolves.toMatchObject([
      { table_d_ref_id1: 2, table_d_ref_id2: 201 },
    ]);
  });

  anyDbTest('fails when composite key is ambiguous', async (kx) => {
    await makeTableD(kx);
    await makeTableE(kx);

    const { upsertAll } = resolveAllEntries([
      new SeedFile({
        synchronize: true,
        entities: [
          { TableD: { $id: 'd1', $idColumnName: ['id1', 'id2'], id2: 200 } },
          { TableD: { $id: 'd2', $idColumnName: ['id1', 'id2'], id2: 201 } },
          {
            TableE: {
              $id: 'e1',
              table_d_ref_id1: { $id: 'd2' },
              table_d_ref_id2: 201,
            },
          },
        ],
      }),
    ]);

    await expect(upsertAll(kx)).rejects.toThrow(InvalidSeedEntryCreation);
  });

  anyDbTest('updates a seed entry when using synchronize', async (kx) => {
    await makeTableA(kx);

    const { upsertAll: upsert1 } = resolveAllEntries([
      new SeedFile({
        synchronize: true,
        entities: [{ TableA: { $id: '1', fooBar: 'baz' } }],
      }),
    ]);

    await upsert1(kx);
    await expect(kx('table_a')).resolves.toEqual([{ id: 1, foo_bar: 'baz' }]);

    const { upsertAll: upsert2 } = resolveAllEntries([
      new SeedFile({
        synchronize: true,
        entities: [{ TableA: { $id: '1', fooBar: 'qux' } }],
      }),
    ]);

    await upsert2(kx);
    await expect(kx('table_a')).resolves.toEqual([{ id: 1, foo_bar: 'qux' }]);
  });

  anyDbTest('deletes entry that no longer exists', async (kx) => {
    await makeTableA(kx);

    const { synchronize: sync1 } = resolveAllEntries([
      new SeedFile({
        synchronize: true,
        entities: [{ TableA: { $id: '1', fooBar: 'baz' } }],
      }),
    ]);

    await sync1(kx);
    await expect(kx('table_a')).resolves.toEqual([{ id: 1, foo_bar: 'baz' }]);

    const { synchronize: sync2 } = resolveAllEntries([
      new SeedFile({ synchronize: true, entities: [] }),
    ]);

    await sync2(kx);
    await expect(kx('table_a')).resolves.toEqual([]);
  });

  anyDbTest('fails when updating a record that no longer exists', async (kx) => {
    await makeTableA(kx);

    const { synchronize: sync1 } = resolveAllEntries([
      new SeedFile({
        synchronize: true,
        entities: [{ TableA: { $id: '1', fooBar: 'baz' } }],
      }),
    ]);

    await sync1(kx);

    // remove it, outside of germinator's scope
    await kx('table_a').delete();

    const { synchronize: sync2 } = resolveAllEntries([
      new SeedFile({
        synchronize: true,
        entities: [{ TableA: { $id: '1', fooBar: 'qux' } }],
      }),
    ]);

    await expect(sync2(kx)).rejects.toThrow(UpdateOfDeletedEntry);
  });

  anyDbTest('marks entry as non-synchronize even if it was previously', async (kx, client) => {
    await makeTableA(kx);

    const { synchronize: sync1 } = resolveAllEntries([
      new SeedFile({
        synchronize: true,
        entities: [{ TableA: { $id: '1', fooBar: 'baz' } }],
      }),
    ]);

    await sync1(kx);

    switch (client) {
      case 'sqlite': {
        await expect(kx('germinator_seed_entry')).resolves.toMatchObject([
          {
            synchronize: 1,
            table_name: 'table_a',
            created_id_names: 'id',
            created_ids: '1',
          },
        ]);

        break;
      }
      default: {
        await expect(kx('germinator_seed_entry')).resolves.toMatchObject([
          {
            synchronize: true,
            table_name: 'table_a',
            created_id_names: ['id'],
            created_ids: ['1'],
          },
        ]);

        break;
      }
    }

    const { synchronize: sync2 } = resolveAllEntries([
      new SeedFile({
        synchronize: false,
        entities: [{ TableA: { $id: '1', fooBar: 'baz' } }],
      }),
    ]);

    await sync2(kx);

    switch (client) {
      case 'sqlite': {
        await expect(kx('germinator_seed_entry')).resolves.toMatchObject([
          {
            synchronize: 0,
            table_name: 'table_a',
            created_id_names: 'id',
            created_ids: '1',
          },
        ]);

        break;
      }
      default: {
        await expect(kx('germinator_seed_entry')).resolves.toMatchObject([
          {
            synchronize: false,
            table_name: 'table_a',
            created_id_names: ['id'],
            created_ids: ['1'],
          },
        ]);

        break;
      }
    }
  });

  anyDbTest('uses tableMapping', async (kx) => {
    await makeTableA(kx);

    const { upsertAll } = resolveAllEntries([
      new SeedFile({
        synchronize: true,
        tables: {
          Nickname: 'table_a',
        },
        entities: [{ Nickname: { $id: '1', fooBar: 'baz' } }],
      }),
    ]);

    await upsertAll(kx);
    await expect(kx('table_a')).resolves.toEqual([{ id: 1, foo_bar: 'baz' }]);
  });

  anyDbTest('uses a non-standard ID lookup', async (kx) => {
    await makeTableF(kx);
    await makeTableG(kx);

    const { upsertAll } = resolveAllEntries([
      new SeedFile({
        synchronize: true,
        entities: [
          { TableF: { $id: '1', $idColumnName: 'non_standard_id' } },
          { TableG: { $id: '2', table_f_ref: { $id: '1' } } },
        ],
      }),
    ]);

    await upsertAll(kx);
  });

  anyDbTest('uses a GUID primary key', async (kx) => {
    await makeTableH(kx);
    await makeTableI(kx);

    const { upsertAll } = resolveAllEntries([
      new SeedFile({
        synchronize: true,
        entities: [
          { TableH: { $id: '1', id: '558b7c18-d627-4dc2-9825-f20e33eef5e0' } },
          {
            TableI: {
              $id: '2',
              id: '369ff169-1c9c-4b6d-912a-ae6975f2a9ba',
              tableHRef: { $id: '1' },
              fooBar: '-',
            },
          },
        ],
      }),
    ]);

    await upsertAll(kx);
    await expect(kx('table_i')).resolves.toEqual([
      {
        id: '369ff169-1c9c-4b6d-912a-ae6975f2a9ba',
        table_h_ref: '558b7c18-d627-4dc2-9825-f20e33eef5e0',
        foo_bar: '-',
      },
    ]);

    const { upsertAll: upsertUpdate } = resolveAllEntries([
      new SeedFile({
        synchronize: true,
        entities: [
          { TableH: { $id: '1', id: '558b7c18-d627-4dc2-9825-f20e33eef5e0' } },
          {
            TableI: {
              $id: '2',
              id: '369ff169-1c9c-4b6d-912a-ae6975f2a9ba',
              tableHRef: { $id: '1' },
              fooBar: null,
            },
          },
        ],
      }),
    ]);

    await upsertUpdate(kx);
    await expect(kx('table_i')).resolves.toEqual([
      {
        id: '369ff169-1c9c-4b6d-912a-ae6975f2a9ba',
        table_h_ref: '558b7c18-d627-4dc2-9825-f20e33eef5e0',
        foo_bar: null,
      },
    ]);
  });
});

describe('Dry Run', () => {
  it('doesnt perform any inserts', () =>
    withSqlite(async (kx) => {
      const options = { dryRun: true };
      const log = jest.fn();
      console.log = log; // eslint-disable-line no-console

      const { upsertAll } = resolveAllEntries(
        [
          new SeedFile(
            {
              synchronize: true,
              entities: [{ TableA: { $id: 'a1' } }, { TableB: { $id: 'b1' } }],
            },
            options,
          ),
        ],
        options,
      );

      try {
        await upsertAll(kx);
      } finally {
        expect(log).toHaveBeenCalledTimes(2);
        log.mockRestore();
      }
    }));
});
