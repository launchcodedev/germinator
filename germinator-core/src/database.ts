import debug from 'debug';
import Knex from 'knex';

const log = debug('germinator:db');

export const isTypescript = __filename.endsWith('.ts');
export const migrationFileExt = isTypescript ? '.ts' : '.js';
export const migrationFolder = `${__dirname}/migrations`;

export async function connect({
  config,
  client = 'filename' in config ? 'sqlite3' : 'postgresql',
}: {
  config: Knex.ConnectionConfig | Knex.Sqlite3ConnectionConfig;
  client: 'sqlite3' | 'postgresql';
}) {
  const knexion = Knex({
    client,
    connection: config,
    useNullAsDefault: client === 'sqlite3',

    // germinator needs a very small pool
    // it's not a long living multi-client app
    pool: { min: 1, max: 2 },
  });

  knexion.on('query', ({ sql, bindings = [] }: Knex.Sql) => {
    if (bindings?.length) {
      log(`sql: ${sql} (${bindings.join(',')})`);
    } else {
      log(`sql: ${sql}`);
    }
  });

  log(`Running migrations from ${migrationFolder}`);

  // germinator has it's own migrations, which it uses to track data that it made
  await knexion.migrate.latest({
    tableName: 'germinator_migration',
    directory: migrationFolder,
    loadExtensions: [migrationFileExt],
  });

  return knexion;
}
