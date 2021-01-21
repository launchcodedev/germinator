# Introduction

Germinator is a database seeding tool.

It reads [YAML](https://yaml.org/) files that are templated using [Handlebars](https://handlebarsjs.com/).

It's well suited for:

- Development fixture data to emulate a "production-ish" environment
- Generating real-looking data using random generators ([faker.js](https://marak.github.io/faker.js/) and [chance.js](https://chancejs.com/))
- Canonical production data which is not changed by users
- One-off data dumps based on YAML/JSON structures

Germinator has a **CLI**, a **Docker Image** and a **Node.js API**. They all do essentially the same thing.

An example of a germinator seed file:

```yaml
germinator: v2

# This flag tells germinator if it should UPDATE and DELETE entries
synchronize: true

# Optionally, seeds can respect NODE_ENV
$env: [dev, test, qa]

# Data defined here is passed as template data below the separator
data:
  employees: 1000
  positions:
    - janitor
    - chef
    - server

---

# A list of all the database rows you want germinator to create
entities:
  {{#each positions as |position|}}
  - Position:
      $id: 'position-{{position}}'
      name: {{position}}

  {{#repeat @root.employees}}
  - Employee:
      $id: '{tableName}-{{@index}}-{{position}}'
      fullName: {{chance "name"}}
      email: {{chance "email"}}
      position: { $id: 'position-{{position}}' }
  {{/repeat}}
  {{/each}}
```

If we made `employees: 10`, germinator would do the following:

```sql
insert into `position` (`name`) values ('janitor')
insert into `position` (`name`) values ('chef')
insert into `position` (`name`) values ('server')

insert into `employee` (`full_name`, `position`) values ('Seth Tran', 1)
insert into `employee` (`full_name`, `position`) values ('Isaiah Erickson', 1)
insert into `employee` (`full_name`, `position`) values ('Winifred Barnes', 1)
insert into `employee` (`full_name`, `position`) values ('Scott Collins', 1)
insert into `employee` (`full_name`, `position`) values ('Todd Houston', 1)
insert into `employee` (`full_name`, `position`) values ('Elijah Watson', 1)
insert into `employee` (`full_name`, `position`) values ('Isabelle Anderson', 1)
insert into `employee` (`full_name`, `position`) values ('Jeff Glover', 1)
insert into `employee` (`full_name`, `position`) values ('Ophelia Woods', 1)
insert into `employee` (`full_name`, `position`) values ('Patrick Wilkerson', 1)

insert into `employee` (`full_name`, `position`) values ('Troy Nichols', 2)
insert into `employee` (`full_name`, `position`) values ('Mayme Jones', 2)
insert into `employee` (`full_name`, `position`) values ('David Rice', 2)
insert into `employee` (`full_name`, `position`) values ('Beatrice Lawson', 2)
insert into `employee` (`full_name`, `position`) values ('Daniel Robertson', 2)
insert into `employee` (`full_name`, `position`) values ('Ruth McDonald', 2)
insert into `employee` (`full_name`, `position`) values ('Brian Conner', 2)
insert into `employee` (`full_name`, `position`) values ('Dora Lawrence', 2)
insert into `employee` (`full_name`, `position`) values ('Eugenia Rhodes', 2)
insert into `employee` (`full_name`, `position`) values ('Daniel Nunez', 2)

insert into `employee` (`full_name`, `position`) values ('Alberta Long', 3)
insert into `employee` (`full_name`, `position`) values ('Paul Miller', 3)
insert into `employee` (`full_name`, `position`) values ('Georgie Mathis', 3)
insert into `employee` (`full_name`, `position`) values ('Jean Elliott', 3)
insert into `employee` (`full_name`, `position`) values ('Michael Edwards', 3)
insert into `employee` (`full_name`, `position`) values ('Jay Gomez', 3)
insert into `employee` (`full_name`, `position`) values ('Clifford Cooper', 3)
insert into `employee` (`full_name`, `position`) values ('Lou Fitzgerald', 3)
insert into `employee` (`full_name`, `position`) values ('Samuel Owen', 3)
insert into `employee` (`full_name`, `position`) values ('Kyle Simmons', 3)
```

## Principles

1. Seed entries (which map to database rows) should be _globally_ uniquely identifiable via `$id`
2. Seeds are a collection of these entries, divided into an unordered pool of files
3. Insertion order is defined by foreign keys, and otherwise will be resolved optimally
4. Seed entries can be marked as "synchronized", which allows them to be edited and deleted
5. Seed files should be ergonomic and easy to read, with naming strategy support

## Features

- Provides many [template helpers](./helpers.md) to help you write fixtures
- Supports synchronized seeds - easy to add to your server startup
- Supports inter-entry references to auto-populate foreign keys
- Supports environment-specific seeds
- Supports custom `namingStrategy` and `tables` mapping

<br />

Germinator is ORM and database agnostic. It's usable without Node.js, and is
designed to be deployed using Docker.

It's a great solution for one-offs, or for long-lived canonical data.

Other noteable features:

- [bcrypt](./helpers.md#bcrypt) password hashing
- [moment.js](./helpers.md#moment) date handling
- [faker and chance](./helpers.md) libraries for realistic data fixtures
- custom primary key names (default is `id`), and composite IDs
