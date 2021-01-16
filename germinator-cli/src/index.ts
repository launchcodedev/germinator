import yargs from 'yargs';
import { connect } from '@germinator/core';

function buildCLI() {
  return yargs
    .command('migrations', '', async () => {
      await connect({
        client: 'sqlite3',
        config: {
          filename: './temp-db.sqlite',
        },
      });
    });
}

export function runCLI() {
  buildCLI().parse();
}
