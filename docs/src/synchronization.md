# Synchronization

In germinator, seed entries are explicitly "synchronized" or "non-synchronized".
The simplest way to explain this term is the question "should germinator update
this database row when it's re-run and field values have changed?".

The longer definition:

- Germinator will UPDATE the row when any field value resolves differently
- Germinator will DELETE the row if it's found to be missing in subsequent runs

This behavior is opt-in via the top-level `synchronize` or per-entry `$synchronize`.

```yaml
germinator: v2
synchronize: true

entities:
  - TableA:
      $id: table-a-1
      $synchronize: false
```

### A note on `--noTracking`

You can opt-out of all synchronization via the `--noTracking` flag in the CLI.
We don't really recommend this, but it's a supported use case. Note that even
if you don't need to synchronize values, it's still useful to track inserted values.
Otherwise, germinator has no choice but to re-insert the same seed every time
it's run.
