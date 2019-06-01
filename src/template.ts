import * as Handlebars from 'handlebars';
import * as YAML from 'js-yaml';
import * as faker from 'faker';
import * as bcrypt from 'bcrypt';
import { get } from 'lodash';
import {
  InvalidSeed,
  TemplateError,
} from './seed';

// insecure password hashed cache - uses same salt for all passwords!
// hashSync is really slow so this is useful for mock data
const passwordCache: { [plainText: string]: string } = {};

export const loadFileContents = (contents: string) => {
  // using --- break between non-template and templated sections
  const split = contents.split('---');

  let topSection: string | undefined;
  let templateSection: string;

  if (split.length === 2) {
    [topSection, templateSection] = split;
  } else if (split.length === 1) {
    templateSection = split[0];
  } else {
    throw new InvalidSeed('Including too many --- breaks');
  }

  const data = {};
  const seed = {};
  let fakerSeed = 42;

  if (topSection) {
    const props = YAML.safeLoad(topSection);

    // `data` key is used to feed the handlebar template
    if (props.data) {
      Object.assign(data, props.data);
      delete props.data;
    }

    // `fakerSeed` key is used to change the random seed of faker.js
    if (props.fakerSeed) {
      fakerSeed = props.fakerSeed;
      delete props.fakerSeed;
    }

    Object.assign(seed, props);
  }

  // faker has to act deterministically, per-file, for object hashes to match correctly
  faker.seed(fakerSeed);

  const renderedContents = Handlebars.compile(templateSection)(data, {
    helpers: {
      ...require('handlebars-helpers')(),
      repeat: require('handlebars-helper-repeat-root-fixed'),
      password(password?: string, ctx?: { hash: { rounds?: number, insecure?: boolean } }) {
        if (!password || typeof password === 'object') {
          throw new TemplateError('password helper requires password {{password "pwd"}}');
        }

        const rounds = ctx && ctx.hash && ctx.hash.rounds || 10;
        const insecure = ctx && ctx.hash && ctx.hash.insecure;

        if (insecure) {
          if (!passwordCache[password]) {
            passwordCache[password] = bcrypt.hashSync(password, rounds);
          }

          return passwordCache[password];
        }

        return bcrypt.hashSync(password, rounds);
      },
      faker(name: string | object | undefined, ctx: { hash: any }) {
        if (!name || typeof name === 'object') {
          throw new TemplateError('faker helper requires data type {{faker "email"}}');
        }

        const fn = get(faker, name);

        if (!fn) {
          throw new TemplateError(`${name} is not a valid faker.js value type`);
        }

        return fn(Object.keys(ctx.hash).length > 0 ? ({ ...ctx.hash }) : undefined);
      },
    },
  });

  Object.assign(seed, YAML.safeLoad(renderedContents));

  return seed;
};
