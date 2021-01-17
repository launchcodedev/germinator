import Handlebars from 'handlebars';
import { load } from 'js-yaml';
import { mapper, DataType } from '@lcdev/mapper';
import { InvalidSeed } from './errors';

type Obj = Record<string, any>;
type AnyFunction<Args extends any[] = any[], Ret = any> = (...args: Args) => Ret;

export type Helpers = Record<string, AnyFunction>;

export function renderTemplate(contents: string, data: Obj, helpers?: Helpers): string {
  // any date objects, which YAML has first-class support for, need to be stringified when rendering
  const safeData = mapper(data, {
    [DataType.Date]: (v) => v.toISOString(),
  }) as Obj;

  // strip out all YAML comments before rendering handlebars
  const safeContents = contents.replace(/^\s*#.*$/gm, '');

  return Handlebars.compile(safeContents)(safeData, { helpers });
}

export function renderSeed(contents: string, helpers?: Helpers): Obj {
  // using --- break between non-template and templated sections
  const split = contents.split(/\s---\n/);

  let topSection: string | undefined;
  let templateSection: string;

  if (split.length === 2) {
    [topSection, templateSection] = split;
  } else if (split.length === 1) {
    [templateSection] = split;
  } else {
    throw new InvalidSeed('Including too many --- breaks');
  }

  const templateData = {};
  const seed = {};

  // the top section declares data structures which are consumed in the bottom section
  if (topSection) {
    const props = load(renderTemplate(topSection, {}, helpers));

    if (props) {
      if (typeof props !== 'object' || Array.isArray(props)) {
        throw new InvalidSeed(`Top section of YAML file was not an object`);
      }

      // `data` key is used to feed the handlebar template
      if ('data' in props) {
        const propsWithData = props as { data?: object };
        Object.assign(templateData, propsWithData.data);
        delete propsWithData.data;
      }

      Object.assign(seed, props);
    }
  }

  Object.assign(seed, load(renderTemplate(templateSection, templateData, helpers)));

  if ('data' in seed) {
    throw new InvalidSeed("Seed included a 'data' key, but did not use a --- separator");
  }

  return seed;
}
