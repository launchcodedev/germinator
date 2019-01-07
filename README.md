# Germinator - Postgres TypeORM database seeder
Use YAML files to safely seed postgres databases with mock and real data.

## Why this?
TypeORM doesn't have a common paradigm for running seeds, so germinator aims
to solve that problem in a simple way.

## How does it work?
Germinator exports a single function that accepts a TypeORM connection and a
path to a directory containing both dev and production seeds, it reads in the
yaml files and seeds the appropriate entities with the data.

## Getting started

1. Install in your project:

    ```bash
    yarn add @servall/germinator
    ```

2. Add a `seeds` directory to the root of your project

3. Add a `dev` and `prod` directory under the `seeds` directory

4. Add a new seeds file under `dev` let's call it `users.yaml`

    ```yaml
    entities:
      - User:
          firstName: 'Test'
          lastName: 'User'
    ```

5. Import the package into your index.ts and call run seeds

      ```javascript
      import { runSeeds } from '@servall/germinator';

      const connection = await connect(config.database);

      await runSeeds(connection, '/path/to/seed/directory');
      ```

## Anatomy of the germinator yaml file

- Every geminator yaml file starts with an `entities` key
    ```yaml
    entities:
    ```

- You can then list all the entities and their properties you'd like to insert
    ```yaml
    entities:
      - User:
          firstName: 'Test'
          lastName: 'User'
      - Department:
          description: 'A test department'
    ```

- If you'd like to insert children of an entity you can use the special `refName` and `ref` keys on the entity

    ```yaml
    entities:
      - User:
          firstName: 'Test'
          lastName: 'User'
          refName: 'user-1'
      - Department:
          description: 'A test department'
          user:
            ref: 'user-1'
    ```

- If you'd like to insert sensitive data you can use the `sensitive` keys on the entities props, this will salt and hash the value before insertion

    ```yaml
    entities:
      - User:
          firstName: 'Test'
          lastName: 'User'
          password:
            sensitive: true
            value: 'test123'
    ```
