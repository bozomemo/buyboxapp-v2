/**
 * `bootstrapEnvProblems` — the difference between an install waiting for the setup wizard and a
 * deployment whose environment is wrong (found 2026-09-20, see the function's doc comment).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrapEnvProblems } from './db';

const KEYS = ['DATABASE_URL', 'SECRET_STORE_KEY', 'SINGLE_PROCESS', 'AUTO_MIGRATE'] as const;
const saved = new Map<string, string | undefined>();

function setEnv(values: Partial<Record<(typeof KEYS)[number], string>>): void {
  for (const key of KEYS) {
    if (!saved.has(key)) saved.set(key, process.env[key]);
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  saved.clear();
});

describe('bootstrapEnvProblems', () => {
  it('says nothing about a fresh install that has set none of them', () => {
    // The wizard has not run. "DATABASE_URL is required" is this install's starting state, and
    // reporting it as a fault would make every first install look broken.
    setEnv({});
    expect(bootstrapEnvProblems()).toEqual([]);
  });

  it('says nothing when everything parses', () => {
    setEnv({ DATABASE_URL: 'file:./data/app.db', SECRET_STORE_KEY: 'abc', SINGLE_PROCESS: '1' });
    expect(bootstrapEnvProblems()).toEqual([]);
  });

  /** The measured case: one wrong value made the app report the *database* as not configured. */
  it('names the variable whose value the schema cannot read', () => {
    setEnv({ DATABASE_URL: 'file:./data/app.db', SECRET_STORE_KEY: 'abc', SINGLE_PROCESS: 'true' });
    expect(bootstrapEnvProblems().map((p) => p.variable)).toEqual(['SINGLE_PROCESS']);
  });

  it('reports every offending variable, not just the first', () => {
    setEnv({
      DATABASE_URL: 'file:./data/app.db',
      SECRET_STORE_KEY: 'abc',
      SINGLE_PROCESS: 'yes',
      AUTO_MIGRATE: 'on',
    });
    expect(
      bootstrapEnvProblems()
        .map((p) => p.variable)
        .sort(),
    ).toEqual(['AUTO_MIGRATE', 'SINGLE_PROCESS']);
  });

  it('reports an empty required value, which is set and unusable rather than absent', () => {
    setEnv({ DATABASE_URL: 'file:./data/app.db', SECRET_STORE_KEY: '' });
    expect(bootstrapEnvProblems().map((p) => p.variable)).toEqual(['SECRET_STORE_KEY']);
  });
});
