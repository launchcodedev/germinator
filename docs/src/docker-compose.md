# Using in Docker Compose

Run Germinator beside your database instance in docker-compose.

```yaml
services:
  my-db:
    image: postgres:12
    environment:
      - POSTGRES_USER=admin
      - POSTGRES_PASSWORD=pwd
      - POSTGRES_DB=my-db
    ports:
      - 5432:5432

  seed:
    image: joelgallant/germinator
    command: /seeds
    volumes:
      - ./seeds:/seeds
    environment:
      - NODE_ENV=development
      - GERMINATOR_CLIENT=postgres
      - GERMINATOR_HOSTNAME=my-db
      - GERMINATOR_PORT=5432
      - GERMINATOR_DATABASE=my-db
      - GERMINATOR_USER=admin
      - GERMINATOR_PASS=pwd
    links:
      - my-db
```

Here, we have a folder in `./seeds` that's mounted into `/seeds`.
