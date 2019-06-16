# Germinator - Database Seeding
Use YAML files to safely seed databases with mock and real data.

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

### v2 Design
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

### Usage
- Every entity has a globally unique `$id` property, which is enforced
- Reference other entities with `{ $id: other-entity-$id }` which is resolved to that primary key
