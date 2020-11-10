import { NamingStrategies } from './seed';
import { SeedEntry, UpdateDeletedEntry } from './seed-entry';
import { Environment } from './environment';
import { testWithDb } from './database.test';

describe('seed entry', () => {
  test('basic', async () => {
    const entry = new SeedEntry(
      {
        Named: {
          $id: '1',
          $idColumnName: 'id',
        },
      },
      {
        synchronize: true,
        namingStrategy: NamingStrategies.SnakeCase,
        tableMapping: {},
      },
    );

    expect(entry.props).toEqual({});
    expect(entry.tableName).toEqual('named');
  });

  test('nested json', async () => {
    const entry = new SeedEntry(
      {
        Named: {
          $id: '1',
          $idColumnName: 'id',
          fooNone: {
            barNone: 1,
          },
        },
      },
      {
        synchronize: true,
        namingStrategy: NamingStrategies.SnakeCase,
        tableMapping: {},
      },
    );

    expect(entry.props).toEqual({ foo_none: { barNone: 1 } });
  });

  test('invalid', () => {
    expect(
      () =>
        new SeedEntry(
          {},
          {
            synchronize: true,
            namingStrategy: NamingStrategies.SnakeCase,
            tableMapping: {},
          },
        ),
    ).toThrow();

    expect(
      () =>
        new SeedEntry(
          {
            Foo: { $id: '1', $idColumnName: 'id' },
            Bar: { $id: '2', $idColumnName: 'id' },
          },
          {
            synchronize: true,
            namingStrategy: NamingStrategies.SnakeCase,
            tableMapping: {},
          },
        ),
    ).toThrow();
  });

  test('date prop', () => {
    const entry = new SeedEntry(
      {
        Named: {
          $id: '1',
          $idColumnName: 'id',
          prop: new Date('2019-01-15') as any,
        },
      },
      {
        synchronize: true,
        namingStrategy: NamingStrategies.SnakeCase,
        tableMapping: {},
      },
    );

    expect(entry.props.prop).toEqual(new Date('2019-01-15').toISOString());
  });

  test('synchronize override', () => {
    const entry = new SeedEntry(
      {
        Named: {
          $id: '1',
          $synchronize: false,
        },
      },
      {
        synchronize: true,
        namingStrategy: NamingStrategies.SnakeCase,
        tableMapping: {},
      },
    );

    expect(entry.synchronize).toBe(false);
  });

  testWithDb('create', async db => {
    try {
      await db.raw('drop table table_name');
    } catch (_) {
      // this just cleans up previous test runs locally
    }

    await db.raw('create table table_name (id serial)');

    const entry = new SeedEntry(
      {
        TableName: {
          $id: '1',
          $idColumnName: 'id',
        },
      },
      {
        synchronize: true,
        namingStrategy: NamingStrategies.SnakeCase,
        tableMapping: {},
      },
    );

    expect(entry.createdId).toBe(undefined);

    entry.resolve(new Map());
    await entry.create(db);

    expect(entry.createdId).toBe(1);

    await db.raw('drop table table_name');
  });

  test('should create', () => {
    const development = new SeedEntry(
      {
        Named: { $id: '1' },
      },
      {
        synchronize: true,
        namingStrategy: NamingStrategies.SnakeCase,
        tableMapping: {},
        environment: Environment.Development,
      },
    );

    const qa = new SeedEntry(
      {
        Named: { $id: '1' },
      },
      {
        synchronize: true,
        namingStrategy: NamingStrategies.SnakeCase,
        tableMapping: {},
        environment: Environment.QA,
      },
    );

    const test = new SeedEntry(
      {
        Named: { $id: '1' },
      },
      {
        synchronize: true,
        namingStrategy: NamingStrategies.SnakeCase,
        tableMapping: {},
        environment: Environment.Test,
      },
    );

    const staging = new SeedEntry(
      {
        Named: { $id: '1' },
      },
      {
        synchronize: true,
        namingStrategy: NamingStrategies.SnakeCase,
        tableMapping: {},
        environment: Environment.Staging,
      },
    );

    const none = new SeedEntry(
      {
        Named: { $id: '1' },
      },
      {
        synchronize: true,
        namingStrategy: NamingStrategies.SnakeCase,
        tableMapping: {},
      },
    );

    expect(development.shouldCreate).toBe(false);
    expect(qa.shouldCreate).toBe(false);
    expect(test.shouldCreate).toBe(true);
    expect(staging.shouldCreate).toBe(false);
    expect(none.shouldCreate).toBe(true);

    process.env.NODE_ENV = 'dev';
    expect(development.shouldCreate).toBe(true);
  });

  testWithDb('update a deleted entry', async db => {
    try {
      await db.raw('drop table testing_1');
    } catch (_) {
      // this just cleans up previous test runs locally
    }

    await db.raw('create table testing_1 (id integer primary key, value text)');

    await new SeedEntry(
      {
        Testing_1: {
          $id: '1',
          $idColumnName: 'id',
          value: 'foobar',
        },
      },
      {
        synchronize: true,
        namingStrategy: NamingStrategies.SnakeCase,
        tableMapping: {},
      },
    ).create(db);

    await db.delete().from('testing_1');

    await expect(
      new SeedEntry(
        {
          Testing_1: {
            $id: '1',
            $idColumnName: 'id',
            value: 'barfoo',
          },
        },
        {
          synchronize: true,
          namingStrategy: NamingStrategies.SnakeCase,
          tableMapping: {},
        },
      ).create(db),
    ).rejects.toBeInstanceOf(UpdateDeletedEntry);

    await db.raw('drop table testing_1');
  });
});
