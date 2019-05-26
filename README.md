# Germinator - Database Seeding
Use YAML files to safely seed databases with mock and real data.

## v2 Design
```yaml
germinator: v2
entities:
  - Store:
      $ref: store1
  - Book:
      $ref: book1
      name: Name
  - Book:
      $ref: book2
      name: Name
  - BookShelf:
      $ref: shelf1
      store:
        $ref: store1
      books:
        - $ref: book1
        - $ref: book2
```

design:
- using knex.js (not sure if objection will be required)
- support sqlite
- store refs - germinator_seed_entry tracks $ref as a globally unique ID (allows new entries in a file)
- fakerjs built in ($mock property)
- bcrypt support

questions:
- many2one (tracking children as dependants)
- many2many (join tables)
- typeorm tie in
- deletions - track anything in germinator_seed_entry no longer in files?
