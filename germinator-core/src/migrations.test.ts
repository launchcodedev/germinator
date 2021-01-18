import { migrationFolder, migrationFileExt } from './database';
import { withSqlite, postgresTest } from './test-util';

const migrationConfig = {
  tableName: 'germinator_migration',
  directory: migrationFolder,
  loadExtensions: [migrationFileExt],
};

it.skip('migrates down if need be', () =>
  withSqlite(async (kx) => {
    while ((await kx.migrate.currentVersion(migrationConfig)) !== 'none') {
      await kx.migrate.down(migrationConfig);
    }
  }));

postgresTest('migrates up and down in postgres', async (kx) => {
  while ((await kx.migrate.currentVersion(migrationConfig)) !== 'none') {
    await kx.migrate.down(migrationConfig);
  }
});
