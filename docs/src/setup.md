# Setup

Germinator only needs two things - a folder of YAML files, and database connection parameters.

It's normal to make a folder called `seeds`, with different files for different categories of seeds.

```
seeds/
  -> users.yml
  -> posts.yml
  -> categories.yml
```

Germinator also needs details to connect to your database. The CLI has options for these.

```sh
npx germinator -c postgres -u admin --pass s3cur3 --port 5432
```

Germinator will read environment variables as well:

`GERMINATOR_CLIENT` / `--client` / `-c`: The type of database (`postgres`, `sqlite3`)

`GERMINATOR_HOSTNAME` / `--hostname` / `-h`: The host of your database (default "localhost")

`GERMINATOR_PORT` / `--port` / `-p`: Network port to access your database on

`GERMINATOR_DATABASE` / `--database` / `-d`: Name of the database that germinator will operate in

`GERMINATOR_USER` / `--user` / `-u`: User that germinator will connect as

`GERMINATOR_PASS` / `--pass`: Password for the connecting user

`GERMINATOR_FILENAME` / `--filename` / `-o`: SQLite database location

If you don't have Node.js, or want to isolate germinator, use the **[docker image](./docker.md)**.

<br />

**Any important note!**: Germinator will create 3 tables in your database! They
are prefixed with `germinator_*`. These are used for tracking any seeds that
you've made, so that germinator can keep them up to date. The two other tables
are used for germinator's internal migrations.

If you really don't want this, use `--noTracking`. This will make it impossible
for Germinator to synchronize values though.

## Environment Specific Seeds

Germinator respects the `NODE_ENV` environment variable. You can mark whole seed
files, or individual seeds, as environment-specific.

```yaml
germinator: v2
synchronize: true
$env: ['development', 'qa']

entities: ...
```

In this example, germinator will only insert these seeds when `NODE_ENV` is `development` or `qa`.

This can be done per-entry as well:

```yaml
germinator: v2
synchronize: true

entities:
  - TableA:
      $id: table-a-1
      $env: ['development', 'qa']
```

## Naming Strategy

Germinator tries to use reasonable defaults, and assumes that you use `SnakeCase` as a naming strategy for tables and columns.

You can opt-out of this, per-file or per-entry.

```yaml
germinator: v2
synchronize: true
namingStrategy: AsIs

entities:
  - odly_namedTable:
      $id: table-a-1
  - OtherTable:
      $id: table-b-1
      $namingStrategy: SnakeCase
```
