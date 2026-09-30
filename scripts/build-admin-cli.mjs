/**
 * Bundles the break-glass command (`scripts/admin.mjs`, doc 18 §8.3) into one file for the
 * packaged install, which has no repository and no workspace packages to import from.
 *
 *   node scripts/build-admin-cli.mjs <output file>
 *
 * The package builds call this and put the result at `app/admin.mjs`, beside Next's standalone
 * server, so the native database drivers left external here resolve from that directory's own
 * `node_modules` — the same copies the service uses.
 */
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = process.argv[2];
if (!out) {
  console.error('Usage: node scripts/build-admin-cli.mjs <output file>');
  process.exit(1);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await build({
  entryPoints: [path.join(repoRoot, 'scripts', 'admin.mjs')],
  outfile: path.resolve(out),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Native, or loaded only by a dialect this install may not use: resolved at run time from the
  // app's own node_modules, never inlined.
  external: ['better-sqlite3', 'pg', 'pg-native', 'mysql2'],
  // ESM output of CommonJS dependencies needs `require` for the externals.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
});
console.log(`admin CLI bundled to ${out}`);
