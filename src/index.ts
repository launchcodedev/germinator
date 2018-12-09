import { extname, basename, join } from 'path';
import { readFile, pathExists } from 'fs-extra';
import { Table, Connection, QueryRunner } from 'typeorm';
import { hashSync, genSaltSync } from 'bcrypt';
import { safeLoad } from 'js-yaml';
import { promise as glob } from 'glob-promise';

const seedsTable = 'seeds';

export interface TableSeed {
  name: string;
  columns: string[];
  values: string[];
  sensitive: string[];
}

export interface Seed {
  name: string;
  tables: TableSeed[];
}

interface SeedEntry {
  name: string;
  timestamp: Date;
}

export const runSeeds = async (connection: Connection, seedsRootPath: string): Promise<number> => {
  const seedDirectory = await findSeedDirectory(seedsRootPath);

  const runner = connection.createQueryRunner();
  const refs: any = {};
  let seedsLength = 0;

  try {
    await createSeedTableIfDoesNotExist(runner);

    const files = await findYamlFiles(seedDirectory);
    const completedSeeds = await findCompletedSeeds(runner);
    const seeds = await Promise.all(files.map(loadYaml));

    const filteredSeeds = seeds
      .filter(({ name }) => !completedSeeds.includes(name));

    if (filteredSeeds.length > 0) {
      await runner.startTransaction();

      const promises = filteredSeeds.map(async (seed) => {
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
                      `Cannot find reference (${prop.ref}), are the entities sorted correctly? (available: ${Object.keys(refs)})`
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

        await insertSeed(runner, seed.name);
      });

      await Promise.all(promises);
    }

    seedsLength = filteredSeeds.length;
  } finally {
    if (runner.isTransactionActive) {
      await runner.commitTransaction();
    }

    await runner.release();
  }

  return seedsLength;
}

export const sortEntities = (entities: any): [string, any][] => {
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

export const createSeedTableIfDoesNotExist = async (runner: QueryRunner) => {
  await runner.createTable(
    new Table({
      name: seedsTable,
      columns: [
        {
          name: 'id',
          type: 'integer',
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

export const insertSeed = async (runner: QueryRunner, name: string) => {
  await runner.query(
    `INSERT INTO "${seedsTable}" ("timestamp", "name") VALUES(CURRENT_TIMESTAMP, $1)`,
    [name],
  );
}

export const findCompletedSeeds = async (runner: QueryRunner) => {
  const seeds: SeedEntry[] = await runner.query(`SELECT * FROM ${seedsTable}`);

  // any seeds that were inserted are complete
  return seeds.map(({ name }) => name);
}

export const findSeedDirectory = async (seedsRootPath: string) => {
  const environment = process.env.NODE_ENV || 'development';

  if (await pathExists(join(seedsRootPath, environment))) {
    return join(seedsRootPath, environment);
  }

  const shorthand =
    (environment === 'development') ? 'dev' :
    (environment === 'production') ? 'prod' : false;

  if (shorthand && await pathExists(join(seedsRootPath, shorthand))) {
    return join(seedsRootPath, shorthand);
  }

  throw new Error('could not find directory with seeds for your environment');
};

export const findYamlFiles = async (seedsPath: string) => {
  return glob(join(seedsPath, '*.ya?ml'));
}

export const loadYaml = async (filePath: string) => {
  const file = await readFile(filePath);

  return {
    name: basename(filePath, extname(filePath)),
    data: safeLoad(file.toString('utf8')),
  };
}
