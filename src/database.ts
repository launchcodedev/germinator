import { getLogger } from '@lcdev/logger';
import * as Knex from 'knex';

export const isTypescript = __filename.endsWith('.ts');
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
    getLogger()!.debug(`query: ${sql} (${bindings.join(',')})`);
  });

  return knexion;
};
