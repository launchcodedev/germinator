#!/usr/bin/env node

import yargs from 'yargs';
import debug from 'debug';
import { runSeeds } from '@germinator/node';
import { makeHelpers } from '@germinator/helpers';
import { GerminatorError } from '@germinator/core';

/* eslint-disable no-param-reassign */

if (!process.env.DEBUG) {
  debug.enable('germinator:info,germinator:db,germinator:seed');
}

type SubcommandOptions<
  Options extends { [name: string]: yargs.Options },
  PositionalOptions extends { [name: string]: yargs.PositionalOptions }
> = {
  name: string | string[];
  description?: string;
  examples?: [string, string][];
  options?: Options;
  positional?: PositionalOptions;
};

type SubcommandFn<Options extends { [name: string]: yargs.Options }> = (
  args: yargs.InferredOptionTypes<Options> & { _: string[] },
) => Promise<void> | void;

function subcommand<
  Options extends { [name: string]: yargs.Options },
  PositionalOptions extends { [name: string]: yargs.PositionalOptions }
>(
  desc: SubcommandOptions<Options, PositionalOptions>,
  run: SubcommandFn<Options & PositionalOptions>,
): yargs.CommandModule {
  const { name, description, examples = [], options, positional } = desc;
  const [command, ...aliases] = Array.isArray(name) ? name : [name];

  return {
    command,
    aliases,
    describe: description,
    builder: (args) => {
      if (positional) {
        for (const [key, opt] of Object.entries(positional)) {
          args.positional(key, opt);
        }
      }

      if (options) {
        args.options(options);
      }

      args.example(examples);

      return args;
    },
    handler(args) {
      if (typeof args.cwd === 'string') process.chdir(args.cwd);

      args.work = run(
        args as { _: string[] } & yargs.InferredOptionTypes<Options & PositionalOptions>,
      );

      return args.work;
    },
  };
}

export function buildCLI() {
  return yargs
    .wrap(yargs.terminalWidth() - 5)
    .strict()
    .version()
    .options({
      cwd: {
        alias: 'C',
        nargs: 1,
        type: 'string',
        description: 'Runs germinator in the context of a different directory',
      },
    })
    .env('GERMINATOR')
    .command(
      subcommand(
        {
          name: '* <fileOrFolder>',
          description: 'Runs seeds',
          positional: {
            fileOrFolder: {
              type: 'string',
            },
          },
          options: {
            client: {
              alias: 'c',
              type: 'string',
              choices: ['postgres', 'sqlite3'],
              description: 'What kind of database to connect to',
            },
            hostname: {
              alias: 'h',
              type: 'string',
              description: 'Hostname of the database',
              default: 'localhost',
            },
            port: {
              alias: 'p',
              type: 'number',
              description: 'Port of the database',
            },
            database: {
              alias: 'd',
              type: 'string',
              description: 'Database name',
            },
            filename: {
              alias: 'o',
              type: 'string',
              description: 'Filename for SQLite databases (:memory: will work)',
            },
            user: {
              alias: 'u',
              type: 'string',
              description: 'Username to connect with',
            },
            pass: {
              type: 'string',
              description: 'Password for the user',
            },
            dryRun: {
              type: 'boolean',
              description: 'Does not run INSERT or UPDATE',
            },
            noTracking: {
              type: 'boolean',
              description: 'Does not track inserted entries - only use for one-off insertions!',
            },
          },
          examples: [
            ['$0 ./seeds -c sqlite3 -o ./db.sqlite', 'Run SQLite seeds'],
            ['$0 ./seeds -c postgres -u admin --pass s3cur3', 'Run seeds on a Postgres DB'],
          ],
        },
        async (opts) => {
          if (opts.filename && !opts.client) {
            opts.client = 'sqlite3';
          }

          if (opts.client === 'postgres' && !opts.port) {
            opts.port = 5432;
          }

          switch (opts.client) {
            case undefined:
              throw new GerminatorError('database client is required');

            case 'sqlite3': {
              if (!opts.filename) throw new GerminatorError('filename is required');
              break;
            }

            default: {
              if (!opts.port) throw new GerminatorError('port is required');
              if (!opts.user) throw new GerminatorError('user is required');
              if (!opts.pass) throw new GerminatorError('password is required');
              break;
            }
          }

          const { fileOrFolder } = opts;

          if (!fileOrFolder) {
            throw new GerminatorError('fileOrFolder is required');
          }

          let file;
          let folder;

          if (fileOrFolder.endsWith('.yml') || fileOrFolder.endsWith('.yaml')) {
            file = fileOrFolder;
          } else {
            folder = fileOrFolder;
          }

          const helpers = makeHelpers();

          const db = {
            client: opts.client,
            pool: { min: 1, max: 1 },
            useNullAsDefault: opts.client === 'sqlite3',
            connection: {
              filename: opts.filename,
              host: opts.hostname,
              port: opts.port,
              user: opts.user,
              password: opts.pass,
            },
          };

          const options = {
            dryRun: opts.dryRun,
            noTracking: opts.noTracking,
          };

          if (file) {
            await runSeeds({ db, file, helpers }, options);
          } else if (folder) {
            await runSeeds({ db, folder, helpers }, options);
          }
        },
      ),
    );
}

export function runCLI() {
  buildCLI().parse();
}

if (require.main === module) {
  runCLI();
}
