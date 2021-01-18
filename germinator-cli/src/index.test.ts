import Knex from 'knex';
import { outputFile } from 'fs-extra';
import { FSWatcher } from 'chokidar';
import { buildCLI } from './index';
import { withTempFiles } from './test-util';

const runCLI = (argv: string[]) =>
  new Promise<FSWatcher | undefined>((resolve, reject) => {
    const { work } = buildCLI()
      .fail((msg, err) => reject(err ?? msg))
      .parse(argv);

    (work as Promise<FSWatcher | undefined>)?.then(resolve, reject);
  });

describe('CLI', () => {
  it('runs against a sqlite3 database', () =>
    withTempFiles(
      {
        'seeds/seed-a.yml': `
          germinator: v2
          synchronize: true
          entities:
            - TableA:
                $id: "1"
                foo: bar
        `,
      },
      async (inDir) => {
        const kx = Knex({
          client: 'sqlite3',
          useNullAsDefault: true,
          connection: {
            filename: inDir('db'),
          },
        });

        try {
          await kx.raw('create table table_a (id integer not null primary key, foo varchar(255))');

          await runCLI([inDir(`seeds`), '-c=sqlite3', `--filename=${inDir('db')}`]);

          await expect(kx.raw('select * from table_a')).resolves.toEqual([{ id: 1, foo: 'bar' }]);
        } finally {
          await kx.destroy();
        }
      },
    ));

  it('uses environment variables as options', () =>
    withTempFiles(
      {
        'seeds/seed-a.yml': `
          germinator: v2
          synchronize: true
          entities:
            - TableA:
                $id: "1"
                foo: bar
        `,
      },
      async (inDir) => {
        const kx = Knex({
          client: 'sqlite3',
          useNullAsDefault: true,
          connection: {
            filename: inDir('db'),
          },
        });

        process.env.GERMINATOR_FILENAME = inDir('db');

        try {
          await kx.raw('create table table_a (id integer not null primary key, foo varchar(255))');

          await runCLI([inDir(`seeds`)]);

          await expect(kx.raw('select * from table_a')).resolves.toEqual([{ id: 1, foo: 'bar' }]);
        } finally {
          await kx.destroy();
          delete process.env.GERMINATOR_FILENAME;
        }
      },
    ));

  it('runs watch mode', () =>
    withTempFiles({}, async (inDir) => {
      await outputFile(
        inDir('seeds/seed-a.yml'),
        `
          germinator: v2
          synchronize: true
          entities:
            - TableA:
                $id: "1"
                foo: bar
        `,
      );

      const kx = Knex({
        client: 'sqlite3',
        useNullAsDefault: true,
        connection: {
          filename: inDir('db'),
        },
      });

      let watcher: FSWatcher | undefined;

      try {
        await kx.raw('create table table_a (id integer not null primary key, foo varchar(255))');

        watcher = await runCLI([
          'watch',
          inDir(`seeds`),
          '-c=sqlite3',
          `--filename=${inDir('db')}`,
        ]);

        await expect(kx.raw('select * from table_a')).resolves.toEqual([{ id: 1, foo: 'bar' }]);

        await outputFile(
          inDir('seeds/seed-a.yml'),
          `
            germinator: v2
            synchronize: true
            entities:
              - TableA:
                  $id: "1"
                  foo: changed
          `,
        );

        // onChange is debounced at 1000ms
        await new Promise((resolve) => setTimeout(resolve, 1500));

        await expect(kx.raw('select * from table_a')).resolves.toEqual([{ id: 1, foo: 'changed' }]);
      } finally {
        await watcher?.close();
        await kx.destroy();
      }
    }));
});
