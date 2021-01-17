# A database seeder for the farmer within you

```sh
# mount a folder with YAML files in it, and run against a database
docker run -it --rm \
  -v $(realpath seeds):/seeds \
  joelgallant/germinator /seeds -c sqlite3 --filename /db.sqlite
```

```sh
npx germinator -c postgres -d my_db -p 5432 -u joel -p s3cur3
```
