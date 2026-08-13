import { describe, expect, it } from 'vitest';
import { parseBootstrapEnv } from './env.js';

describe('parseBootstrapEnv', () => {
  it('parses a valid bootstrap environment', () => {
    const env = parseBootstrapEnv({
      DATABASE_URL: 'sqlite://./data/app.db',
      SECRET_STORE_KEY: 'a-key',
      SINGLE_PROCESS: '1',
    });
    expect(env.DATABASE_URL).toBe('sqlite://./data/app.db');
    expect(env.SINGLE_PROCESS).toBe('1');
  });

  it('defaults SINGLE_PROCESS to "0" when absent', () => {
    const env = parseBootstrapEnv({
      DATABASE_URL: 'sqlite://./data/app.db',
      SECRET_STORE_KEY: 'a-key',
    });
    expect(env.SINGLE_PROCESS).toBe('0');
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => parseBootstrapEnv({ SECRET_STORE_KEY: 'a-key' })).toThrow();
  });

  it('rejects an invalid SINGLE_PROCESS value', () => {
    expect(() =>
      parseBootstrapEnv({
        DATABASE_URL: 'sqlite://./data/app.db',
        SECRET_STORE_KEY: 'a-key',
        SINGLE_PROCESS: 'yes',
      }),
    ).toThrow();
  });
});
