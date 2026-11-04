/**
 * The signed update manifest (docs/superpowers/specs/2026-11-04-auto-update-design.md §4.5) and
 * the pure decisions made from it.
 *
 * Like `license/verify.ts`, `node:crypto` here is a deterministic computation, not I/O, which is
 * why this sits in `packages/shared` rather than behind a port.
 */
import { createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';
import { z } from 'zod';
import { base64UrlEncode } from '../license/verify.js';

/** The install's independently replaceable parts. A component zip's top-level directories are
 *  the install directories it replaces (`runtime` → `scripts\` and `service\`). */
export const COMPONENT_NAMES = ['app', 'node', 'chromium', 'runtime', 'monitoring'] as const;
export type ComponentName = (typeof COMPONENT_NAMES)[number];

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/, 'sha256 must be 64 lowercase hex characters');

const ManifestComponentSchema = z
  .object({
    version: z.string().min(1),
    sha256: Sha256Schema,
    size: z.number().int().nonnegative(),
    url: z.string().url().startsWith('https://'),
  })
  .strict();

const componentRecord = <T extends z.ZodTypeAny>(value: T) =>
  z
    .object(Object.fromEntries(COMPONENT_NAMES.map((name) => [name, value.optional()])) as Record<
      ComponentName,
      z.ZodOptional<T>
    >)
    .strict();

export const UpdateManifestSchema = z
  .object({
    schema: z.literal(1),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    releasedAt: z.string().datetime(),
    notes: z.string(),
    components: componentRecord(ManifestComponentSchema),
  })
  .strict();

export const InstalledComponentsSchema = z
  .object({
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    components: componentRecord(z.object({ version: z.string().min(1), sha256: Sha256Schema }).strict()),
  })
  .strict();

export type ManifestComponent = z.infer<typeof ManifestComponentSchema>;
export type UpdateManifest = z.infer<typeof UpdateManifestSchema>;
export type InstalledComponents = z.infer<typeof InstalledComponentsSchema>;

/** Detached Ed25519 signature over the exact manifest bytes, base64url. Vendor side only. */
export function signManifest(manifestBytes: Buffer, privateKeyPem: string): string {
  return base64UrlEncode(cryptoSign(null, manifestBytes, createPrivateKey(privateKeyPem)));
}

/**
 * True when any of `publicKeysPem` verifies the signature. A list, so a key can be rotated by
 * shipping the next key one release before the signer switches to it.
 */
export function verifyManifestSignature(
  manifestBytes: Buffer,
  signature: string,
  publicKeysPem: readonly string[],
): boolean {
  if (!/^[A-Za-z0-9_-]+$/.test(signature)) return false;
  const signatureBytes = Buffer.from(signature, 'base64url');
  return publicKeysPem.some((pem) => {
    try {
      return cryptoVerify(null, manifestBytes, createPublicKey(pem), signatureBytes);
    } catch {
      // A malformed key or a signature of the wrong length throws; both mean "not verified".
      return false;
    }
  });
}

function parseVersion(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`Not a MAJOR.MINOR.PATCH version: "${version}"`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (left[i]! !== right[i]!) return left[i]! > right[i]! ? 1 : -1;
  }
  return 0;
}

/** Every component the manifest carries whose hash the install does not already have. */
export function componentsToDownload(
  manifest: UpdateManifest,
  installed: InstalledComponents | undefined,
): ComponentName[] {
  return COMPONENT_NAMES.filter((name) => {
    const wanted = manifest.components[name];
    if (!wanted) return false;
    return installed?.components[name]?.sha256 !== wanted.sha256;
  });
}
