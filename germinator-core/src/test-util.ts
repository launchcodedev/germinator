import Knex, { StaticConnectionConfig } from 'knex';
import { setupDatabase } from './database';

export function connect({
  config,
  client = 'filename' in config ? 'sqlite3' : 'postgresql',
}: {
  config: StaticConnectionConfig;
  client: 'sqlite3' | 'postgresql';
}) {
  return setupDatabase(
    Knex({
      client,
      connection: config,
      useNullAsDefault: client === 'sqlite3',

      // germinator needs a very small pool
      // it's not a long living multi-client app
      pool: { min: 1, max: 2 },
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
        .catch((err) => {
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
  }).catch((err) => {
    console.error(err);

    throw err;
  });

  postgresTest(name, callback);
};
