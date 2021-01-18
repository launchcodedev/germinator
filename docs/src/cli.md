# Command Line

1.  Run through NPM:

        npx germinator --help

2.  Run through Docker:

      ```
      docker run -it --rm joelgallant/germinator --help
      ```

      It's normal to mount a folder for germinator to read from.

      ```
      docker run -it --rm \
        -v $(realpath seeds):/seeds \
        joelgallant/germinator /seeds -c sqlite3 -o /seeds/db
      ```

#### Options:

```
  -C, --cwd         Runs germinator in a different directory               [string]
  -c, --client      What kind of database to connect to     ["postgres", "sqlite3"]
  -h, --hostname    Hostname of the database                 [default: "localhost"]
  -p, --port        Port of the database                                   [number]
  -d, --database    Database name                                          [string]
  -o, --filename    Filename for SQLite databases (:memory: will work)     [string]
  -u, --user        Username to connect with                               [string]
      --pass        Password for the user                                  [number]
      --dryRun      Does not run INSERT or UPDATE                         [boolean]
      --noTracking  Does not track inserted entries                       [boolean]
```

### Dry Run Mode

Tries to do as much as possible, without INSERTs or UPDATEs. Useful for checking the effect of changes to seeds.

Run with `--dryRun`. Will print SQL that germinator would have run, with a few exceptions.

### No Tracking Mode

Run with `--noTracking`, which will not track inserted entries. The advantage of
this is that germinator doesn't need to create tables in your database.

This mode should only be used for one-off seed insertions.
