# Relationships

Germinator tries to be smart about dependencies and references between entries.
Because of the enforced globally unique `$id` fields, we can allow your seeds
to reference each other from within files.

A simple relationship looks like:

```yaml
germinator: v2
synchronize: true

entities:
  - Position:
      $id: position-janitor
      name: Janitor

  - Employee:
      $id: bob-joe
      fullName: Bob Joe
      positionId:
        $id: position-janitor
```

This looks pretty innocent, but the magic happens in the `$id: position-janitor`.

When germinator runs the seed, it knows a few things:

1. the `employee.position_id` column is a foreign key referencing `position.id`
2. when creating `bob-joe`, we need to create `position-janitor` first, to populate `position_id`

When you don't specify `$idColumnName`, germinator assumes that your tables have an `id` field.

We can be more explicit:

```yaml
germinator: v2
synchronize: true

entities:
  - Position:
      $id: position-janitor
      $idColumnName: guid
      name: Janitor

  - Employee:
      $id: bob-joe
      fullName: Bob Joe
      positionGuid:
        $id: position-janitor
        $idColumn: guid
```

### Composite IDs

Germinator has support for composite IDs. How you set this up is fairly straightforward.

```yaml
germinator: v2
synchronize: true

entities:
  - BlogPostCategories:
      $id: post1-category1
      $idColumnName: [post_id, category_id]
      postId:
        $id: post1
      categoryId:
        $id: category1

  - ReferenceToCompositeTable:
      $id: foobar
      referencePostId:
        $id: post1-category1
        $idColumn: post_id
      referenceCategoryId:
        $id: post1-category1
        $idColumn: category_id
```

This setup is manual, but mostly by design. We don't want to hide what's going
on in the SQL layer.

### Diamond Dependencies and Delete Order

Germinator can occasionally stumble when deleting many entries that rely on each
other. Unfortunately, this is a limitation because of the way we store information
about entered seeds.

Germinator will delete seeds in inverse-insertion order, so most of the time things
work out. But you should be aware of this limitation in case you need to delete
entries manually.

You're free to delete rows that germinator created, if you know that they will be
removed next time germinator is run.
