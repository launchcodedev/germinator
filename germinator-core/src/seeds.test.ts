import { SeedEntry, SeedFile, NamingStrategies, resolveAllEntries } from './seeds';
import { withSqlite } from './test-util';

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
  it('runs no seeds', () =>
    withSqlite(async (kx) => {
      await resolveAllEntries([]).upsertAll(kx);
    }));
});
