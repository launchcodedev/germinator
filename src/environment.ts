export class InvalidEnvironment extends Error {}

export enum Environment {
  Production = 'production',
  Staging = 'staging',
  QA = 'qa',
  Test = 'test',
  Development = 'development',
}

export const envAliases = {
  dev: Environment.Development,
  prod: Environment.Production,

  [Environment.Production]: Environment.Production,
  [Environment.Staging]: Environment.Staging,
  [Environment.QA]: Environment.QA,
  [Environment.Test]: Environment.Test,
  [Environment.Development]: Environment.Development,
};

export const validEnvironments = Object.keys(envAliases);

export type RawEnvironment = Environment | keyof typeof envAliases;

export const toEnv = (raw: RawEnvironment | RawEnvironment[]): Environment | Environment[] => {
  if (Array.isArray(raw)) return raw.map(toEnv) as Environment[];

  switch (raw) {
    case Environment.Production:
    case Environment.Staging:
    case Environment.QA:
    case Environment.Test:
    case Environment.Development:
      return raw;
    default:
      return envAliases[raw];
  }
};

export const currentEnv = () => {
  const { NODE_ENV } = process.env;

  if (!NODE_ENV) {
    return undefined;
  }

  const env = toEnv(NODE_ENV.toLowerCase() as RawEnvironment);

  if (!env) {
    throw new InvalidEnvironment(`${NODE_ENV} is not a valid environment name`);
  }

  return env;
};
