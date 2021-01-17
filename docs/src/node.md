# Node.js API

```typescript
import { renderSeed } from '@germinator/core';
import { makeHelpers } from '@germinator/helpers';

const output = renderSeed(
  `
data:
  books:
    - Moby Dick
    - The Great Gatsby
    - To Kill a Mockingbird
  libraries:
    - Southern
    - Northern

---

bookCollection:
{{#each @root.books as |book|}}
{{#each @root.libraries as |library|}}
  - title: {{book}}
    library: {{library}}
    checkedOutBy: {{chance "name"}}
{{/each}}
{{/each}}
  `,
  makeHelpers(),
);
```
