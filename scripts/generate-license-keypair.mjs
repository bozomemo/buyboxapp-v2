/**
 * Vendor-side, run once: creates the Ed25519 licence-signing keypair (docs/13-licensing.md §7).
 *
 * The private key is written to `.license-keys/`, which is gitignored. **Back it up offline.**
 * Losing it does not break licences already in the field — they still verify — but no new one
 * can ever be issued, and replacing the public key invalidates every licence at once.
 *
 *   node scripts/generate-license-keypair.mjs
 */
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DIR = path.join(process.cwd(), '.license-keys');
const PRIVATE_PATH = path.join(DIR, 'license-signing-key.pem');
const PUBLIC_PATH = path.join(DIR, 'license-public-key.pem');

// Refuses to overwrite: regenerating over an existing key would silently invalidate every
// licence already issued from it, with no way back.
if (existsSync(PRIVATE_PATH)) {
  console.error(`Refusing to overwrite an existing signing key at ${PRIVATE_PATH}.`);
  console.error('Delete it deliberately first if you really mean to rotate — see doc 13 §7.');
  process.exit(1);
}

mkdirSync(DIR, { recursive: true });
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

writeFileSync(PRIVATE_PATH, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), {
  mode: 0o600,
});
writeFileSync(PUBLIC_PATH, publicPem);

console.log(`Private key: ${PRIVATE_PATH}  (gitignored — back this up offline)`);
console.log(`Public key:  ${PUBLIC_PATH}`);
console.log('\nPaste the public key into packages/shared/src/license/public-key.ts:\n');
console.log(publicPem);
