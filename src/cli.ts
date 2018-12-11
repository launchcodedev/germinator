#!/usr/bin/env node

import { runSeeds } from './index';
import { createConnection } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import * as Yargs from 'yargs';

const argv = Yargs
  .usage('Usage: $0 <command>')
  .usage('')
  .usage('Runs germinator seeds')
  .example(
    '$0 --dev ./seeds --db-user joel --db-password secureK3Y',
    'Runs all development seeds in the ./seeds folder',
  )
  .example(
    '$0 --prod ./seeds',
    'Runs all production seeds in the ./seeds folder',
  )
  .option('dev', {
    default: process.env.NODE_ENV === 'development',
    nargs: 0,
    type: 'boolean',
  })
  .option('prod', {
    default: process.env.NODE_ENV === 'production',
    nargs: 0,
    type: 'boolean',
  })
  .option('db-port', {
    default: 5432,
    nargs: 1,
    type: 'number',
  })
  .option('db-name', {
    default: 'postgres',
    nargs: 1,
    type: 'string',
  })
  .option('db-user', {
    default: 'postgres',
    nargs: 1,
    type: 'string',
  })
  .option('db-password', {
    nargs: 1,
    type: 'string',
  })
  .version()
  .help()
  .argv;

const [folder] = argv._;

if (argv.dev) {
  process.env.NODE_ENV = 'development';
} else if (argv.prod) {
  process.env.NODE_ENV = 'production';
} else {
  console.error('either --prod or --dev are required');
  process.exit(1);
}

if (!folder) {
  Yargs.showHelp();
  process.exit(0);
}

const opts: PostgresConnectionOptions = {
  type: 'postgres',
  database: argv.dbName,
  port: argv.dbPort,
  username: argv.dbUser,
  password: argv.dbPassword,
};

(async () => {
  const conn = await createConnection(opts);
  await runSeeds(conn, folder);
})().catch((err) => {
  console.error(err);
  process.exit(2);
});
