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
import { RELEASE_PUBLIC_KEYS_PEM } from '../packages/shared/src/release/public-key.ts';
import { verifyDownloadedRelease } from '../packages/jobs/src/update/verify-downloaded.ts';

const dir = process.argv[2];
if (!dir) {
  process.stdout.write(`${JSON.stringify({ ok: false, reason: 'usage: verify-update.mjs <version directory>' })}\n`);
  process.exit(1);
}

let result;
try {
  result = verifyDownloadedRelease(dir, RELEASE_PUBLIC_KEYS_PEM);
} catch (error) {
  result = { ok: false, reason: error instanceof Error ? error.message : String(error) };
}
const out = result.ok ? { ok: true, version: result.manifest.version, zips: result.zips } : result;
process.stdout.write(`${JSON.stringify(out)}\n`);
process.exit(result.ok ? 0 : 1);
