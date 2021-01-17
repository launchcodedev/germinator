import Knex from 'knex';
import { setupDatabase } from './database';

export function connect({
  config,
  client = 'filename' in config ? 'sqlite3' : 'postgresql',
}: {
  config: Knex.ConnectionConfig | Knex.Sqlite3ConnectionConfig;
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
