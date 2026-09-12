//
// Doc 14 section 11.6 / 11.8 -- the apt package list that ships in the .deb's `Depends:`, read
// from the pinned Playwright version's OWN dependency table rather than from the output of
// `playwright install-deps --dry-run`.
//
// Why not --dry-run, which section 11.6 names: --dry-run reports what is MISSING on the build
// machine, not what Chromium needs. On any machine that already has these libraries -- a
// developer desktop, or a persistent build host that has installed this package once before --
// it prints "All system dependencies are installed." and the list comes back empty. That was a
// build-stopping failure on a developer machine, 2026-09-11, with no fix available short of
// uninstalling system libraries. The table read here is the same data --dry-run derives its own
// answer from, is versioned with Chromium exactly as section 11.6 requires, and gives the same
// answer on a machine that has the libraries and one that does not.
//
// Scoped to Chromium specifically, for the reason build-package.sh already records: the whole
// table also carries Firefox's and WebKit's dependencies, which this package has no use for.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const arch = process.argv[2] === 'arm64' ? 'arm64' : 'x64';
// `playwright-core/lib/...` is not a subpath its package.json exports, so the package root is
// located through the one subpath every package exports -- its own package.json -- and the file
// is read from disk beside it.
const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve('playwright-core/package.json'));
const bundle = readFileSync(join(packageRoot, 'lib', 'coreBundle.js'), 'utf8');

const os = readFileSync('/etc/os-release', 'utf8');
const version = /^VERSION_ID="?([0-9.]+)"?/m.exec(os)?.[1];
if (!version) throw new Error('VERSION_ID not found in /etc/os-release');

const keys = [...bundle.matchAll(/"(ubuntu[0-9.]+)-(x64|arm64)":\s*\{/g)]
  .filter((m) => m[2] === arch)
  .map((m) => m[1].slice('ubuntu'.length));
if (keys.length === 0) throw new Error(`no ubuntu entries for ${arch} in Playwright's dependency table`);

const num = (v) => Number(v.replace('.', ''));
const exact = keys.find((k) => k === version);
const chosen =
  exact ??
  keys.filter((k) => num(k) <= num(version)).sort((a, b) => num(b) - num(a))[0] ??
  keys.sort((a, b) => num(a) - num(b))[0];

const key = `"ubuntu${chosen}-${arch}": {`;
const at = bundle.indexOf(key);
const listStart = bundle.indexOf('chromium: [', at);
const listEnd = bundle.indexOf(']', listStart);
if (at < 0 || listStart < 0 || listEnd < 0) throw new Error(`chromium list not found for ubuntu${chosen}-${arch}`);

const packages = (bundle.slice(listStart, listEnd).match(/"[^"]+"/g) ?? []).map((s) => s.slice(1, -1));
if (packages.length === 0) throw new Error(`chromium list is empty for ubuntu${chosen}-${arch}`);

process.stderr.write(`   (Playwright dependency table: ubuntu${chosen}-${arch}, ${packages.length} packages)\n`);
process.stdout.write(packages.join(','));
