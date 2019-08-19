import { toEnv, currentEnv, validEnvironments, Environment } from './environment';

describe('environments', () => {
  test('valid environments', () => {
    expect(validEnvironments).toContain('qa');
  });

  test('current env', () => {
    expect(currentEnv()).toBe('test');
  });

  test('to env', () => {
    expect(toEnv('prod')).toBe('production');
    expect(toEnv('dev')).toBe('development');
    expect(toEnv(Environment.Staging)).toBe('staging');
  });
});
