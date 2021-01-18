import { migrationFolder, migrationFileExt } from './database';
import { anyDbTest } from './test-util';

const migrationConfig = {
  tableName: 'germinator_migration',
  directory: migrationFolder,
  loadExtensions: [migrationFileExt],
};

anyDbTest('migrates up and down', async (kx) => {
  while ((await kx.migrate.currentVersion(migrationConfig)) !== 'none') {
    await kx.migrate.down(migrationConfig);
  }
});
