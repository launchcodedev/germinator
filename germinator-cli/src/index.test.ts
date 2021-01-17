import Knex from 'knex';
import { buildCLI } from './index';
import { withTempFiles } from './test-util';

const runCLI = (argv: string[]) =>
  new Promise<void>((resolve, reject) => {
    const { work } = buildCLI()
      .fail((msg, err) => reject(err ?? msg))
      .parse(argv);

    (work as Promise<void>)?.then(resolve, reject);
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
});
