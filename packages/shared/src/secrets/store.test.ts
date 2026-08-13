import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileSecretStore, marketplaceCredentialsKey, secretsEqual } from './store.js';

describe('FileSecretStore', () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'buybox-secrets-test-'));
    filePath = path.join(dir, 'secrets.enc.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips a value through encryption', async () => {
    const store = new FileSecretStore(filePath, 'master-key-1');
    await store.set(marketplaceCredentialsKey('trendyol'), JSON.stringify({ apiKey: 'abc' }));
    const value = await store.get(marketplaceCredentialsKey('trendyol'));
    expect(value).toBe(JSON.stringify({ apiKey: 'abc' }));
  });

  it('reports has() correctly, and undefined for a missing key', async () => {
    const store = new FileSecretStore(filePath, 'master-key-1');
    expect(await store.has('missing')).toBe(false);
    expect(await store.get('missing')).toBeUndefined();
    await store.set('present', 'x');
    expect(await store.has('present')).toBe(true);
  });

  it('never writes the plaintext value to disk', async () => {
    const { readFile } = await import('node:fs/promises');
    const store = new FileSecretStore(filePath, 'master-key-1');
    await store.set('trendyol', 'super-secret-api-key');
    const raw = await readFile(filePath, 'utf8');
    expect(raw).not.toContain('super-secret-api-key');
  });

  it('deletes a key', async () => {
    const store = new FileSecretStore(filePath, 'master-key-1');
    await store.set('k', 'v');
    await store.delete('k');
    expect(await store.has('k')).toBe(false);
  });

  it('cannot decrypt with the wrong master key', async () => {
    const store = new FileSecretStore(filePath, 'right-key');
    await store.set('k', 'v');
    const wrong = new FileSecretStore(filePath, 'wrong-key');
    await expect(wrong.get('k')).rejects.toThrow();
  });

  it('serialises concurrent writes without losing any of them', async () => {
    const store = new FileSecretStore(filePath, 'master-key-1');
    await Promise.all(Array.from({ length: 10 }, (_, i) => store.set(`key-${i}`, `value-${i}`)));
    for (let i = 0; i < 10; i += 1) {
      expect(await store.get(`key-${i}`)).toBe(`value-${i}`);
    }
  });
});

describe('secretsEqual', () => {
  it('is true for equal strings and false otherwise', () => {
    expect(secretsEqual('abc', 'abc')).toBe(true);
    expect(secretsEqual('abc', 'abd')).toBe(false);
    expect(secretsEqual('abc', 'abcd')).toBe(false);
  });
});
