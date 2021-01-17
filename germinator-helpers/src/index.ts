/* eslint-disable
  @typescript-eslint/no-unsafe-return,
  @typescript-eslint/no-unsafe-call,
  @typescript-eslint/no-unsafe-member-access,
  @typescript-eslint/no-unsafe-assignment,
  @typescript-eslint/restrict-template-expressions,
*/

import { renderTemplate, GerminatorError, Helpers } from '@germinator/core';
import * as YAML from 'js-yaml';
import faker from 'faker';
import { Chance } from 'chance';
import moment from 'moment';
import get from 'lodash.get';
import * as bcrypt from 'bcrypt';
import handlebarHelpers from 'handlebars-helpers';
import repeatHelper from 'handlebars-helper-repeat-root-fixed';

export function makeHelpers(
  seed: number = 42,
  insecurePasswordSalt: string = '$2b$10$lAuv4qM.z6qZwQ/WhmHvEu',
): Helpers {
  faker.seed(seed);

  const chance = new Chance(seed);

  // insecure password hashed cache - uses same salt for all passwords!
  // hashSync is really slow so this is useful for mock data
  // we can't provide a seed to getSalt either so we'll just hard code one
  const insecurePasswordCache: { [plainText: string]: string } = {};

  const helpers = {
    ...handlebarHelpers,
    repeat: repeatHelper,
    array(...args: any[]) {
      return args.slice(0, args.length - 1);
    },
    concat(...args: any[]) {
      return args.slice(0, args.length - 1).join('');
    },
    password(password?: string, ctx?: { hash: { rounds?: number; insecure?: boolean } }) {
      if (!password || typeof password !== 'string') {
        throw new GerminatorError('password helper requires password {{password "pwd"}}');
      }

      const rounds = ctx?.hash?.rounds ?? 10;
      const insecure = ctx?.hash?.insecure;

      if (insecure) {
        if (!insecurePasswordCache[password]) {
          insecurePasswordCache[password] = bcrypt.hashSync(password, insecurePasswordSalt);
        }

        return insecurePasswordCache[password];
      }

      return bcrypt.hashSync(password, rounds);
    },
    faker(name: string | object | undefined, ctx?: { hash: any }) {
      if (!name || typeof name === 'object') {
        throw new GerminatorError('faker helper requires data type {{faker "email"}}');
      }

      const fn = get(faker, name);

      if (!fn) {
        throw new GerminatorError(`${name} is not a valid faker.js value type`);
      }

      return fn(ctx && Object.keys(ctx.hash).length > 0 ? { ...ctx.hash } : undefined);
    },
    chance(name: string, ...args: any[]) {
      if (!name || typeof name === 'object') {
        throw new GerminatorError('chance helper requires data type {{chance "email"}}');
      }

      const fn = (chance as any)[name];

      if (!fn) {
        throw new GerminatorError(`${name} is not a valid chance value type`);
      }

      const [ctx]: { hash: any }[] = args;

      // If the first argument is not the chance context (containing hash),
      // assume we are passing non-object args to chance (eg. array or scalar)
      if (!ctx.hash) {
        return fn.call(chance, ...args.slice(0, args.length - 1));
      }

      if (name === 'date' && ctx) {
        const { min, max, ...opts } = ctx.hash;
        const minDate = min !== undefined && new Date(min);
        const maxDate = max !== undefined && new Date(max);

        // we'll help out by toISOString here
        const date = moment.utc(chance.date({ ...opts, min: minDate, max: maxDate }));

        return date.toISOString();
      }

      return fn.call(chance, ctx ? { ...ctx.hash } : {});
    },
    moment(
      dateIn?: string | Date,
      ...args: (
        | string
        | {
            hash: {
              format?: string;
              utc?: boolean;
              [op: string]: string | any;
            };
            data: {
              root: any;
              [key: string]: any;
            };
          }
      )[]
    ) {
      let date: string | undefined;

      if (dateIn && dateIn instanceof Date) {
        date = dateIn.toISOString();
      } else {
        date = dateIn;
      }

      if (!date || typeof date !== 'string') {
        throw new GerminatorError('moment helper requires a date {{moment date}}');
      }

      const [ctx] = args.splice(-1, 1);
      const hash = (ctx && typeof ctx !== 'string' && ctx.hash) || {};
      const data = (ctx && typeof ctx !== 'string' && ctx.data) || { root: {} };

      const { format, utc } = hash;

      let value = utc ? moment.utc(date) : moment(date);

      for (const arg of args) {
        if (!arg || typeof arg !== 'string') {
          throw new GerminatorError(
            'moment helper received an undefined argument (did you forget to quote an operation? "[add,days,5]")',
          );
        }

        try {
          let op = YAML.load(
            // we actually render this string, so that "[add,{{x}},days]" is convenient
            renderTemplate(arg, { ...data.root, ...data, root: undefined }, helpers),
          );

          if (!Array.isArray(op)) {
            // {{moment "utcdate" utc=true local}}
            op = [op];
          }

          const [method, ...methodArgs] = op as any[];

          if (!(value as any)[method]) {
            throw new GerminatorError(`no such moment operation existed (${method})`);
          }

          value = (value as any)[method](...methodArgs);
        } catch (err) {
          throw new GerminatorError(`failed to parse "${arg}" moment helper argument`);
        }
      }

      return format ? value.format(format) : value.toISOString();
    },
    momentAdd(count: number, period: string) {
      if (count === undefined || typeof count !== 'number') {
        throw new GerminatorError('momentAdd helper requires {{momentAdd 5 "days"}}');
      }

      if (period === undefined || typeof period !== 'string') {
        throw new GerminatorError('momentAdd helper requires {{momentAdd 5 "days"}}');
      }

      return `[add,${count},${period}]`;
    },
    momentSubtract(count: number, period: string) {
      if (!count || typeof count !== 'number') {
        throw new GerminatorError('momentSubtract helper requires {{momentSubtract 5 "days"}}');
      }

      if (!period || typeof period !== 'string') {
        throw new GerminatorError('momentSubtract helper requires {{momentSubtract 5 "days"}}');
      }

      return `[subtract,${count},${period}]`;
    },
  };

  return helpers;
}
