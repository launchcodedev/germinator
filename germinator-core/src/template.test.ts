import { renderTemplate, renderSeed } from './template';
import { InvalidSeed } from './errors';

describe('renderTemplate', () => {
  it('renders with data properties', () => {
    expect(renderTemplate(`{{foo}}`, { foo: 'bar' })).toBe(`bar`);
  });

  it('renders date objects as ISO strings', () => {
    expect(renderTemplate(`{{now}}`, { now: new Date('2020-01-01T00:00:00.0000Z') })).toBe(
      `2020-01-01T00:00:00.000Z`,
    );
  });

  it('renders nested data properties', () => {
    expect(renderTemplate(`{{foo.bar.baz}}`, { foo: { bar: { baz: true } } })).toBe(`true`);
  });
});

describe('renderSeed', () => {
  it('renders a simple seed file', () => {
    expect(
      renderSeed(`
        entities:
          - Book:
              $id: book-1
      `),
    ).toEqual({ entities: [{ Book: { $id: 'book-1' } }] });
  });

  it('renders using data in top section', () => {
    expect(
      renderSeed(`
        data:
          bookName: The Hobbit

        ---

        entities:
          - Book:
              $id: {{@root.bookName}}
      `),
    ).toEqual({ entities: [{ Book: { $id: 'The Hobbit' } }] });
  });

  it('fails when sections are not separated', () => {
    expect(() =>
      renderSeed(`
        data:
          bookName: The Hobbit

        entities:
          - Book:
              $id: {{@root.bookName}}
      `),
    ).toThrow(InvalidSeed);
  });

  it('fails when there are too many sections', () => {
    expect(() =>
      renderSeed(`
        data:
          bookName: The Hobbit

        ---
        ---

        entities:
          - Book:
              $id: {{@root.bookName}}
      `),
    ).toThrow(InvalidSeed);
  });

  it('fails when top section is empty', () => {
    expect(() =>
      renderSeed(`
        - item

        ---

        entities:
          - Book:
              $id: {{@root.bookName}}
      `),
    ).toThrow(InvalidSeed);
  });
});
