/**
 * Vendor-side: turns the components `installer/release.ps1` built into a signed `update.json`
 * (docs/superpowers/specs/2026-11-04-auto-update-design.md §4.5).
 *
 *   node scripts/release/sign-manifest.mjs --components <components.json> --version <v>
 *     --notes-file <path> --previous <update.json|none> --base-url <url> --key <pem> --out <dir>
 *
 * Writes `update.json`, `update.json.sig` and `new-assets.txt` (the archives this release must
 * upload; the rest are reused from earlier releases) into `--out`.
 *
 * Refuses to sign with a key the app does not trust: a release signed by a key missing from
 * `RELEASE_PUBLIC_KEYS_PEM` would publish cleanly and then be rejected by every install.
 */
import { Buffer } from 'node:buffer';
import { createPublicKey, createPrivateKey } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  RELEASE_PUBLIC_KEYS_PEM,
  UpdateManifestSchema,
  buildManifest,
  signManifest,
  verifyManifestSignature,
} from '@buybox/shared';

function fail(message) {
  console.error(`sign-manifest: ${message}`);
  process.exit(1);
}

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!key?.startsWith('--') || argv[i + 1] === undefined) fail(`bad argument near "${key}"`);
    out[key.slice(2)] = argv[i + 1];
  }
  for (const required of ['components', 'version', 'notes-file', 'previous', 'base-url', 'key', 'out']) {
    if (!out[required]) fail(`--${required} is required`);
  }
  return out;
}

// PowerShell 5.1 writes UTF-8 with a BOM (U+FEFF), which JSON.parse rejects.
const readText = (file) => {
  const text = readFileSync(file, 'utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
};

const opts = args(process.argv.slice(2));

const privateKeyPem = readText(opts.key);
const publicPem = createPublicKey(createPrivateKey(privateKeyPem)).export({ type: 'spki', format: 'pem' }).toString();
const normalise = (pem) => pem.replace(/\s+/g, '');
if (!RELEASE_PUBLIC_KEYS_PEM.some((trusted) => normalise(trusted) === normalise(publicPem))) {
  fail(`the key at ${opts.key} is not in RELEASE_PUBLIC_KEYS_PEM; installs would reject this release`);
}

let previous;
if (opts.previous !== 'none') {
  const parsed = UpdateManifestSchema.safeParse(JSON.parse(readText(opts.previous)));
  if (!parsed.success) fail(`previous manifest ${opts.previous} does not parse: ${parsed.error.message}`);
  previous = parsed.data;
}

const built = JSON.parse(readText(opts.components));
const { manifest, newAssets } = buildManifest({
  version: opts.version,
  releasedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  notes: readText(opts['notes-file']).trim(),
  releaseDownloadBaseUrl: opts['base-url'].replace(/\/$/, ''),
  built: Array.isArray(built) ? built : [built],
  previous,
});

const checked = UpdateManifestSchema.safeParse(manifest);
if (!checked.success) fail(`built manifest is invalid: ${checked.error.message}`);

const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
const signature = signManifest(bytes, privateKeyPem);
if (!verifyManifestSignature(bytes, signature, RELEASE_PUBLIC_KEYS_PEM)) fail('signature does not verify');

mkdirSync(opts.out, { recursive: true });
writeFileSync(path.join(opts.out, 'update.json'), bytes);
writeFileSync(path.join(opts.out, 'update.json.sig'), `${signature}\n`, 'ascii');
writeFileSync(path.join(opts.out, 'new-assets.txt'), newAssets.map((name) => `${name}\n`).join(''), 'ascii');

console.log(`update.json ${manifest.version}: ${Object.keys(manifest.components).join(', ')}`);
console.log(`new assets: ${newAssets.length === 0 ? '(none)' : newAssets.join(', ')}`);
