import { extname, basename, join } from 'path';
import { readFile, pathExists } from 'fs-extra';
import { Table, Connection, QueryRunner } from 'typeorm';
import { hashSync, genSaltSync } from 'bcrypt';
import { safeLoad } from 'js-yaml';
import { promise as glob } from 'glob-promise';

const seedsTable = 'seeds';

interface TableSeed {
  name: string;
  columns: string[];
  values: string[];
  sensitive: string[];
}

interface Seed {
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
    const seeds: any[] = await Promise.all(files.map(loadYaml));

    const filteredSeeds = seeds
      .filter(({ name }) => !completedSeeds.includes(name));

    if (filteredSeeds.length > 0) {
      await runner.startTransaction();

      const promises = filteredSeeds.map(async (seed: any) => {
        const { data: { entities } } = seed;

        if (!entities) {
          throw new Error(`no \'entities\' defined in ${seed.name}`);
        }

        await entities.reduce(async (promise: Promise<void>, entity: any) => {
          await promise;

          const [entityName, ...others] = Object.keys(entity);

          if (others.length > 0) {
            throw new Error(`Included multiple entities in one entry - ${
              [entityName, ...others].join(', ')
            }`);
          }

          const values = await transformEntities(
            sortEntities(entity[entityName]),
            refs,
            runner,
          );

          const saved = await runner.connection
            .createQueryBuilder()
            .insert()
            .values(values)
            .into(entityName)
            .execute();

          const { refName } = entity[entityName];

          if (refName) {
            refs[refName] = saved.identifiers[0];
          }
        }, Promise.resolve());

        await insertSeed(runner, seed.name);
      });

      await Promise.all(promises);
    }

    seedsLength = filteredSeeds.length;
  } catch (e) {
    console.error(e);
    if (runner.isTransactionActive) {
      await runner.rollbackTransaction();
    }
    throw e;
  } finally {
    if (runner.isTransactionActive) {
      await runner.commitTransaction();
    }
    await runner.release();
  }

  return seedsLength;
};

const sortEntities = (entities: any): [string, any][] => {
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
};

const transformEntities = async (entities: [string, any][], refs: any, runner: QueryRunner) => {
  const values: { [key: string]: any } = {};

  for (const [propName, prop] of entities) {
    let value = prop;

    if (prop.sensitive) {
      const salt = genSaltSync();
      value = hashSync(prop.value, salt);
    }

    if (prop.ref) {
      if (!refs[prop.ref]) {
        throw new Error(
          `Cannot find reference (${prop.ref}), are the entities sorted correctly?`
          + ` (available: ${Object.keys(refs)})`,
        );
      }

      value = refs[prop.ref];
    }

    if (prop.$find) {
      if (!prop.$find.entity) {
        throw new Error('entity name is needed to for $find');
      }

      if (!prop.$find.where) {
        throw new Error('where clause is needed for $find');
      }

      let query = runner.connection.createQueryBuilder().from(prop.$find.entity, prop.$find.entity);

      for (const [name, val] of Object.entries(prop.$find.where)) {
        query = query.where(`"${prop.$find.entity}"."${name}" = :val`, { val });
      }

      const found = await query.execute();

      if (found.length === 0) {
        throw new Error('$find returned no results');
      } else if (found.length > 1) {
        throw new Error('$find returned multiple results, have to be more specific');
      }

      value = found[0];
    }

    values[propName] = value;
  }

  return values;
};

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
        },
        {
          name: 'timestamp',
          type: 'timestamp',
          isNullable: false,
        },
        {
          name: 'name',
          type: 'text',
          isNullable: false,
        },
      ],
    }),
    true,
  );
};

export const insertSeed = async (runner: QueryRunner, name: string) => {
  await runner.query(
    `INSERT INTO "${seedsTable}" ("timestamp", "name") VALUES(CURRENT_TIMESTAMP, $1)`,
    [name],
  );
};

export const findCompletedSeeds = async (runner: QueryRunner) => {
  const seeds: SeedEntry[] = await runner.query(`SELECT * FROM ${seedsTable}`);

  // any seeds that were inserted are complete
  return seeds.map(({ name }) => name);
};

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
  return glob(join(seedsPath, '*.@(yml|yaml)'));
};

export const loadYaml = async (filePath: string) => {
  const file = await readFile(filePath);

  return {
    name: basename(filePath, extname(filePath)),
    data: safeLoad(file.toString('utf8')) || {},
  };
};
