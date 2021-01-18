# Templates

Germinator uses Handlebars. They render into YAML output, which then feeds
Germinator's database entries. You could just use templates to generate plain
objects, instead of database entries.

### Handlebars Tips

Prefix your $ids logically, like 'qa-employee-1'. This allows adding other
categorical entities easier (demo-employee-1).

Leverage the template system as much as you can, avoid repetition as much as you
can. Driving your seeds this way makes it easy to scale up (go from 20 sample employees to 500).
