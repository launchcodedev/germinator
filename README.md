# Germinator - Database Seeding
Use YAML files to safely seed databases with mock and real data.

## v2 Design
```yaml
germinator: v2
entities:
  - Store:
      $id: store-1
      bookshelfs:
        - $id: shelf-1

  {{#repeat 10}}
  - Book:
      $id: '{tableName}-{{@index}}'
      name: {{faker "lorem.words"}}
  {{/repeat}}

  - BookShelf:
      $id: shelf-1
      books:
        {{#repeat 10}}
        - $id: book-{{@index}}
        {{/repeat}}
```

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
- one2one (which side is relation)
- many2one (tracking children as dependants)
- many2many (join tables)
- deletions - track any $id no longer in files?
- typeorm - integrations?
- would objectionjs be required?

goals:
- 100% test coverage
  - sqlite in-memory tests
  - postgres tests
- incremental adoption without objection or knex required
- cli
