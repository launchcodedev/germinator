import Knex from 'knex';
import { join } from 'path';
import { dir } from 'tmp-promise'; // eslint-disable-line import/no-extraneous-dependencies
import { outputFile, remove } from 'fs-extra';
import { connect } from './database';

// function that joins the temp dir to a filename
type JoinDir = (filename: string) => string;

export async function withTempFiles(
  files: { [filename: string]: string },
  callback: (inDir: JoinDir, dir: string) => Promise<void>,
): Promise<void>;

export async function withTempFiles(
  files: [string, string][],
  callback: (inDir: JoinDir, dir: string) => Promise<void>,
): Promise<void>;

export async function withTempFiles(
  files: { [filename: string]: string } | [string, string][],
  callback: (inDir: JoinDir, dir: string) => Promise<void>,
) {
  const { path: folder } = await dir();

  try {
    const entries = Array.isArray(files) ? files : Object.entries(files);

    for (const [filename, contents] of entries) {
      await outputFile(join(folder, filename), contents);
    }

    await callback((filename) => join(folder, filename), folder);
  } finally {
    await remove(folder);
  }
}

export const withSqlite = (callback: (kx: Knex) => Promise<void>) =>
  withTempFiles({ 'db.sqlite': '' }, async (inDir) => {
    const kx = await connect({
      client: 'sqlite3',
      config: {
        filename: inDir('db.sqlite'),
      },
    });

    await callback(kx);

    kx.destroy();
  });
