/**
 * Vendor-side, run once: creates the Ed25519 release-signing keypair that signs `update.json`
 * (docs/superpowers/specs/2026-11-04-auto-update-design.md §7).
 *
 * Deliberately a different key from the licence key (doc 14 §12), so one leak is not both.
 *
 * The private key is written to `%USERPROFILE%\.buybox\release-signing-key.pem` — outside the
 * repository and outside OneDrive, because a synced copy is a copy someone else's machine holds.
 * **Back it up offline.** Losing it does not break installs, but the next release signed with a
 * new key has to be installed by hand with the full installer: installs only trust the keys
 * compiled into them.
 *
 *   node scripts/generate-release-keypair.mjs
 */
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const DIR = path.join(homedir(), '.buybox');
const PRIVATE_PATH = path.join(DIR, 'release-signing-key.pem');

// Refuses to overwrite: regenerating over an existing key would leave every install trusting a
// key nobody holds any more.
if (existsSync(PRIVATE_PATH)) {
  console.error(`Refusing to overwrite an existing release signing key at ${PRIVATE_PATH}.`);
  console.error('Delete it deliberately first if you really mean to rotate — see the spec §7.');
  process.exit(1);
}

mkdirSync(DIR, { recursive: true });
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

writeFileSync(PRIVATE_PATH, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), {
  mode: 0o600,
});

console.log(`Private key: ${PRIVATE_PATH}  (outside the repository — back this up offline)`);
console.log('\nPaste the public key into packages/shared/src/release/public-key.ts:\n');
console.log(publicPem);
