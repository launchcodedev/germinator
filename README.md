# Germinator - Database Seeding
Use YAML files to safely seed databases with mock and real data.

## v2 Design
```yaml
germinator: v2
entities:
  - Store:
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

see tests for examples

design:
- using knex.js
  - own migration table (germinator_migration)
  - tracks germinator_seed_entry table for per-entity inserts
- handlebars (for looping and helpers), and mustache w/ single-curly delimeters for props w/ entity context
- fakerjs built in through handlebars
- support sqlite, postgres, mssql
- $id is a globally unique ID, which is verified before any inserts
- bcrypt support through handlebars
- built-in naming strategies

questions:
- one2one (which side is relation) - same relative problem as hasmany
- hasmany (tracking children as dependants)
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
- deletions - track any $id no longer in files? - $deleteIfMissing opt-in?
- typeorm - integrations?
- is objectionjs required?
- tracking change when migrations affect schema
  - I basically assume that seeds run on top of the latest migration, and if they weren't (some), then those won't get UPDATE (though they will throw an error currently, because object changes are tracked)
    - is it better to delete ($deleteIfMissing?) & create a new entry ($id essentially) every time schema changes?

goals:
- 100% test coverage
  - sqlite in-memory tests
  - postgres tests
- incremental adoption without objection or knex required
- cli
