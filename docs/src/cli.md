# Command Line

1.  Run through NPM:

        npx germinator --help

2.  Run through Docker:

        docker run -it --rm joelgallant/germinator --help

        docker run -it --rm \
          -v $(realpath seeds):/seeds \
          joelgallant/germinator /seeds -c sqlite3 -o /seeds/db

### Dry Run Mode

Tries to do as much as possible, without INSERTs or UPDATEs.

### No Tracking Mode

Runs germinator as normal, but does not track previously inserted entries. Should
only be used for one-offs.

Advantage is that germinator doesn't need to create tables in your database to track.
