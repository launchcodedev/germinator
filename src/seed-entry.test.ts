import {
  NamingStrategies,
} from './seed';
import { SeedEntry } from './seed-entry';
import { testWithDb } from './database.test';

describe('seed entry', () => {
  test('basic', async () => {
    const entry = new SeedEntry({
      Named: {
        $id: '1',
        $idColumnName: 'id',
      },
    }, {
      synchronize: true,
      namingStrategy: NamingStrategies.SnakeCase,
      tableMapping: {},
    });

    expect(entry.props).toEqual({});
    expect(entry.tableName).toEqual('named');
  });

  test('invalid', () => {
    expect(() => new SeedEntry({}, {
      synchronize: true, namingStrategy: NamingStrategies.SnakeCase, tableMapping: {},
    })).toThrow();

    expect(() => new SeedEntry({
      Foo: { $id: '1', $idColumnName: 'id' },
      Bar: { $id: '2', $idColumnName: 'id' },
    }, {
      synchronize: true, namingStrategy: NamingStrategies.SnakeCase, tableMapping: {},
    })).toThrow();
  });

  testWithDb('create', async (db) => {
    try { await db.raw('drop table table_name'); } catch (_) {}
    await db.raw('create table table_name (id serial)');

    const entry = new SeedEntry({
      TableName: {
        $id: '1',
        $idColumnName: 'id',
      },
    }, {
      synchronize: true,
      namingStrategy: NamingStrategies.SnakeCase,
      tableMapping: {},
    });

    expect(entry.createdId).toBe(undefined);

    entry.resolve(new Map());
    await entry.create(db);

    expect(entry.createdId).toBe(1);

    await db.raw('drop table table_name');
  });
});
