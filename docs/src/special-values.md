# Special Values

### $idColumnName

A `string` or `string[]` that defines what the primary key columns are. When this
property is omitted, germinator will assume that `id` is the one primary key.

### namingStrategy and $namingStrategy

Can be `AsIs` or `SnakeCase`. This maps table and column names before performing SQL queries.

`namingStrategy` is a top-level property. `$namingStrategy` is an override per-entry.

### schemaName and $schemaName

Defines what _database schema_ to use when performing queries.

`schemaName` is a top-level property. `$schemaName` is an override per-entry.

### synchronize and $synchronize

Defines whether to UPDATE or DELETE this entry in future runs of germinator.

`synchronize` is a top-level property. `$synchronize` is an override per-entry.

### $env

Defines when this seed entry should be executed, depending on `NODE_ENV`.

`$env` is a top-level property, and can be overriden per-entry.

### tableMapping

An object that defines a map of `NickName` -> `real_table_name`. Useful for legacy
DBs where a user-friendly name isn't possible.

`tableMapping` is a top-level property.

### Inline String Variables

String properties can utilize some specific variables, surrounded in `{}` delimiters.

```yaml
entities:
{{#repeat 1000}}
  - TableA:
      $id: '{tableName}-{{@index}}'
{{/repeat}}
```

Notice that `{tableName}` is in single curlies - this substitution is done after
YAML is parsed. Specifically, `tableName` is the normalized table name according
to the namingStrategy (in this case, `table_a`).
