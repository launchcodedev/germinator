# Germinator - Database Seeding
Use YAML files to safely seed databases with mock and real data.

[WIP](https://gitlab.servalldatasystems.com/sol/sol-backend/commit/9c907edbeffc8298cd4b64a6202c428abbefd545) in SOL.

## v2 Design
```handlebars
germinator: v2

# UPDATEs and DELETEs automatically
synchronize: true

# data here can be used in template
data: {}

---
entities:
  - Store:
      # every $id is globally unique
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
      store:
        $id: store-1
```

design:
- $id is a globally unique ID, which is verified before any inserts and used to resolve relationships
- using knex.js for json insert
  - has own migration table (germinator_migration)
  - tracks germinator_seed_entry table for per-entity inserts
- handlebars (for looping and helpers), and mustache w/ single-curly delimeters for props w/ entity context
  - https://github.com/helpers/handlebars-helpers
  - https://github.com/helpers/handlebars-helper-repeat
  - bcrypt support `{{password "test"}}`
  - fakerjs support `{{faker "internet.email"}}`
- support sqlite, postgres, mssql
- built-in naming strategies per-file
- deletions - track any $id no longer in files? (makes mistakes easier)  - `$deleted: true` opt-in?

questions:
- environment specific - `$envs: []` per file, per entity?
- one2one & hasmany (tracking children as dependants)
  - right now, the following works

         - Parent:
             $id: parent-1
         - Child:
             $id: child-1
             parentId:
               $id: parent-1
         - Child:
             $id: child-2
             parentId:
               $id: parent-1
- many2many (join tables)
  - right now, the following works

         - SideA:
             $id: sidea-1
         - SideB:
             $id: sideb-1
         - SideB:
             $id: sideb-2
         - JoinSides:
             $id: joinsides-1
             sideAId:
               $id: sidea-1
             sideBId:
               $id: sideb-1
         - JoinSides:
             $id: joinsides-2
             sideAId:
               $id: sidea-1
             sideBId:
               $id: sideb-2
- objectionjs integrations?
- typeorm integrations?

goals:
- 100% test coverage
  - sqlite in-memory tests
  - postgres tests (in CI too, already working)
- incremental adoption without objection or knex required
- locking table (like knex migrations?)
- environment specific
- cli?
