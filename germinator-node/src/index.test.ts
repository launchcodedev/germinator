import Knex from 'knex';
import { SeedFile } from '@germinator/core';
import { loadFile, loadFiles, runSeeds } from './index';
import { withTempFiles } from './test-util';

describe('loadFile', () => {
  it('loads an empty seed file', () =>
    withTempFiles(
      {
        'seed-a.yml': `
          germinator: v2
          synchronize: false
          entities: []
        `,
      },
      async (inDir) => {
        const file = await loadFile(inDir('seed-a.yml'), {});

        expect(file.entries).toHaveLength(0);
      },
    ));
});

describe('loadFiles', () => {
  it('loads all files in a folder', () =>
    withTempFiles(
      {
        'seed-a.yml': `
          germinator: v2
          synchronize: false
          entities: []
        `,
        'seed-b.yml': `
          germinator: v2
          synchronize: false
          entities: []
        `,
      },
      async (inDir) => {
        const files = await loadFiles(inDir('.'), {});

        expect(files).toHaveLength(2);
        expect(files[0].entries).toHaveLength(0);
        expect(files[1].entries).toHaveLength(0);
      },
    ));
});

describe('runSeeds', () => {
  it('uses a knex connection', async () => {
    const kx = Knex({
      client: 'sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });

    const file = new SeedFile({
      synchronize: true,
      entities: [
        {
          TableA: {
            $id: '{table}-1',
            fooBar: 'baz',
          },
        },
      ],
    });

    try {
      await kx.schema.createTable('table_a', (table) => {
        table.increments('id').primary().notNullable();
        table.text('foo_bar').notNullable();
      });

      await runSeeds({ db: kx, seeds: [file], helpers: {} });

      await expect(kx('table_a')).resolves.toEqual([{ id: 1, foo_bar: 'baz' }]);
    } finally {
      await kx.destroy();
    }
  });

  it('loads knex using config object', async () => {
    await runSeeds({
      db: {
        client: 'sqlite3',
        connection: { filename: ':memory:' },
        useNullAsDefault: true,
      },
      seeds: [],
      helpers: {},
    });
  });

  it('loads seeds from files', async () =>
    withTempFiles(
      {
        'seed-a.yml': `
          germinator: v2
          synchronize: false
          entities:
            - TableA:
                $id: id-1
                fooBar: 'baz'
        `,
        'seed-b.yaml': `
          germinator: v2
          synchronize: false
          entities:
            - TableA:
                $id: id-2
                fooBar: 'baz'
        `,
      },
      async (inDir) => {
        const kx = Knex({
          client: 'sqlite3',
          connection: { filename: ':memory:' },
          useNullAsDefault: true,
        });

        try {
          await kx.schema.createTable('table_a', (table) => {
            table.increments('id').primary().notNullable();
            table.text('foo_bar').notNullable();
          });

          await runSeeds({
            db: kx,
            folder: inDir('.'),
            helpers: {},
          });

          await expect(kx('table_a')).resolves.toEqual([
            { id: 1, foo_bar: 'baz' },
            { id: 2, foo_bar: 'baz' },
          ]);
        } finally {
          await kx.destroy();
        }
      },
    ));
});
