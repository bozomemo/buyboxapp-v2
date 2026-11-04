import { generateKeyPairSync } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  compareVersions,
  componentsToDownload,
  signManifest,
  UpdateManifestSchema,
  verifyManifestSignature,
  type InstalledComponents,
  type UpdateManifest,
} from './manifest.js';

function keypair(): { privatePem: string; publicPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SHA_C = 'c'.repeat(64);

function manifest(components: UpdateManifest['components']): UpdateManifest {
  return {
    schema: 1,
    version: '0.2.1',
    releasedAt: '2026-11-10T12:00:00Z',
    notes: 'Notlar',
    components,
  };
}

const component = (sha256: string) => ({
  version: '0.2.1',
  sha256,
  size: 10,
  url: 'https://github.com/bozomemo/buybox-releases/releases/download/v0.2.1/x.zip',
});

describe('verifyManifestSignature', () => {
  let signer: ReturnType<typeof keypair>;
  let other: ReturnType<typeof keypair>;
  const bytes = Buffer.from('{"schema":1}\n', 'utf8');

  beforeAll(() => {
    signer = keypair();
    other = keypair();
  });

  it.each([
    ['a valid signature', () => bytes, () => signManifest(bytes, signer.privatePem), () => [signer.publicPem], true],
    ['one byte of the manifest changed', () => Buffer.from('{"schema":2}\n'), () => signManifest(bytes, signer.privatePem), () => [signer.publicPem], false],
    ['a signature from another key', () => bytes, () => signManifest(bytes, other.privatePem), () => [signer.publicPem], false],
    ['a rotated key list holding the signer second', () => bytes, () => signManifest(bytes, signer.privatePem), () => [other.publicPem, signer.publicPem], true],
    ['an empty signature', () => bytes, () => '', () => [signer.publicPem], false],
    ['a non-base64url signature', () => bytes, () => 'not base64!!', () => [signer.publicPem], false],
  ])('%s', (_name, payload, signature, keys, expected) => {
    expect(verifyManifestSignature(payload(), signature(), keys())).toBe(expected);
  });
});

describe('compareVersions', () => {
  it.each([
    ['0.2.1', '0.2.0', 1],
    ['0.2.0', '0.2.0', 0],
    ['0.1.22', '0.2.0', -1],
    ['0.10.0', '0.9.9', 1],
  ] as const)('%s vs %s → %d', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });

  it('throws on a version that is not MAJOR.MINOR.PATCH', () => {
    expect(() => compareVersions('0.2', '0.2.0')).toThrow();
  });
});

describe('UpdateManifestSchema', () => {
  const good = manifest({ app: component(SHA_A) });

  it('parses a well-formed manifest', () => {
    expect(UpdateManifestSchema.safeParse(good).success).toBe(true);
  });

  it.each([
    ['an unknown top-level key', { ...good, extra: true }],
    ['an http url', manifest({ app: { ...component(SHA_A), url: 'http://example.com/app.zip' } })],
    ['an uppercase sha256', manifest({ app: component('A'.repeat(64)) })],
    ['an unknown component name', { ...good, components: { foo: component(SHA_A) } }],
  ])('rejects %s', (_name, value) => {
    expect(UpdateManifestSchema.safeParse(value).success).toBe(false);
  });
});

describe('componentsToDownload', () => {
  const m = manifest({ app: component(SHA_A), node: component(SHA_B), chromium: component(SHA_C) });
  const installed = (overrides: Partial<Record<string, string>>): InstalledComponents => ({
    version: '0.2.0',
    components: {
      app: { version: '0.2.0', sha256: overrides.app ?? SHA_A },
      node: { version: 'v22', sha256: overrides.node ?? SHA_B },
      chromium: { version: 'pw-1', sha256: overrides.chromium ?? SHA_C },
      monitoring: { version: 'm', sha256: 'd'.repeat(64) },
    },
  });

  it('downloads everything when nothing is recorded as installed', () => {
    expect(componentsToDownload(m, undefined)).toEqual(['app', 'node', 'chromium']);
  });

  it('downloads only the component whose hash differs', () => {
    expect(componentsToDownload(m, installed({ app: 'e'.repeat(64) }))).toEqual(['app']);
  });

  it('downloads nothing when every hash matches', () => {
    expect(componentsToDownload(m, installed({}))).toEqual([]);
  });

  it('never lists a component the manifest does not carry', () => {
    expect(componentsToDownload(m, installed({}))).not.toContain('monitoring');
  });
});
