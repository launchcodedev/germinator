// for development only
module.exports = {
  development: {
    client: 'sqlite3',
    connection: {
      filename: 'testing.db',
    },
    migrations: {
      extension: 'ts',
      stub: './src/migration.stub.ts',
      directory: './src/migrations',
      tableName: 'germinator_migration',
    },
  },
};
