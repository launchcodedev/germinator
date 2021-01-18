# Helpers

### General

We include **all** of the **[handlebar-helpers](https://github.com/helpers/handlebars-helpers/blob/master/README.md#categories)**.
There are over 180 of them, so check them out!

We also include the [repeat](https://github.com/helpers/handlebars-helper-repeat/blob/master/README.md) helper:

```handlebars
{{#repeat 1000 as |i|}}
  $id: book-{{i}}
{{/repeat}}

{{#repeat start=17 count=2}}
  $id: book-{{@index}}
{{/repeat}}
```

### Chance

The `{{chance}}` helper uses [Chance.js](https://chancejs.com/) for random data.

In general, any Chance.js function can be called like `{{chance "fnName"}}` with
arguments proceeding the function name.

| Name | Example |
|||
| Boolean | `{{chance "bool"}}` |
| Integer | `{{chance "integer"}}` |
|| `{{chance "integer" min=0 max=10}}` |
| Float | `{{chance "float"}}` |
| Integer | `{{chance "integer"}}` |
| Prime | `{{chance "prime"}}` |
| Letter | `{{chance "letter"}}` |
| Text | `{{chance "string"}}` |
| Paragraph | `{{chance "paragraph"}}` |
| Sentence | `{{chance "sentence"}}` |
| Word | `{{chance "word"}}` |
| Date | `{{chance "date"}}` |
| First Name | `{{chance "first"}}` |
| Last Name | `{{chance "last"}}` |
| Full Name | `{{chance "name"}}` |
| Email | `{{chance "email"}}` |
| URL | `{{chance "url"}}` |
| City | `{{chance "city"}}` |
| Country | `{{chance "country"}}` |
| Postal | `{{chance "postal"}}` |
| Zip Code | `{{chance "zip"}}` |
| GUID | `{{chance "guid"}}` |

All of the functions listed in [Chance.js](https://chancejs.com/) should be
supported, only a subset are listed here. Arguments that are passed will be
forwarded into Chance.js's generators.

### Faker.js

The `{{faker}}` helper uses [Faker.js](https://marak.github.io/faker.js/) for random data.

In general, any Faker.js function can be called like `{{faker "namespace.method"}}` with
arguments proceeding the function name.

| Name | Example |
|||
| Date | `{{faker "date.past"}}` |
| Phone Number | `{{faker "phone.phoneNumber"}}` |

All of the functions listed in [Faker.js](https://marak.github.io/faker.js/) should be
supported, only a subset are listed here. Arguments that are passed will be
forwarded into Faker.js's generators.

### Moment

The `{{moment}}` helper is useful for handling dates.

| Name | Example |
|||
| Formatting | `{{moment "2019-01-01" format="MM-DD-YY"}}` |
| Parse as UTC | `{{moment "2019-01-01" utc=true}}` |
| Mutations | `{{moment "2019-01-01" "[add,5,days]"}}` |
| | `{{moment "2019-01-01" (momentAdd var "days")}}` |
| | `{{moment "2019-01-01" (momentSubtract var "days")}}` |

### bcrypt

The `{{password}}` helper renders password hashes using [bcrypt](https://www.npmjs.com/package/bcrypt).

| Name | Example |
|||
| Hashing | `{{password "testing"}}` |
| | `{{password "testing" rounds=5}}` |
| Insecure | `{{password "testing" insecure=true}}` |

The insecure option is as it sounds. It's a lot faster than random salts for every password you make though.
This is useful for development environments with 1000s of users, where you want every germinator run to be
a no-op (secure passwords by definition will hash differently every time).

### Custom Helpers

The Node.js API has a `helpers` argument in `runSeeds` and basically any other
functions that use them. You can provide your own helpers on top of those, or
replace them entirely.

```typescript
import { makeHelpers } from '@germinator/helpers';
import { runSeeds } from '@germinator/node';

await runSeeds({
  helpers: {
    ...makeHelpers(),
    myHelper() {
      return 'this is custom!';
    },
  },
  folder: ...,
  db: { ... },
});
```
