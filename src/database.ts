import { getLogger } from '@servall/logger';
import * as Knex from 'knex';

export const isTypescript = /\.ts$/.test(__filename);
export const migrationFileExt = isTypescript ? 'ts' : 'js';
export const migrationFolder = `${__dirname}/migrations`;

export const dbConnect = async (
  config: Knex.ConnectionConfig | Knex.Sqlite3ConnectionConfig,
  client = 'filename' in config ? 'sqlite3' : 'postgresql',
) => {
  const knexion = Knex({
    client,
    connection: config,
    pool: { min: 1, max: 2 },
    useNullAsDefault: client === 'sqlite3',
    migrations: {
      extension: migrationFileExt,
      directory: migrationFolder,
      tableName: 'germinator_migration',
    },
  });

  knexion.on('query', ({ sql, bindings = [] }: Knex.Sql) => {
    getLogger()!.info(`query: ${sql} (${bindings.join(',')})`);
  });

  return knexion;
};
