import { renderTemplate, renderSeed } from './template';

describe('render template', () => {
  test('blank contents', () => {
    expect(renderTemplate('', {})).toBe('');
  });

  test('template data', () => {
    expect(renderTemplate('{{a}}', { a: 1 })).toBe('1');
  });

  test('handlebars helpers', () => {
    expect(renderTemplate('{{add 2 2}}', {})).toBe('4');
  });

  test('handlebars repeat', () => {
    expect(renderTemplate(`
      {{#repeat 10}}{{@index}}{{/repeat}}
    `, {})).toMatch('0123456789');
  });

  test('handlebars repeat with root context', () => {
    // this was an upstream bug in handlebars-helper-repeat
    expect(renderTemplate(`
      {{#repeat 10}}{{@root.a}}{{/repeat}}
    `, { a: 1 })).toMatch('1111111111');
  });

  test('password', () => {
    expect(renderTemplate('{{password "test"}}', {})).toMatch('$2b$10$');
    expect(renderTemplate('{{password "test" rounds=5}}', {})).toMatch('$2b$05$');
    expect(
      renderTemplate('{{password "test" insecure=true}}', {}),
    ).toEqual(
      renderTemplate('{{password "test" insecure=true}}', {}),
    );

    expect(() => renderTemplate('{{password}}', {})).toThrow();
    expect(() => renderTemplate('{{password rounds=1}}', {})).toThrow();
  });

  test('faker', () => {
    expect(renderTemplate('{{faker "internet.userName"}}', {})).toMatch(/\w+/);
    expect(renderTemplate('{{faker "internet.email"}}', {})).toMatch(/@/);
    expect(renderTemplate('{{faker "lorem.words"}}', {})).toBeTruthy();

    expect(() => renderTemplate('{{faker}}', {})).toThrow();
    expect(() => renderTemplate('{{faker min=1}}', {})).toThrow();
    expect(() => renderTemplate('{{faker "invalid"}}', {})).toThrow();
  });

  test('faker context bug', () => {
    expect(renderTemplate('{{faker "internet.email"}}', {})).not.toMatch(/objectObject/);
  });

  test('faker with arguments', () => {
    expect(renderTemplate('{{faker "random.number" min=11 max=11}}', {})).toBe('11');
  });
});

describe('render seed', () => {
  test('blank seed', () => {
    expect(renderSeed('')).toEqual({});
  });

  test('single section seed', () => {
    expect(renderSeed(`
      germinator: v2
      entities: []
    `)).toEqual({ germinator: 'v2', entities: [] });
  });

  test('split section seed', () => {
    expect(renderSeed(`
      germinator: v2
      ---
      entities: []
    `)).toEqual({ germinator: 'v2', entities: [] });

    expect(() => renderSeed(` ---\n ---\n`)).toThrow();
  });

  test('seed rendering', () => {
    expect(renderSeed(`
      entities:
        {{#repeat 3}}
        - {}
        {{/repeat}}
    `)).toEqual({ entities: [{}, {}, {}] });
  });

  test('seed template data', () => {
    expect(renderSeed(`
      data:
        people:
          - jack
          - jill

      ---
      entities:
        {{#each people}}
        - {{.}}
        {{/each}}
    `)).toEqual({ entities: ['jack', 'jill'] });

    expect(() => renderSeed(`
      data: {}
      entities: []
    `)).toThrow();
  });

  test('seed faker seed', () => {
    expect(renderSeed(`
      fakerSeed: 11
      ---
      entities:
        - {{faker "random.number"}}
    `)).toEqual({ entities: [18026] });

    expect(() => renderSeed(`
      fakerSeed: 11
      entities: []
    `)).toThrow();
  });
});
