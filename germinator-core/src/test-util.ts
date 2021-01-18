import Knex, { StaticConnectionConfig } from 'knex';
import { setupDatabase } from './database';

/* eslint-disable no-console */

export function connect({
  config,
  client,
}: {
  config: StaticConnectionConfig;
  client: 'sqlite3' | 'postgresql';
}) {
  return setupDatabase(
    Knex({
      client,
      connection: config,
      useNullAsDefault: client === 'sqlite3',

      pool:
        'filename' in config && config.filename === ':memory:'
          ? { min: 1, max: 1 }
          : { min: 1, max: 5 },
    }),
  );
}

export const withSqlite = async (callback: (kx: Knex) => Promise<void>) => {
  const kx = await connect({
    client: 'sqlite3',
    config: {
      filename: ':memory:',
    },
  });

  try {
    await callback(kx);
  } finally {
    await kx.destroy();
  }
};

let psqlConnection: Promise<Knex> | undefined;

afterAll(() => {
  psqlConnection?.then((kx) => kx.destroy()).catch(() => {});
});

export const postgresTest = (name: string, callback: (kx: Knex) => Promise<void>): void => {
  if (psqlConnection) {
    test(name, async () => {
      const kx = await psqlConnection!;

      await kx
        .transaction((trx) => callback(trx).then(() => trx.rollback()))
        .catch((err: Error) => {
          if (err.message !== 'Transaction rejected with non-error: undefined') {
            throw err;
          }
        });
    });

    return;
  }

  const user = process.env.POSTGRES_USER;
  const password = process.env.POSTGRES_PASSWORD;
  const database = process.env.POSTGRES_DB;
  const host = process.env.POSTGRES_HOST;
  const port = process.env.POSTGRES_PORT;

  if (!user || !password || !database || !host || !port) {
    return;
  }

  console.log(`Running tests against postgres instance on port ${port}`);

  psqlConnection = connect({
    config: {
      user,
      password,
      database,
      host,
      port: Number(port),
    },
    client: 'postgresql',
  });

  postgresTest(name, callback);
};

export const anyDbTest = (name: string, callback: (kx: Knex, client: string) => Promise<void>) => {
  describe(name, () => {
    postgresTest('postgres', (kx) => callback(kx, 'postgres'));
    test('sqlite', () => withSqlite((kx) => callback(kx, 'sqlite')));
  });
};
