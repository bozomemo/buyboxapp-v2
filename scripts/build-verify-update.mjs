/**
 * Bundles `scripts/verify-update.mjs` into one file for the app component (auto-update spec §6),
 * the way `build-admin-cli.mjs` bundles the admin command: the installed app has no repository
 * to import from.
 *
 *   node scripts/build-verify-update.mjs <output file>
 */
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = process.argv[2];
if (!out) {
  console.error('Usage: node scripts/build-verify-update.mjs <output file>');
  process.exit(1);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await build({
  entryPoints: [path.join(repoRoot, 'scripts', 'verify-update.mjs')],
  outfile: path.resolve(out),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // ESM output of CommonJS dependencies (zod is fine, but stay consistent with admin.mjs).
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
});
console.log(`release verifier bundled to ${out}`);
