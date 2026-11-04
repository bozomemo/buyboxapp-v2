import { createHash, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { signManifest, type InstalledComponents, type UpdateManifest } from '@buybox/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { checkForUpdate } from './check-for-update.js';
import { readJsonFile, updatePaths, UpdateStateSchema } from './update-files.js';

const MANIFEST_URL = 'https://example.test/releases/latest/download/update.json';
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

let privatePem: string;
let publicPem: string;
beforeAll(() => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
});

const appZip = Buffer.from('app archive bytes');
const nodeZip = Buffer.from('node archive bytes');

function release(version = '0.2.1'): UpdateManifest {
  return {
    schema: 1,
    version,
    releasedAt: '2026-11-10T12:00:00Z',
    notes: 'Yeni sürüm',
    components: {
      app: { version, sha256: sha(appZip), size: appZip.length, url: 'https://example.test/app.zip' },
      node: { version: 'v22', sha256: sha(nodeZip), size: nodeZip.length, url: 'https://example.test/node.zip' },
    },
  };
}

type Served = Buffer | number;

function setup(options: { served?: Record<string, Served>; installedNodeSha?: string } = {}) {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'upd-data-'));
  const installDir = mkdtempSync(path.join(tmpdir(), 'upd-inst-'));
  const installed: InstalledComponents = {
    version: '0.2.0',
    components: {
      app: { version: '0.2.0', sha256: 'f'.repeat(64) },
      node: { version: 'v22', sha256: options.installedNodeSha ?? sha(nodeZip) },
    },
  };
  writeFileSync(path.join(installDir, 'installed.json'), JSON.stringify(installed));
  const calls: { url: string; userAgent: string | null }[] = [];
  const served = options.served ?? {};
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, userAgent: new Headers(init?.headers).get('user-agent') });
    const body = served[url];
    if (body === undefined) return new Response('not found', { status: 404 });
    if (typeof body === 'number') return new Response('', { status: body });
    return new Response(new Uint8Array(body), { status: 200 });
  }) as typeof fetch;
  const deps = {
    dataDir,
    installDir,
    currentVersion: '0.2.0',
    manifestUrl: MANIFEST_URL,
    publicKeysPem: [publicPem],
    fetch: fetchFn,
    now: () => new Date('2026-11-11T00:00:00Z'),
  };
  return { deps, calls, dataDir };
}

function signed(manifest: UpdateManifest): Record<string, Buffer> {
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  return {
    [MANIFEST_URL]: bytes,
    [`${MANIFEST_URL}.sig`]: Buffer.from(`${signManifest(bytes, privatePem)}\n`),
  };
}

const zips = { 'https://example.test/app.zip': appZip, 'https://example.test/node.zip': nodeZip };

describe('checkForUpdate', () => {
  it('downloads only the component whose hash differs and reports ready', async () => {
    const { deps, dataDir } = setup({ served: { ...signed(release()), ...zips } });
    const state = await checkForUpdate(deps);
    expect(state.lastResult).toBe('ready');
    expect(state.ready).toEqual({ version: '0.2.1', notes: 'Yeni sürüm', downloadBytes: appZip.length, components: ['app'] });
    const versionDir = updatePaths(dataDir).versionDir('0.2.1');
    expect(readdirSync(versionDir).sort()).toEqual(['app.zip', 'update.json', 'update.json.sig']);
    expect(readJsonFile(updatePaths(dataDir).state, UpdateStateSchema)).toEqual(state);
  });

  it('is up to date when the published version equals the running one', async () => {
    const { deps, calls } = setup({ served: { ...signed(release('0.2.0')), ...zips } });
    const state = await checkForUpdate(deps);
    expect(state.lastResult).toBe('up-to-date');
    expect(state.ready).toBeNull();
    expect(calls.some((c) => c.url.endsWith('.zip'))).toBe(false);
  });

  it('never offers a lower version', async () => {
    const { deps } = setup({ served: { ...signed(release('0.1.22')), ...zips } });
    expect((await checkForUpdate(deps)).lastResult).toBe('up-to-date');
  });

  it('reports signature-missing when the release has no .sig', async () => {
    const { [MANIFEST_URL]: manifest } = signed(release());
    const { deps, calls } = setup({ served: { [MANIFEST_URL]: manifest!, ...zips } });
    expect((await checkForUpdate(deps)).lastResult).toBe('signature-missing');
    expect(calls.some((c) => c.url.endsWith('.zip'))).toBe(false);
  });

  it('reports signature-invalid for a tampered manifest', async () => {
    const good = signed(release());
    const tampered = Buffer.from(good[MANIFEST_URL]!.toString().replace('Yeni', 'Sahte'));
    const { deps } = setup({ served: { ...good, [MANIFEST_URL]: tampered, ...zips } });
    expect((await checkForUpdate(deps)).lastResult).toBe('signature-invalid');
  });

  it('reports manifest-invalid for a signed manifest the schema rejects', async () => {
    const bytes = Buffer.from('{"schema":2}');
    const { deps } = setup({
      served: { [MANIFEST_URL]: bytes, [`${MANIFEST_URL}.sig`]: Buffer.from(signManifest(bytes, privatePem)) },
    });
    expect((await checkForUpdate(deps)).lastResult).toBe('manifest-invalid');
  });

  it('reports manifest-invalid for a manifest larger than 64 KB', async () => {
    const big = Buffer.alloc(64 * 1024 + 1, 0x20);
    const { deps } = setup({
      served: { [MANIFEST_URL]: big, [`${MANIFEST_URL}.sig`]: Buffer.from(signManifest(big, privatePem)) },
    });
    expect((await checkForUpdate(deps)).lastResult).toBe('manifest-invalid');
  });

  it('discards an archive whose hash does not match, leaving no partial file', async () => {
    const { deps, dataDir } = setup({
      served: { ...signed(release()), ...zips, 'https://example.test/app.zip': Buffer.from('corrupted') },
    });
    const state = await checkForUpdate(deps);
    expect(state.lastResult).toBe('download-failed');
    expect(state.lastError).toContain('app');
    const versionDir = updatePaths(dataDir).versionDir('0.2.1');
    const left = existsSync(versionDir) ? readdirSync(versionDir) : [];
    expect(left.filter((name) => name.includes('.zip'))).toEqual([]);
  });

  it('keeps an earlier ready release when the network fails', async () => {
    const first = setup({ served: { ...signed(release()), ...zips } });
    await checkForUpdate(first.deps);
    const throwing = (async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    const state = await checkForUpdate({ ...first.deps, fetch: throwing });
    expect(state.lastResult).toBe('network-error');
    expect(state.lastError).toContain('ECONNRESET');
    expect(state.ready?.version).toBe('0.2.1');
  });

  it('is disabled, and fetches nothing, when no manifest URL is configured', async () => {
    const { deps, calls } = setup({ served: signed(release()) });
    const state = await checkForUpdate({ ...deps, manifestUrl: '' });
    expect(state.lastResult).toBe('disabled');
    expect(calls).toEqual([]);
  });

  it('identifies itself only as the BuyBox version, on every request', async () => {
    const { deps, calls } = setup({ served: { ...signed(release()), ...zips } });
    await checkForUpdate(deps);
    expect(calls.length).toBeGreaterThan(2);
    expect(new Set(calls.map((c) => c.userAgent))).toEqual(new Set(['BuyBox/0.2.0 update-check']));
  });

  it('removes downloads of other versions once a release is ready', async () => {
    const { deps, dataDir } = setup({ served: { ...signed(release()), ...zips } });
    const stale = updatePaths(dataDir).versionDir('0.1.99');
    mkdirSync(stale, { recursive: true });
    await checkForUpdate(deps);
    expect(existsSync(stale)).toBe(false);
  });

  it('does not download again an archive already verified on disk', async () => {
    const { deps, calls } = setup({ served: { ...signed(release()), ...zips } });
    await checkForUpdate(deps);
    calls.length = 0;
    await checkForUpdate(deps);
    expect(calls.some((c) => c.url.endsWith('.zip'))).toBe(false);
  });
});
