import { migrationFolder, migrationFileExt } from './database';
import { withSqlite } from './test-util';

const migrationConfig = {
  tableName: 'germinator_migration',
  directory: migrationFolder,
  loadExtensions: [migrationFileExt],
};

it('migrates down if need be', () =>
  withSqlite(async (kx) => {
    while ((await kx.migrate.currentVersion(migrationConfig)) !== 'none') {
      await kx.migrate.down(migrationConfig);
    }
  }));
