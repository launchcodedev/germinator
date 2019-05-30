import { createLogger } from '@servall/logger';
import { runSeeds, Seed } from './index';
import { loadFileContents } from './seed';
import { dbConnect } from './database';

createLogger({ stdout: false, silent: true });

const inMemDb = async () => {
  const db = await dbConnect({
    filename: ':memory:',
  });

  await db.migrate.latest();

  return db;
};

describe('seed', () => {
  test('seed creation', () => {
    expect(() => new Seed('named', {})).toThrow();
    expect(() => new Seed('named', { entities: [] })).toThrow();
    expect(() => new Seed('named', { germinator: 'v1', entities: [] })).toThrow();
    expect(() => new Seed('named', { germinator: 'v2', entities: [] })).not.toThrow();
  });

  test('seed properties', () => {
    const seed = new Seed('named', {
      germinator: 'v2',
      entities: [
        { Named: { $id: '1' } },
        { Named: { $id: '2' } },
        { Named: { $id: '3' } },
        { NickNamed: { $id: '4', prop: 1 } },
      ],
    });

    expect(seed.entries[0].$id).toBe('1');
    expect(seed.entries[1].$id).toBe('2');
    expect(seed.entries[2].$id).toBe('3');

    expect(seed.entries[0].tableName).toBe('named');
    expect(seed.entries[0].props).toEqual({});
    expect(seed.entries[0].dependencies).toEqual([]);

    expect(seed.entries[3].props).toEqual({ prop: 1 });
  });

  test('entity schema', () => {
    expect(() => new Seed('named', {
      germinator: 'v2',
      entities: [
        { Named: {} },
      ],
    })).toThrow();

    expect(() => new Seed('named', {
      germinator: 'v2',
      entities: [
        { Named: { $id: '1' }, NickNamed: { $id: '2' } },
      ],
    })).toThrow();

    expect(() => new Seed('named', {
      germinator: 'v2',
      entities: [
        { Named: { $id: '1' } },
      ],
    })).not.toThrow();
  });

  test('naming strategy', () => {
    const asis = new Seed('named', {
      germinator: 'v2',
      namingStrategy: 'AsIs',
      entities: [
        { NickNamed: { $id: '1' } },
      ],
    });

    expect(asis.entries[0].tableName).toBe('NickNamed');

    const snake = new Seed('named', {
      germinator: 'v2',
      namingStrategy: 'SnakeCase',
      entities: [
        { NickNamed: { $id: '1' } },
      ],
    });

    expect(snake.entries[0].tableName).toBe('nick_named');

    expect(() => new Seed('named', {
      germinator: 'v2',
      namingStrategy: 'Invalid',
      entities: [],
    })).toThrow();
  });

  test('prop template', () => {
    const seed = new Seed('named', {
      germinator: 'v2',
      entities: [
        {
          NickNamed: {
            $id: '{tableName}-1',
            propA: '{tableName}',
            propB: '{idColumnName}',
            propC: '{rawHash}',
          }
        },
      ],
    });

    expect(seed.entries[0].$id).toBe('nick_named-1');
    expect(seed.entries[0].props.prop_a).toBe('nick_named');
    expect(seed.entries[0].props.prop_b).toBe('id');
    expect(seed.entries[0].props.prop_c).not.toBe('{{rawHash}}');
  });

  test('yaml templating', () => {
    const seed =  loadFileContents('filename.yaml', `
      germinator: v2
      entities:
        - Person:
            $id: '{tableName}-1'
            name: '{{faker "name.firstName"}} {rawHash}'
            email: {{faker "internet.email"}}
    `);

    expect(seed.entries.length).toBe(1);
    expect(seed.entries[0].$id).toBe('person-1');
    expect(seed.entries[0].props.name).toMatch(/\w+ \w+/);
    expect(seed.entries[0].props.email).toMatch(/@/);
  });

  test('repeat', () => {
    const seed =  loadFileContents('filename.yaml', `
      germinator: v2
      entities:
        {{#repeat 10}}
        - Person:
            $id: '{tableName}-{{@index}}'
        {{/repeat}}
    `);

    expect(seed.entries.length).toBe(10);
  });

  test('password', () => {
    const seed =  loadFileContents('filename.yaml', `
      germinator: v2
      entities:
        - Person:
            $id: '{tableName}-1'
            password: {{password "pwd"}}
            password2: {{password "pwd" rounds=1}}
    `);

    expect(seed.entries.length).toBe(1);
    expect(seed.entries[0].props.password).toMatch(/\w+/);
    expect(seed.entries[0].props.password2).toMatch(/\w+/);
  });
});

describe('resolving', () => {
});

describe('creating', () => {
  test('basic no props', async () => {
    const db = await inMemDb();

    await db.schema.createTable('named', (table) => {
      table.increments('id').primary();
    });

    const seed = new Seed('named', {
      germinator: 'v2',
      entities: [
        { Named: { $id: '1' } },
      ],
    });

    const created = await seed.entries[0].create(db);

    expect((created as any /* private */).id).toBe(1);
    expect(await db.raw('select * from named')).toEqual([{ id: 1 }]);

    // verify that creating twice only inserts once
    await seed.entries[0].create(db);
    expect(await db.raw('select * from named')).toEqual([{ id: 1 }]);
  });

  test('double insert with same properties', async () => {
    const db = await inMemDb();

    await db.schema.createTable('named', (table) => {
      table.increments('id').primary();
      table.text('col');
    });

    const seed = new Seed('named', {
      germinator: 'v2',
      entities: [
        { Named: { $id: '1', col: 'str' } },
      ],
    });

    const seed2 = new Seed('named', {
      germinator: 'v2',
      entities: [
        { Named: { $id: '1', col: 'str' } },
      ],
    });

    await seed.entries[0].create(db);
    await seed2.entries[0].create(db);
  });

  test('double insert with different properties', async () => {
    const db = await inMemDb();

    await db.schema.createTable('named', (table) => {
      table.increments('id').primary();
      table.text('col');
    });

    const seed = new Seed('named', {
      germinator: 'v2',
      entities: [
        { Named: { $id: '1', col: 'str' } },
      ],
    });

    // running twice is fine
    await seed.entries[0].create(db);
    await seed.entries[0].create(db);

    const seed2 = new Seed('named', {
      germinator: 'v2',
      entities: [
        { Named: { $id: '1', col: 'changed' } },
      ],
    });

    // running with changed content should fail
    await expect(seed2.entries[0].create(db)).rejects.toThrow();
  });
});

describe('migrations', () => {
  test('up', async () => {
    await expect(inMemDb()).resolves.toBeTruthy();
  });

  test('down', async () => {
    const db = await inMemDb();

    await expect(db.migrate.rollback({}, true)).resolves.toBeTruthy();
  });
});
