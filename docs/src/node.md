# Node.js API

Germinator is a Node.js module, so a programmatic API is available.

A subset of Germinator functionality is available in a browser-compatible format.

```typescript
import { renderSeed } from '@germinator/core';
import { makeHelpers } from '@germinator/helpers';

const template = `
data:
  books:
    - Moby Dick
    - The Great Gatsby
    - To Kill a Mockingbird
  libraries:
    - Southern
    - Northern

---

bookCollection:
{{#each @root.books as |book|}}
{{#each @root.libraries as |library|}}
  - title: {{book}}
    library: {{library}}
    checkedOutBy: {{chance "name"}}
{{/each}}
{{/each}}
`;

const output = renderSeed(template, makeHelpers());
```

The output here will be an object that looks like:

```js
{
  bookCollection: [
    {
      title: 'Moby Dick',
      library: 'Southern',
      checkedOutBy: 'Seth Tran',
    },
    {
      title: 'Moby Dick',
      library: 'Northern',
      checkedOutBy: 'Isaiah Erickson',
    },
    {
      title: 'The Great Gatsby',
      library: 'Southern',
      checkedOutBy: 'Winifred Barnes',
    },
    {
      title: 'The Great Gatsby',
      library: 'Northern',
      checkedOutBy: 'Scott Collins',
    },
    {
      title: 'To Kill a Mockingbird',
      library: 'Southern',
      checkedOutBy: 'Todd Houston',
    },
    {
      title: 'To Kill a Mockingbird',
      library: 'Northern',
      checkedOutBy: 'Elijah Watson',
    },
  ];
}
```

## Database Seeds

Of course, normal germinator functionality is available as well.

```typescript
import { runSeeds } from '@germinator/node';
import { makeHelpers } from '@germinator/helpers';

await runSeeds(
  {
    helpers: makeHelpers(),
    folder: `${__dirname}/seeds`,
    db: {
      client: 'postgres',
      pool: { min: 1, max: 1 },
      connection: {
        host: 'localhost',
        port: 5432,
        user: 'admin',
        password: 's3cur3',
      },
    },
  },
  {
    // optional runtime properties
    dryRun: false,
    noTracking: false,
  },
);
```

The API accepts a `Knex` instance as `db`, and an array of `SeedFile` objects
instead of `folder` if you want to manually construct them.
