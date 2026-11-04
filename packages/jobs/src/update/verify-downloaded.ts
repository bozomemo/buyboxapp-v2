/**
 * Re-verifies a downloaded release directory from scratch (auto-update spec §6 step 2).
 *
 * The update check verified it once, but it then sat in ProgramData for as long as nobody pressed
 * "Şimdi kur". apply-update.ps1 runs this — through the *installed* `verify-update.mjs`, never a
 * copy taken from the archives being verified — immediately before it changes anything.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  COMPONENT_NAMES,
  UpdateManifestSchema,
  verifyManifestSignature,
  type ComponentName,
  type UpdateManifest,
} from '@buybox/shared';

export type VerifyDownloadedResult =
  | { readonly ok: true; readonly manifest: UpdateManifest; readonly zips: ComponentName[] }
  | { readonly ok: false; readonly reason: string };

export function verifyDownloadedRelease(versionDir: string, publicKeysPem: readonly string[]): VerifyDownloadedResult {
  let manifestBytes: Buffer;
  let signature: string;
  try {
    manifestBytes = readFileSync(path.join(versionDir, 'update.json'));
    signature = readFileSync(path.join(versionDir, 'update.json.sig'), 'utf8').trim();
  } catch {
    return { ok: false, reason: 'update.json or update.json.sig missing' };
  }
  if (!verifyManifestSignature(manifestBytes, signature, publicKeysPem)) return { ok: false, reason: 'signature invalid' };

  let manifest: UpdateManifest;
  try {
    const parsed = UpdateManifestSchema.safeParse(JSON.parse(manifestBytes.toString('utf8')));
    if (!parsed.success) return { ok: false, reason: 'manifest invalid' };
    manifest = parsed.data;
  } catch {
    return { ok: false, reason: 'manifest invalid' };
  }

  const zips: ComponentName[] = [];
  for (const entry of readdirSync(versionDir)) {
    if (!entry.endsWith('.zip')) continue;
    const name = entry.slice(0, -'.zip'.length) as ComponentName;
    const wanted = (COMPONENT_NAMES as readonly string[]).includes(name) ? manifest.components[name] : undefined;
    if (!wanted) return { ok: false, reason: `archive not in manifest: ${entry}` };
    const file = path.join(versionDir, entry);
    if (statSync(file).size !== wanted.size) return { ok: false, reason: `size mismatch: ${name}` };
    if (createHash('sha256').update(readFileSync(file)).digest('hex') !== wanted.sha256) {
      return { ok: false, reason: `sha256 mismatch: ${name}` };
    }
    zips.push(name);
  }
  zips.sort((a, b) => COMPONENT_NAMES.indexOf(a) - COMPONENT_NAMES.indexOf(b));
  return { ok: true, manifest, zips };
}
