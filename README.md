# Germinator - Database Seeding
Use YAML files to safely seed databases with mock and real data.

Germinator is well suited for fake data, production seed data, and one-shot database insertions.

### Getting Started
```
yarn add @servall/germinator@0.3
```

Simply run seeds, given a database connection configuration. Supports Postgres and SQL Server officially.

```typescript
import { runSeeds } from '@servall/germinator';

await runGerminator({
  // this is where you would place your seed files - all YAML
  folder: path.resolve(`${__dirname}/../seeds`),
  db: {
    // usually, you already have this config - used in Knex
    host: 'localhost',
    port: 5432,
    database: 'my_db',
    client: 'postgresql',
  },
});
```

If you want to do more than just run your seeds, check out the types for `validate`, `loadFile`, `loadFiles`, `Seed` and `SeedEntry`.

### Features
- [x] Templated (handlebars.js) seed files for easy repetition and data-driven seeds
- [x] Auto-synchronization of seeds per-entity, which will UPDATE and DELETE automatically (opt-in with `synchronize`)
- [x] ORM/Database agnostic database layer with auto snake-case (or custom) naming schemes (no TypeORM or Objection required!)
- [x] Environment specific seeds, per-file and per-entity
- [x] Included helpers for fake data (fakerjs and chance) and a big utility belt (moment, handlebars helpers, etc)
- [x] Seeded random data generators for consistent fake data
- [x] Seeded and non-seeded bcrypt password generation
- [ ] Auto-locking tables to avoid seeding conflicts when running concurrently
- [ ] Built-in CLI (particularly for one-offs)
- [ ] Supporting composite primary keys
- [ ] Structural global `$id`s instead of only strings

### Core Ideas
We won't try to confuse you with terminology and any special instructions. Using germinator
should be really simple - if it's not then upstream patches are appreciated.

1. You can picture germinator as collecting a group of YAML files from a given folder, and merging them together
  1. **Noteworthy** is that seed files are [handlebars](https://handlebarsjs.com/guide) files primarily, which are rendered as YAML.
2. Once files are merged, each "entry" is equivalent to a database record/row - they have to be uniquely identifiable
  1. To mark entries as unique, we using a special `$id` property - this is a **globally** unique string per-record
  2. No really, `$id` needs to be unique, across all files. This is a common stumbling block.
3. Files are processed by rendering it as a Handlebars template - we have many built-in helpers for this
4. Reference any other entities with `{ $id: other-entity-$id }` which is resolved to the primary key of that record
5. Any entries that are marked as 'synchronize' will be updated and/or deleted when that corresponding seed entry changes
6. Entities in germinator can be customized - the table and column naming scheme and primary key name are adjustable

Tips:

- Prefix your `$id`s logically, like 'qa-employee-1'. This allows adding other categorical entities easier (demo-employee-1).
- Leverage the template system as much as you can, avoid repetition as much as you can. Driving your seeds this way makes it easy to scale up (go from 20 sample employees to 500).

### Example
A sample seed file will look something like the following. Remember that this file as both a handlebars file and YAML file.

```handlebars
# necessary for all germinator files, in case we change the format
germinator: v2

# Set this to true if all entries should be automatically updated and deleted when this file changes.
synchronize: true

# Set this for the entire file - respects NODE_ENV, and knows about some aliases like dev -> development
$env: [dev, test, qa, staging]

# We can define structural data here that will be fed into the templating engine below.
# This is optional, but usually really helpful (looping through objects is a lot easier than repeating yourself).
data:
  employees:
    - name: Bob Frank
      position: { $id: janitor }

# We use the triple dash below to tell germinator that it should be a separate rendering context. It's optional if you don't have 'data'.

---

# Entities is a list of all the database rows you want germinator to create.
entities:
  # An entity starts with a name, which is the table name
  - BookStore:
      # Every entity has a $id property, which you'll remember HAS to be unique
      $id: store-1
      name: Bob's Books

  {{#repeat 10}}
  - Book:
      $id: '{tableName}-{{@index}}'
      name: {{faker "lorem.words"}}
      bookShelfId:
        $id: shelf-1
  {{/repeat}}

  - BookShelf:
      $id: shelf-1
      # References look like this - germinator will look up the foreign key and use it for storeId
      storeId: { $id: store-1 }
```

Usually, it helps to look at a real example of germinator. Check out the Dura project's [materials](https://gitlab.servalldatasystems.com/dura/dura-job-manager/blob/develop/lib/dura-models/seeds/materials.yml) seed.

### More Features
- global properties:
  - `synchronize` (boolean | environment[]): define this top-level file property to define whether to keep entities in sync between the file and your database on every run
  - `$env` (environment[]): define this top-level file property to select which NODE_ENVs that this seed should be inserted in
  - `namingStrategy` (string): define this top-level file property to select a column and table name strategy - defaults to SnakeCase, but you can use 'AsIs' for full control
  - `tables` (object of key -> string): define this top-level file property to define a mapping between `MyEntityName` and `tables['MyEntityName']` -> `'real_entity_table_name'`
- entity properties:
  - `$id` (string): as stated before, the globally unique identifier of this particular entity
  - `$idColumnName`: define this per-entity to use a primary key column that's not `id`
  - `$env`: define this per-entity property to select which NODE_ENVs that this entity should be inserted in
  - `$synchronize` (boolean | environment[]): define this per-entity property to define whether to keep it in sync between the file and your database on every run

In templates, we include a bunch of handlebars helpers. In particular:
  - the [handlebars-helpers](https://github.com/helpers/handlebars-helpers/blob/master/README.md#categories) library
  - [handlebars-helper-repeat](https://github.com/helpers/handlebars-helper-repeat#usage-examples)
  - `moment`: format a date with moment.js, default is ISO `{{moment "2020-01-01"}}`, `{{moment someDateValue}}`, `{{moment someDateValue format="MM-YY"}}`, `{{moment someDateValue utc=true}}`
    - `momentAdd`: helper for moment `{{moment someDateValue (momentAdd 3 "days")}}`
    - `momentSubtract`: helper for moment `{{moment someDateValue (momentSubtract 3 "days")}}`
  - `password`: uses bcrypt `{{password "S3curE"}}`, `{{password "S3curE" rounds=20}}`, `{{password "S3curE" insecure=true}}`
  - `faker`: generate fake data using faker.js `{{faker "internet.email"}}`, `{{faker "random.number"}}`, etc.
  - `chance`: generate fake data using chance.js `{{chance "integer"}}`, `{{chance "date" min="2019-01-01" max="2021-01-01"}}`, etc.
