# Templates

Germinator uses Handlebars. They render into YAML output, which then feeds
Germinator's database entries. You could just use templates to generate plain
objects, instead of database entries.

### Handlebars Tips

Prefix your $ids logically, like 'qa-employee-1'. This allows adding other
categorical entities easier (demo-employee-1).

Leverage the template system as much as you can, avoid repetition as much as you
can. Driving your seeds this way makes it easy to scale up (go from 20 sample employees to 500).

## Examples

An admin user for developers and QA deployments. Not synchronized because `password`
is not deterministic, and the user account should not change after first inserted.

```yaml
germinator: v2
synchronize: false
$env: [dev, qa]

---

entities:
  - User:
      $id: admin-user
      emailAddress: admin@example.com
      password: {{password "testing"}}
```

Some random company entries in a CRM.

```yaml
germinator: v2
synchronize: true
$env: [dev, qa]

---

entities:
  {{#repeat 500}}
  - Company:
      $id: company-{{@index}}
      name: {{{chance "company"}}}
      phoneNumber: {{chance "phone"}}
      emailAddress: {{chance "email"}}
      addressId:
        $id: company-{{@index}}-address

  - Address:
      $id: company-{{@index}}-address
      city: {{chance "city"}}
      streetAddress: {{chance "address"}}
      postalCode: {{chance "postal"}}
  {{/repeat}}
```

Using top section `data` to feed bottom section template.

```yaml
germinator: v2
synchronize: true

data:
  calendar:
    {{#repeat 20 as |n|}}
    {{#with (multiply n 2) as |weeks|}}
    - date: {{moment "2021-01-01" (momentAdd weeks "weeks")}}
    {{/with}}
    {{/repeat}}

---

entities:
  {{#each @root/calendar as |event i|}}
  - CalendarEvent:
      $id: calendar-event-{{i}}
      startDate: {{moment event.date (momentAdd 6 "hours")}}
      endDate: {{moment event.date (momentAdd 14 "hours")}}
  {{/each}}
```
