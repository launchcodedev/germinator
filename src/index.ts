import { Table, Connection, QueryRunner } from 'typeorm';
import { extname, basename } from 'path';
import { hashSync, genSaltSync } from 'bcrypt';
import { readFile, readdir } from 'fs-extra';
import { safeLoad } from 'js-yaml';
import * as klaw from 'klaw';
import { obj } from 'through2';

export interface Seed {
  name: string;
  tables: TableSeed[];
}

export interface TableSeed {
  name: string;
  columns: string[];
  values: string[];
  sensitive: string[];
}

interface RawYaml {
  name: string;
  data: any;
}

export async function runSeeds(connection: Connection, seedLocation: string): Promise<number> {
  const environment = process.env.NODE_ENV === 'development' ? 'dev' : 'prod';
  const seedDirectory = `/${seedLocation}/${environment}`;
  const refs: any = {};

  const runner = connection.createQueryRunner();
  let seedsLength = 0;

  try {
    await createSeedTableIfDoesNotExist(runner);

    const doneSeeds = await getDoneSeeds(runner);

    const files = await getYamlFilePaths(seedDirectory);

    const seeds = await Promise.all(
      files.map(loadYaml),
    ) as any;

    const filteredSeeds = seeds
      .filter((seed:any) => !doneSeeds.includes(seed.name));

    if (filteredSeeds.length > 0) {
      await runner.startTransaction();

      const promises = filteredSeeds.map(async (seed: any) => {
        const { data: { entities } } = seed;

        await entities.reduce(
          async (promise: Promise<any>, entity: any) => {
            await promise;
            const entityName = Object.keys(entity)[0];
            const data = entity[entityName];

            const values = sortEntities(data).reduce(
              (data: any, curr: [string, any]) => {
                const [propName, prop] = curr;

                let value = prop;

                if (prop.sensitive) {
                  const salt = genSaltSync();
                  value = hashSync(prop.value, salt);
                }

                if (prop.ref) {
                  if (!refs[prop.ref]) {
                    throw new Error(
                      'Cannot find reference, are the entities sorted correctly?'
                    );
                  }

                  value = refs[prop.ref];
                }

                return {
                  ...data,
                  [propName]: value,
                };
              },
              {},
            );

            const refName = data.refName;

            const saved = await runner.connection
              .createQueryBuilder()
              .insert()
              .into(entityName)
              .values(values)
              .execute();

            if (refName) {
              refs[refName] = saved.identifiers[0];
            }

            return Promise.resolve();
          },
          Promise.resolve(),
        );

        return insertSeed(seed.name, runner);
      });

      await Promise.all(promises);
    }

    seedsLength = filteredSeeds.length;

    if (runner.isTransactionActive) {
      await runner.commitTransaction();
    }
  } catch (e) {
    console.error(e);
    if (runner.isTransactionActive) {
      await runner.rollbackTransaction();
    }

    throw e;
  } finally {
    await runner.release();
  }

  return seedsLength;
}

export async function createSeedTableIfDoesNotExist(runner: QueryRunner): Promise<void> {
  await runner.createTable(
    new Table({
      name: 'seeds',
      columns: [
        {
          name: 'id',
          type: 'int',
          isPrimary: true,
          isGenerated: true,
        }, {
          name: 'timestamp',
          type: 'timestamptz',
          isNullable: false,
        }, {
          name: 'name',
          type: 'text',
          isNullable: false,
        },
      ],
    }),
    true,
  );
}

export async function insertSeed(name: string, runner: QueryRunner): Promise<void> {
  await runner.query(
    'INSERT INTO "seeds" ("timestamp", "name") VALUES(CURRENT_TIMESTAMP, ?)',
    [name],
  );
}

export async function getDoneSeeds(runner: QueryRunner): Promise<string[]> {
  const seeds = await runner.query('SELECT * FROM seeds');
  return seeds.map((seed: any) => seed.name);
}

export function getYamlFilePaths(seedsPath: string): Promise<string[]> {
  const excludeDirFilter = obj(function (item, enc, next) {
    if (!item.stats.isDirectory() && isYamlFile(item.path)) {
      this.push(item);
    }
    next();
  });

  const files: string[] = [];
  return new Promise(
    (resolve: Function, reject: Function) => {
      const klawer = klaw(
        seedsPath,
        {
          depthLimit: 1,
        },
      );

      klawer.on('error', reject);
      klawer
        .pipe(excludeDirFilter)
        .on('data', file => files.push(file.path));
      klawer.on('end', () => resolve(files));
    },
  );
}

export async function loadYaml(filePath: string): Promise<RawYaml> {
  const file = await readFile(filePath);

  return {
    name: basename(filePath, '.yaml'),
    data: safeLoad(file.toString()),
  };
}

export function isYamlFile(item: any): boolean {
  return extname(item).match(/\.ya?ml$/) !== null;
}

export function sortEntities(entities: any): [string, any][] {
  const arr = Object.entries(entities);
  const newArr: any[] = [];

  arr.forEach((item: [string, any]) => {
    const [_, props] = item;
    let smallestIdx = Infinity;

    newArr.forEach((otherItem: [string, any], index: number) => {
      const refs = Object.values(otherItem[1]).filter((i: any) => i.ref !== undefined);
      const idx = refs.indexOf(props.refName);

      if (idx >= 0 && index < smallestIdx) {
        smallestIdx = index;
      }
    });

    if (smallestIdx === Infinity) {
      newArr.push(item);
    } else {
      newArr.splice(smallestIdx, 0, item);
    }
  });

  return newArr;
}
