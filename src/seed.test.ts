import { Seed, loadRawFile } from './seed';
import { testWithDb, testWithSqlite } from './database.test';

const fakeSeed = (entities: any[], synchronize = true) => {
  return new Seed('named', { germinator: 'v2', synchronize, entities });
};

describe('seed', () => {
  test('seed creation', () => {
    expect(() => new Seed('named', {})).toThrow();
    expect(() => new Seed('named', { entities: [] })).toThrow();
    expect(() => new Seed('named', { germinator: 'v1', entities: [] })).toThrow();
    expect(
      () => new Seed('named', { germinator: 'v1', synchronize: true, entities: [] }),
    ).toThrow();
    expect(
      () => new Seed('named', { germinator: 'v2', synchronize: true, entities: [] }),
    ).not.toThrow();
  });

  test('seed properties', () => {
    const seed = fakeSeed([
      { Named: { $id: '1' } },
      { Named: { $id: '2' } },
      { Named: { $id: '3' } },
      { NickNamed: { $id: '4', prop: 1 } },
    ]);

    expect(seed.entries[0].$id).toBe('1');
    expect(seed.entries[1].$id).toBe('2');
    expect(seed.entries[2].$id).toBe('3');

    expect(seed.entries[0].tableName).toBe('named');
    expect(seed.entries[0].props).toEqual({});
    expect(seed.entries[0].dependencies).toEqual([]);

    expect(seed.entries[3].props).toEqual({ prop: 1 });
  });

  test('entity schema', () => {
    expect(() => fakeSeed([{ Named: {} }])).toThrow();

    expect(() => fakeSeed([{ Named: { $id: '1' }, NickNamed: { $id: '2' } }])).toThrow();

    expect(() => fakeSeed([{ Named: { $id: '1' } }])).not.toThrow();
  });

  test('naming strategy', () => {
    const asis = new Seed('named', {
      germinator: 'v2',
      synchronize: true,
      namingStrategy: 'AsIs',
      entities: [{ NickNamed: { $id: '1' } }],
    });

    expect(asis.entries[0].tableName).toBe('NickNamed');

    const snake = new Seed('named', {
      germinator: 'v2',
      synchronize: true,
      namingStrategy: 'SnakeCase',
      entities: [{ NickNamed: { $id: '1' } }],
    });

    expect(snake.entries[0].tableName).toBe('nick_named');

    expect(
      () =>
        new Seed('named', {
          germinator: 'v2',
          synchronize: true,
          namingStrategy: 'Invalid',
          entities: [],
        }),
    ).toThrow();
  });

  test('table name mapping', () => {
    const seed = new Seed('named', {
      germinator: 'v2',
      synchronize: true,
      tables: {
        NickNamed: 'nick_name_table',
      },
      entities: [{ NickNamed: { $id: '1' } }],
    });

    expect(seed.entries[0].tableName).toBe('nick_name_table');
  });

  test('schema name', () => {
    const seed = new Seed('named', {
      germinator: 'v2',
      synchronize: true,
      schemaName: 'test',
      entities: [{ NickNamed: { $id: '1' } }],
    });

    expect(seed.entries[0].schemaName).toBe('test');
  });

  test('prop template', () => {
    const seed = new Seed('named', {
      germinator: 'v2',
      synchronize: true,
      entities: [
        {
          NickNamed: {
            $id: '{tableName}-1',
            propA: '{tableName}',
            propB: '{idColumnName}',
          },
        },
      ],
    });

    expect(seed.entries[0].$id).toBe('nick_named-1');
    expect(seed.entries[0].props.prop_a).toBe('nick_named');
    expect(seed.entries[0].props.prop_b).toBe('id');
  });

  test('yaml templating', () => {
    const seed = loadRawFile(
      'filename.yaml',
      `
      germinator: v2
      synchronize: true
      entities:
        - Person:
            $id: '{tableName}-1'
            name: '{{faker "name.firstName"}}'
            email: {{faker "internet.email"}}
    `,
    );

    expect(seed.entries.length).toBe(1);
    expect(seed.entries[0].$id).toBe('person-1');
    expect(seed.entries[0].props.name).toMatch(/^\w+$/);
    expect(seed.entries[0].props.email).toMatch(/@/);
    expect(seed.entries[0].props.email).not.toMatch(/objectObject/);
  });

  test('repeat', () => {
    const seed = loadRawFile(
      'filename.yaml',
      `
      germinator: v2
      synchronize: true
      entities:
        {{#repeat 10}}
        - Person:
            $id: '{tableName}-{{@index}}'
        {{/repeat}}
    `,
    );

    expect(seed.entries.length).toBe(10);
  });

  test('handlebar helpers', () => {
    const seed = loadRawFile(
      'filename.yaml',
      `
      germinator: v2
      synchronize: true
      entities:
        - Person:
            $id: '1'
            birthyear: {{year}}
    `,
    );

    expect(seed.entries.length).toBe(1);
    expect(seed.entries[0].props.birthyear).toBeGreaterThanOrEqual(2019);
  });

  test('faker seed', () => {
    const seed = loadRawFile(
      'filename.yaml',
      `
      germinator: v2
      synchronize: true
      fakerSeed: 12
      ---
      entities:
        - Person:
            $id: '1'
            birthyear: {{faker "random.number"}}
    `,
    );

    expect(seed.entries.length).toBe(1);
    expect(seed.entries[0].props.birthyear).toBe(15416);
  });

  test('faker arguments', () => {
    const seed = loadRawFile(
      'filename.yaml',
      `
      germinator: v2
      synchronize: true
      ---
      entities:
        - Person:
            $id: '1'
            birthyear: {{faker "random.number" min=2000 max=2000}}
    `,
    );

    expect(seed.entries.length).toBe(1);
    expect(seed.entries[0].props.birthyear).toBe(2000);
  });

  test('password', () => {
    const seed = loadRawFile(
      'filename.yaml',
      `
      germinator: v2
      synchronize: true
      entities:
        - Person:
            $id: '{tableName}-1'
            password: {{password "pwd"}}
            password2: {{password "pwd" rounds=1}}
    `,
    );

    expect(seed.entries.length).toBe(1);
    expect(seed.entries[0].props.password).toMatch(/\w+/);
    expect(seed.entries[0].props.password2).toMatch(/\w+/);
  });

  test('template data', () => {
    const seed = loadRawFile(
      'filename.yaml',
      `
      germinator: v2
      synchronize: true
      data:
        foo: 'bar'

      ---
      entities:
        - Person:
            $id: 'id'
            foo: {{foo}}
    `,
    );

    expect(seed.entries.length).toBe(1);
    expect(seed.entries[0].props.foo).toBe('bar');
  });
});

describe('resolving', () => {
  test('basic', () => {
    const seed = fakeSeed([
      { Parent: { $id: '1' } },
      { Child: { $id: '2', parentId: { $id: '1' } } },
    ]);

    const entries = Seed.resolveAllEntries([seed]).entries();
    expect(entries.get('2')!.props.parent_id).toBe(entries.get('1'));
  });

  test('unable to resolve', () => {
    const seed = fakeSeed([{ Child: { $id: '1', parentId: { $id: '2' } } }]);

    expect(() => Seed.resolveAllEntries([seed])).toThrow();
  });

  test('duplicate id', () => {
    const seed = fakeSeed([{ Child: { $id: '1' } }, { Child: { $id: '1' } }]);

    expect(() => Seed.resolveAllEntries([seed])).toThrow();
  });
});

describe('creating', () => {
  testWithSqlite('basic no props', async db => {
    await db.schema.createTable('named', table => {
      table.increments('id').primary();
    });

    const seed = new Seed('named', {
      germinator: 'v2',
      synchronize: true,
      entities: [{ Named: { $id: '1' } }],
    });

    const resolved = Seed.resolveAllEntries([seed]);

    // run twice to trigger caching
    await resolved.createAll(db);

    const created = await resolved.createAll(db);

    expect(created.get('1')!.createdId).toBe(1);
    expect(await db.raw('select * from named')).toEqual([{ id: 1 }]);

    // verify that creating twice only inserts once
    await seed.entries[0].create(db);
    expect(await db.raw('select * from named')).toEqual([{ id: 1 }]);
  });

  testWithSqlite('double insert with same properties', async db => {
    await db.schema.createTable('named', table => {
      table.increments('id').primary();
      table.text('col');
    });

    const seed = new Seed('named', {
      germinator: 'v2',
      synchronize: true,
      entities: [{ Named: { $id: '1', col: 'str' } }],
    });

    const seed2 = new Seed('named', {
      germinator: 'v2',
      synchronize: true,
      entities: [{ Named: { $id: '1', col: 'str' } }],
    });

    await seed.entries[0].create(db);
    await seed2.entries[0].create(db);
  });

  testWithSqlite('double insert synchronize', async db => {
    await db.schema.createTable('named', table => {
      table.increments('id').primary();
      table.text('col');
    });

    const seed = fakeSeed([
      { Named: { $id: '1', col: 'str' } },
      { Named: { $id: '2', col: 'str' } },
    ]);

    expect(seed.entries[0].isCreated).toBe(false);

    const entry = await seed.entries[0].create(db);
    await seed.entries[1].create(db);

    expect(entry.isCreated).toBe(true);

    const seed2 = fakeSeed([{ Named: { $id: '1', col: 'changed' } }]);

    const entry2 = await seed2.entries[0].create(db);

    expect(entry2.isCreated).toBe(true);
    expect(entry2.createdId).toBe(entry.createdId);
    expect(entry2.props.col).toBe('changed');

    const records = await db.raw('select col from named order by id');
    expect(records).toEqual([{ col: 'changed' }, { col: 'str' }]);
  });
});

describe('synchronize', () => {
  testWithSqlite('basic', async db => {
    await db.schema.createTable('named', table => {
      table.increments('id').primary();
      table.text('col');
    });

    const seed = fakeSeed(
      [{ Named: { $id: '1', col: 'str' } }, { Named: { $id: '2', col: 'str' } }],
      true,
    );

    await Seed.resolveAllEntries([seed]).synchronize(db);

    expect(await db.raw('select * from named')).toEqual([
      { id: 1, col: 'str' },
      { id: 2, col: 'str' },
    ]);

    const seed2 = fakeSeed([{ Named: { $id: '2', col: 'str' } }], true);

    await Seed.resolveAllEntries([seed2]).synchronize(db);

    // only id 2 is left, 1 has been deleted
    expect(await db.raw('select * from named')).toEqual([{ id: 2, col: 'str' }]);
  });

  testWithDb('delete order', async db => {
    await db.schema.createTable('parent', table => {
      table.increments('id').primary();
    });

    await db.schema.createTable('child', table => {
      table.increments('id').primary();
      table.integer('parent_id').notNullable();
      table.foreign('parent_id').references('parent.id');
    });

    const seed = fakeSeed(
      [
        { Parent: { $id: 'parent-1' } },
        { Child: { $id: 'child-1', parentId: { $id: 'parent-1' } } },
        { Child: { $id: 'child-2', parentId: { $id: 'parent-1' } } },
      ],
      true,
    );

    await Seed.resolveAllEntries([seed]).synchronize(db);

    const seed2 = fakeSeed([], true);

    await Seed.resolveAllEntries([seed2]).synchronize(db);
  });
});

describe('environment', () => {
  test('invalid env', () => {
    expect(
      () =>
        new Seed('named', {
          germinator: 'v2',
          synchronize: true,
          entities: [],
          $env: 'invalid',
        }),
    ).toThrow();
  });

  test('synchronize per env on', () => {
    process.env.NODE_ENV = 'development';

    const seed = loadRawFile(
      'filename.yaml',
      `
      germinator: v2
      synchronize: ['dev', 'qa']

      ---
      entities:
        - Person:
            $id: id
            foo: bar
    `,
    );

    expect(seed.entries.length).toBe(1);
    expect(seed.entries[0].props.foo).toBe('bar');
    expect(seed.entries[0].synchronize).toBe(true);
  });

  test('synchronize per env off', () => {
    process.env.NODE_ENV = 'staging';

    const seed = loadRawFile(
      'filename.yaml',
      `
      germinator: v2
      synchronize: ['dev', 'qa']

      ---
      entities:
        - Person:
            $id: id
            foo: bar
    `,
    );

    expect(seed.entries.length).toBe(1);
    expect(seed.entries[0].props.foo).toBe('bar');
    expect(seed.entries[0].synchronize).toBe(false);
  });
});
