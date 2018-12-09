import { createConnection } from 'typeorm';
import { SqliteConnectionOptions } from 'typeorm/driver/sqlite/SqliteConnectionOptions';
import {
  insertSeed,
  findCompletedSeeds,
  createSeedTableIfDoesNotExist,
} from './index';

const inMemoryDb = async () => {
  const opts: SqliteConnectionOptions = {
    type: 'sqlite',
    database: ':memory:',
  };

  return createConnection(opts);
};

test('insert seed', async () => {
  const db = await inMemoryDb();
  const runner = db.createQueryRunner();
  await createSeedTableIfDoesNotExist(runner);

  await insertSeed(runner, 'seed_name');
  const seeds = await findCompletedSeeds(runner);

  expect(seeds).toEqual(['seed_name']);
});
