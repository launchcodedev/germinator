# Database Support

Officially, germinator is supported on Postgres and SQLite. Internally, we use
[Knex](knexjs.org/) without many database-specific features, so in theory most
clients are easy to support. Only SQLite and Postgres are run in CI, so they
are the only clients that are allowed at the moment.
