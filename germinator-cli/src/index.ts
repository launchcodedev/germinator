import yargs from 'yargs';
import { runSeeds } from '@germinator/node';

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
    async handler(args) {
      if (typeof args.cwd === 'string') process.chdir(args.cwd);

      await run(args as { _: string[] } & yargs.InferredOptionTypes<Options & PositionalOptions>);
    },
  };
}

function buildCLI() {
  return yargs
    .strict()
    .version()
    .options({
      cwd: {
        alias: 'C',
        nargs: 1,
        type: 'string',
        description: 'Run app-config in the context of this directory',
      },
    })
    .command(
      subcommand(
        {
          name: '* <folder>',
          description: 'Runs seeds',
          positional: {
            folder: {
              type: 'string',
            },
          },
          options: {
            client: {
              alias: 'c',
              type: 'string',
              options: ['postgres', 'sqlite3'],
              description: 'What kind of database to connect to',
              required: true,
            },
            hostname: {
              alias: 'h',
              type: 'string',
              description: 'Hostname of the database',
              default: 'localhost',
            },
            database: {
              alias: 'd',
              type: 'string',
              description: 'Database name',
            },
            port: {
              alias: 'p',
              type: 'number',
              description: 'Port of the database',
            },
            filename: {
              alias: 'o',
              type: 'string',
              description: 'Filename option for SQLite',
            },
            user: {
              alias: 'u',
              type: 'string',
              description: 'Username to connect with',
            },
            pass: {
              alias: 'p',
              type: 'string',
              description: 'Password of the user',
            },
          },
        },
        async (opts) => {
          switch (opts.client) {
            case 'sqlite3': {
              if (!opts.filename) throw new Error('filename is required');
              break;
            }

            default: {
              if (!opts.port) throw new Error('port is required');
              if (!opts.user) throw new Error('user is required');
              if (!opts.pass) throw new Error('password is required');
              break;
            }
          }

          await runSeeds({
            folder: opts.folder!,
            db: {
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
            },
          });
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
