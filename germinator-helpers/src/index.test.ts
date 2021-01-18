import { renderTemplate } from '@germinator/core';
import { stripIndent } from 'common-tags';
import { makeHelpers } from './index';

const helpers = makeHelpers();
const render = (contents: string, data?: Record<string, any>, h = helpers) =>
  renderTemplate(contents, data ?? {}, h);

describe('helpers', () => {
  it('multiplies', () => {
    expect(render('{{multiply 2 2}}')).toBe('4');
  });
});

describe('repeat', () => {
  it('performs a simple loop', () => {
    expect(
      render(
        stripIndent`
          {{#repeat 10}}
          - item {{@index}}
          {{/repeat}}
        `,
      ),
    ).toMatchSnapshot();
  });
});

describe('array', () => {
  it('creates an array', () => {
    expect(render('{{#each (array "abc" 123 true)}}|{{.}}|{{/each}}')).toBe('|abc||123||true|');
  });
});

describe('concat', () => {
  it('joins properties', () => {
    expect(render('{{concat "abc" 123 true}}')).toBe('abc123true');
  });
});

describe('password', () => {
  it('renders the password helpers', () => {
    expect(render('{{password "test"}}')).toMatch('$2b$10$');
    expect(render('{{password "test" rounds=5}}')).toMatch('$2b$05$');
    expect(render('{{password "test" insecure=true}}')).toEqual(
      render('{{password "test" insecure=true}}'),
    );

    expect(() => render('{{password}}')).toThrow();
    expect(() => render('{{password rounds=1}}')).toThrow();
  });
});

describe('faker', () => {
  it('renders basic string formats', () => {
    expect(render(`{{faker "internet.userName"}}`)).toMatchSnapshot();
    expect(render(`{{faker "internet.email"}}`)).toMatchSnapshot();
    expect(render(`{{faker "lorem.words"}}`)).toMatchSnapshot();
  });

  it('fails with invalid options', () => {
    expect(() => render(`{{faker}}`)).toThrow();
    expect(() => render(`{{faker min=1}}`)).toThrow();
    expect(() => render(`{{faker "invalid"}}`)).toThrow();
  });

  it('doenst render as Object', () => {
    expect(render('{{faker "internet.email"}}')).not.toMatch(/objectObject/);
  });

  it('uses provided arguments', () => {
    expect(render('{{faker "random.number" min=11 max=11}}')).toBe('11');
  });
});

describe('chance', () => {
  it('renders basic chance formats', () => {
    expect(render('{{chance "prefix" full=true}}')).toMatch('Mister');
    expect(render('{{chance "integer" min=11 max=11}}')).toBe('11');
  });

  it('generates date iso string', () => {
    expect(render('{{chance "date"}}')).toMatchSnapshot();
  });

  it('generates date between', () => {
    expect(render('{{chance "date" min="2019-01-01" max="2019-01-02"}}')).toMatch('2019-01-01');
  });

  it('generates pickone', () => {
    expect(render('{{chance "pickone" (array "First" "Second" "Third")}}')).toBe('First');
  });

  it('generates function with multiple arguments', () => {
    expect(render('{{chance "pad" 45 5}}')).toBe('00045');
  });
});

describe('moment', () => {
  it('renders a simple date', () => {
    expect(render(`{{moment "2019-01-01"}}`)).toMatch('2019-01-01');
  });

  it('uses the format argument', () => {
    expect(render(`{{moment "2019-01-01" format="MM-DD-YY"}}`)).toMatch('01-01-19');
  });

  it('uses the utc argument', () => {
    expect(render(`{{moment "2019-01-01" utc=true}}`)).toMatch('2019-01-01T00:00:00.000Z');
  });

  it('can "add" days', () => {
    expect(render(`{{moment "2019-01-01" "[add,5,days]"}}`)).toMatch('2019-01-06');
    expect(render(`{{moment "2019-01-01" "[add,{{x}},days]"}}`, { x: 5 })).toMatch('2019-01-06');
  });

  it('can "add" and "subtract" days using variables', () => {
    expect(
      render(
        stripIndent`
          {{#repeat start=1 count=1 as |c|}}
            {{moment "2019-01-01" (concat "[add," c ",days]")}}
          {{/repeat}}
        `,
      ),
    ).toMatch('2019-01-02');

    expect(
      render(
        stripIndent`
          {{#repeat start=1 count=1 as |c|}}
            {{moment "2019-01-01" (momentAdd c "days")}}
          {{/repeat}}
        `,
      ),
    ).toMatch('2019-01-02');

    expect(
      render(
        stripIndent`
          {{#repeat start=1 count=1 as |c|}}
            {{moment "2019-01-01" (momentSubtract c "days")}}
          {{/repeat}}
        `,
      ),
    ).toMatch('2018-12-31');
  });

  it('renders a Date object correctly', () => {
    expect(render(stripIndent`{{moment d}}`, { d: new Date('2000-01-01') })).toMatch('2000-01-01');
  });
});
