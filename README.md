# A database seeder for the farmer within you

```
docker run -it --rm \
  -v (realpath seeds):/seeds \
  -e DEBUG='germinator:*' \
  joelgallant/germinator /seeds -c sqlite3 --filename /db.sqlite
```
