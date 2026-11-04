import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { signManifest, type UpdateManifest } from '@buybox/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { verifyDownloadedRelease } from './verify-downloaded.js';

/**
 * What apply-update.ps1 runs, through the installed `verify-update.mjs`, immediately before it
 * acts: the downloaded directory is re-verified from scratch, because it sits in ProgramData and
 * anything could have changed it since the check.
 */
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const appZip = Buffer.from('app archive');
let privatePem: string;
let publicPem: string;

beforeAll(() => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
});

function releaseDir(options: { zip?: Buffer; extra?: string; sign?: (bytes: Buffer) => string } = {}): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'upd-verify-'));
  const manifest: UpdateManifest = {
    schema: 1,
    version: '0.2.1',
    releasedAt: '2026-11-10T12:00:00Z',
    notes: '',
    components: { app: { version: '0.2.1', sha256: sha(appZip), size: appZip.length, url: 'https://example.test/app.zip' } },
  };
  const bytes = Buffer.from(JSON.stringify(manifest));
  writeFileSync(path.join(dir, 'update.json'), bytes);
  writeFileSync(path.join(dir, 'update.json.sig'), (options.sign ?? ((b) => signManifest(b, privatePem)))(bytes));
  writeFileSync(path.join(dir, 'app.zip'), options.zip ?? appZip);
  if (options.extra) writeFileSync(path.join(dir, options.extra), 'x');
  return dir;
}

describe('verifyDownloadedRelease', () => {
  it('accepts a signed manifest with matching archives', () => {
    const result = verifyDownloadedRelease(releaseDir(), [publicPem]);
    expect(result).toMatchObject({ ok: true, zips: ['app'] });
    if (result.ok) expect(result.manifest.version).toBe('0.2.1');
  });

  it('refuses an archive changed after download', () => {
    expect(verifyDownloadedRelease(releaseDir({ zip: Buffer.from('app archivE') }), [publicPem])).toEqual({
      ok: false,
      reason: 'sha256 mismatch: app',
    });
  });

  it('refuses an archive the manifest does not list', () => {
    const result = verifyDownloadedRelease(releaseDir({ extra: 'foo.zip' }), [publicPem]);
    expect(result.ok).toBe(false);
  });

  it('refuses a manifest whose signature does not verify', () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const other = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const result = verifyDownloadedRelease(releaseDir({ sign: (b) => signManifest(b, other) }), [publicPem]);
    expect(result).toEqual({ ok: false, reason: 'signature invalid' });
  });

  // Review I10: an archive the install needs that is absent (deleted, quarantined) must stop the
  // install — otherwise installed.json claims a version whose component was never replaced.
  it('refuses when an archive the install needs is missing', () => {
    const dir = releaseDir();
    rmSync(path.join(dir, 'app.zip'));
    const installed = { version: '0.2.0', components: { app: { version: '0.2.0', sha256: 'f'.repeat(64) } } };
    expect(verifyDownloadedRelease(dir, [publicPem], installed)).toEqual({ ok: false, reason: 'missing archive: app' });
  });

  it('does not require an archive the install already has', () => {
    const dir = releaseDir();
    rmSync(path.join(dir, 'app.zip'));
    const installed = { version: '0.2.0', components: { app: { version: '0.2.1', sha256: sha(appZip) } } };
    expect(verifyDownloadedRelease(dir, [publicPem], installed)).toMatchObject({ ok: true, zips: [] });
  });

  it('refuses a directory with no manifest', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'upd-verify-empty-'));
    expect(verifyDownloadedRelease(dir, [publicPem]).ok).toBe(false);
  });
});
