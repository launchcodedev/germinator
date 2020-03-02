import * as Knex from 'knex';
import { createLogger } from '@lcdev/logger';
import { dbConnect } from './database';

createLogger({ stdout: false, silent: true });

export const sqlite = async () => {
  const db = await dbConnect({
    filename: ':memory:',
  });

  return db;
};

export const pg = async () => {
  const db = await dbConnect({
    host: process.env.POSTGRES_HOST ?? 'localhost',
    database: process.env.POSTGRES_DB!,
    user: process.env.POSTGRES_USER!,
    password: process.env.POSTGRES_PASSWORD!,
  });

  return db;
};

export function testWithSqlite(name: string, cb: (db: Knex) => Promise<void>): void;
export function testWithSqlite(
  noMigrations: boolean,
  name: string,
  cb: (db: Knex) => Promise<void>,
): void;
export function testWithSqlite(...args: any[]) {
  let noMigrations = false;
  let name: string;
  let callback: (db: Knex) => Promise<void>;

  if (args.length === 3) {
    [noMigrations, name, callback] = args;
  } else {
    [name, callback] = args;
  }

  test(`${name} [sqlite]`, async () => {
    const db = await sqlite();
    if (!noMigrations) await db.migrate.latest();
    await callback(db);
    await db.destroy();
  });
}

export function testWithDb(name: string, cb: (db: Knex) => Promise<void>): void;
export function testWithDb(
  noMigrations: boolean,
  name: string,
  cb: (db: Knex) => Promise<void>,
): void;
export function testWithDb(...args: any[]) {
  let noMigrations = false;
  let name: string;
  let callback: (db: Knex) => Promise<void>;

  if (args.length === 3) {
    [noMigrations, name, callback] = args;
  } else {
    [name, callback] = args;
  }

  test(`${name} [sqlite]`, async () => {
    const db = await sqlite();
    const trx = await db.transaction();
    if (!noMigrations) await trx.migrate.latest();
    await callback(trx);
    await trx.rollback();
    await db.destroy();
  });

  if (process.env.POSTGRES_DB) {
    test(`${name} [postgres]`, async () => {
      const db = await pg();
      const trx = await db.transaction();

      if (!noMigrations) {
        if ((await trx.migrate.currentVersion()) !== 'none') {
          await trx.migrate.rollback({}, true);
        }

        await trx.migrate.latest();
      }

      await callback(trx);
      await trx.rollback();
      await db.destroy();
    });
  }
}

describe('db connection', () => {
  testWithSqlite('down migration', async db => {
    await db.migrate.rollback({}, false);
  });
});
