# Germinator - Database Seeding
Use YAML files to safely seed databases with mock and real data.

Germinator is well suited for fake data, production seed data, and one-shot database insertions.

### Features
- [x] Templated (handlebars.js) seed files for easy repetition and data-driven seeds
- [x] Auto-synchronization of seeds per-entity, which will UPDATE and DELETE automatically (opt-in with `synchronize`)
- [x] ORM/Database agnostic database layer with auto snake-case (or custom) naming schemes (no TypeORM or Objection required!)
- [x] Environment specific seeds, per-file and per-entity
- [x] Included helpers for fake data (fakerjs and chance) and a big utility belt (moment, handlebars helpers, etc)
- [x] Seeded random data generators for consistent fake data
- [x] Seeded and non-seeded bcrypt password generation
- [ ] Auto-locking tables to avoid seeding conflicts
- [ ] Built-in CLI
- [ ] Multi-column primary keys
- [ ] Structural global `$id`s

### Core Ideas
We won't try to confuse you with terminology and any special instructions. Using germinator
should be really simple - if it's not then upstream patches are appreciated.

1. You can picture germinator as collecting a group of YAML files from a given folder, and merging them together
2. Once files are merged, each "entry" is equivalent to a database record/row - they have to be uniquely identifiable
  1. To mark entries as unique, we using a special `$id` property - this is a **globally** unique string per-record
3. Files are processed by rendering it as a Handlebars template - we have many built-in helpers for this
4. Reference any other entities with `{ $id: other-entity-$id }` which is resolved to the primary key of that record
5. Any entries that are marked as 'synchronize' will be updated and/or deleted when that corresponding seed entry changes

### Example
No better way to demonstrate concepts than an example:

```handlebars
germinator: v2

# Set this to true if all entries should be automatically updated and deleted when this file changes.
synchronize: true

# Set this for the entire file - respects NODE_ENV
$env: [dev, test, qa, staging]

# Template data here is optional, but anything you define here is available to handlebars below the ---
data:
  myKey: 42

---

# Entities is a list of your entries/records/rows/entities
entities:
  # An entity starts with a name, which is the table name
  - Store:
      # Every $id has to be globally unique
      $id: store-1

  {{#repeat 10}}
  - Book:
      $id: '{tableName}-{{@index}}'
      name: {{faker "lorem.words"}}
      bookShelfId:
        $id: shelf-1
  {{/repeat}}

  - BookShelf:
      $id: shelf-1
      storeId:
        # Reference the store-1 via { $id: store-1 }
        $id: store-1
```

### Additional features
- `namingStrategy`: define this per-file to select a column and table name strategy - defaults to SnakeCase
- `$idColumnName`: define this per-entry to use a primary key column that's not `id`
- handlebars helpers
  - all of `handlebars-helpers`
  - `handlebars-helper-repeat`
  - `moment`, `momentAdd`, `momentSubtract`: helpers for dates
  - `password`: hashes with bcrypt
  - `faker`: fakerjs
  - `chance`: chancejs
