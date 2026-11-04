/**
 * Re-verifies a downloaded release before apply-update.ps1 acts on it (auto-update spec §6 step 2).
 *
 *   node verify-update.mjs <ProgramData\BuyBox\updates\<version>>
 *
 * Prints one line of JSON — `{ ok, reason?, version?, zips? }` — and exits 0 only when the manifest
 * signature verifies against the keys compiled into *this* build and every archive matches it.
 *
 * Shipped bundled (scripts/build-verify-update.mjs) inside the app component, beside admin.mjs.
 * The updater always runs the copy that is already installed: a copy taken from the archives it
 * is about to trust would be checking itself.
 */
import { readFileSync } from 'node:fs';
import { InstalledComponentsSchema } from '../packages/shared/src/release/manifest.ts';
import { RELEASE_PUBLIC_KEYS_PEM } from '../packages/shared/src/release/public-key.ts';
import { verifyDownloadedRelease } from '../packages/jobs/src/update/verify-downloaded.ts';

// node verify-update.mjs <version directory> [installed.json]
// With installed.json, every component the install does not already hold must be present.
const [dir, installedPath] = process.argv.slice(2);
if (!dir) {
  process.stdout.write(`${JSON.stringify({ ok: false, reason: 'usage: verify-update.mjs <version directory> [installed.json]' })}\n`);
  process.exit(1);
}

let result;
try {
  let installed;
  if (installedPath) {
    const text = readFileSync(installedPath, 'utf8');
    const parsed = InstalledComponentsSchema.safeParse(JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text));
    if (!parsed.success) throw new Error(`installed.json invalid: ${installedPath}`);
    installed = parsed.data;
  }
  result = verifyDownloadedRelease(dir, RELEASE_PUBLIC_KEYS_PEM, installed);
} catch (error) {
  result = { ok: false, reason: error instanceof Error ? error.message : String(error) };
}
const out = result.ok ? { ok: true, version: result.manifest.version, zips: result.zips } : result;
process.stdout.write(`${JSON.stringify(out)}\n`);
process.exit(result.ok ? 0 : 1);
