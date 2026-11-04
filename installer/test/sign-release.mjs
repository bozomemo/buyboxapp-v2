// Test helper for apply-update-harness.ps1: writes a signed update.json for the zips in a
// directory, using the real release key, because the installed verifier trusts only the keys
// compiled into the build. Vendor machine only.
//
//   node sign-release.mjs <repo root> <version directory> <version>
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [repo, dir, version] = process.argv.slice(2);
const { signManifest } = await import(pathToFileURL(path.join(repo, 'packages/shared/dist/index.js')).href);
const components = {};
for (const file of readdirSync(dir).filter((name) => name.endsWith('.zip'))) {
  const bytes = readFileSync(path.join(dir, file));
  components[file.slice(0, -4)] = {
    version,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    size: bytes.length,
    url: `https://example.invalid/${file}`,
  };
}
const manifest = { schema: 1, version, releasedAt: '2026-11-05T00:00:00Z', notes: '', components };
const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(path.join(dir, 'update.json'), bytes);
const key = readFileSync(path.join(homedir(), '.buybox', 'release-signing-key.pem'), 'utf8');
writeFileSync(path.join(dir, 'update.json.sig'), `${signManifest(bytes, key)}\n`);
