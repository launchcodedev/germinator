import * as Handlebars from 'handlebars';
import * as YAML from 'js-yaml';
import * as faker from 'faker';
import { Chance } from 'chance';
import * as bcrypt from 'bcrypt';
import * as moment from 'moment';
import { get } from 'lodash';
import {
  InvalidSeed,
  TemplateError,
} from './seed';

// insecure password hashed cache - uses same salt for all passwords!
// hashSync is really slow so this is useful for mock data
const passwordCache: { [plainText: string]: string } = {};
const insecurePasswordSalt = '$2b$10$lAuv4qM.z6qZwQ/WhmHvEu';

export const renderTemplate = (
  contents: string,
  data: any,
  chance: Chance.Chance = new Chance(),
) => {
  return Handlebars.compile(contents)(data, {
    helpers: {
      ...require('handlebars-helpers')(),
      repeat: require('handlebars-helper-repeat-root-fixed'),
      concat(...args: any[]) {
        return args.slice(0, args.length - 1).join('');
      },
      moment(
        date?: string,
        ...args: (string | {
          hash: {
            format?: string;
            utc?: boolean;
            [op: string]: string | any;
          },
          data: {
            root: any,
            [key: string]: any;
          },
        })[]
      ) {
        if (!date || typeof date !== 'string') {
          throw new TemplateError('moment helper requires a date {{moment date}}');
        }

        const [ctx] = args.splice(-1, 1);
        const hash = ctx && typeof ctx !== 'string' && ctx.hash || {};
        const data = ctx && typeof ctx !== 'string' && ctx.data || { root: {} };

        const { format, utc } = hash;

        let value = utc ? moment.utc(date) : moment(date);

        for (const arg of args) {
          if (!arg || typeof arg !== 'string') {
            throw new TemplateError(
              'moment helper received an undefined argument (did you forget to quote an operation? "[add,days,5]")',
            );
          }

          try {
            let op = YAML.safeLoad(
              // we actually render this string, so that "[add,{{x}},days]" is convenient
              renderTemplate(arg, { ...data.root, ...data, root: undefined }, chance),
            );

            if (!Array.isArray(op)) {
              // {{moment "utcdate" utc=true local}}
              op = [op];
            }

            const [method, ...methodArgs] = op;

            if (!(value as any)[method]) {
              throw new TemplateError(`no such moment operation existed (${method})`);
            }

            value = (value as any)[method](...methodArgs);
          } catch (err) {
            throw new TemplateError(`failed to parse "${arg}" moment helper argument`);
          }
        }

        return format ? value.format(format) : value.toISOString();
      },
      momentAdd(count: number, period: string) {
        if (count === undefined || typeof count !== 'number') {
          throw new TemplateError('momentAdd helper requires {{momentAdd 5 "days"}}');
        }

        if (period === undefined || typeof period !== 'string') {
          throw new TemplateError('momentAdd helper requires {{momentAdd 5 "days"}}');
        }

        return `[add,${count},${period}]`;
      },
      momentSubtract(count: number, period: string) {
        if (!count || typeof count !== 'number') {
          throw new TemplateError('momentSubtract helper requires {{momentSubtract 5 "days"}}');
        }

        if (!period || typeof period !== 'string') {
          throw new TemplateError('momentSubtract helper requires {{momentSubtract 5 "days"}}');
        }

        return `[subtract,${count},${period}]`;
      },
      password(password?: string, ctx?: { hash: { rounds?: number, insecure?: boolean } }) {
        if (!password || typeof password !== 'string') {
          throw new TemplateError('password helper requires password {{password "pwd"}}');
        }

        const rounds = ctx && ctx.hash && ctx.hash.rounds || 10;
        const insecure = ctx && ctx.hash && ctx.hash.insecure;

        if (insecure) {
          if (!passwordCache[password]) {
            passwordCache[password] = bcrypt.hashSync(password, insecurePasswordSalt);
          }

          return passwordCache[password];
        }

        return bcrypt.hashSync(password, rounds);
      },
      faker(name: string | object | undefined, ctx?: { hash: any }) {
        if (!name || typeof name === 'object') {
          throw new TemplateError('faker helper requires data type {{faker "email"}}');
        }

        const fn = get(faker, name);

        if (!fn) {
          throw new TemplateError(`${name} is not a valid faker.js value type`);
        }

        return fn(ctx && Object.keys(ctx.hash).length > 0 ? ({ ...ctx.hash }) : undefined);
      },
      chance(name: string, ctx?: { hash: any }) {
        if (!name || typeof name === 'object') {
          throw new TemplateError('chance helper requires data type {{chance "email"}}');
        }

        const fn = (chance as any)[name];

        if (!fn) {
          throw new TemplateError(`${name} is not a valid chance value type`);
        }

        const res = fn.call(chance, ctx ? { ...ctx.hash } : {});

        if (name === 'date') {
          // we'll help out by toISOString here
          return moment.utc(res).toISOString();
        }

        return res;
      },
    },
  });
};

export const renderSeed = (contents: string) => {
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

  // faker should act deterministically, per-file, for object hashes to match correctly
  // this allows for less unnecessary updates and less random changing of data
  let fakerSeed = 42;
  let chanceSeed = 42;

  const templateDate = {};
  const seed = {};

  if (topSection) {
    const props = YAML.safeLoad(renderTemplate(topSection, {}));

    // `data` key is used to feed the handlebar template
    if (props.data) {
      Object.assign(templateDate, props.data);
      delete props.data;
    }

    // `fakerSeed` key is used to change the random seed of faker.js
    if (props.fakerSeed) {
      fakerSeed = props.fakerSeed;
      delete props.fakerSeed;
    }

    if (props.chanceSeed) {
      chanceSeed = props.chanceSeed;
      delete props.chanceSeed;
    }

    Object.assign(seed, props);
  }

  faker.seed(fakerSeed);
  const chance = new Chance(chanceSeed);

  const rendered = renderTemplate(templateSection, templateDate, chance);
  Object.assign(seed, YAML.safeLoad(rendered));

  if ('data' in seed) {
    throw new InvalidSeed('Seed included a \'data\' key, but did not use --- separator');
  }

  if ('fakerSeed' in seed) {
    throw new InvalidSeed('Seed included a \'fakerSeed\' key, but did not use --- separator');
  }

  return seed;
};
