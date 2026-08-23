/**
 * Vendor-side: signs a licence token for a customer (docs/13-licensing.md §7).
 *
 *   node scripts/issue-license.mjs --customer "Örnek Ticaret A.Ş." --months 12
 *   node scripts/issue-license.mjs --customer "Deneme" --days 30 --edition trial
 *   node scripts/issue-license.mjs --customer "X" --months 12 --fingerprint <sha256>
 *
 * There is no revocation channel by design (doc 13 §1), so **keep terms short** — not renewing
 * is the only revocation that exists. Annual for established customers, monthly for new ones.
 *
 * Requires the private key in `.license-keys/`, which only the vendor holds; run
 * `node scripts/generate-license-keypair.mjs` first if it is not there.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { signLicense, verifyLicense, resolveLicensePublicKey } from '@buybox/shared';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRIVATE_PATH = path.join(repoRoot, '.license-keys', 'license-signing-key.pem');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!key?.startsWith('--')) throw new Error(`Unexpected argument: ${key}`);
    args[key.slice(2)] = argv[i + 1];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (!args.customer) {
  console.error('Usage: node scripts/issue-license.mjs --customer "Name" [--months 12 | --days 30]');
  console.error('       [--edition standard|trial] [--fingerprint <sha256>] [--max-listings N]');
  process.exit(1);
}

if (!existsSync(PRIVATE_PATH)) {
  console.error(`No signing key at ${PRIVATE_PATH}. Run: node scripts/generate-license-keypair.mjs`);
  process.exit(1);
}

const edition = args.edition ?? 'standard';
if (edition !== 'standard' && edition !== 'trial') {
  console.error(`--edition must be 'standard' or 'trial', got '${edition}'.`);
  process.exit(1);
}

const now = new Date();
const expires = new Date(now);
if (args.days !== undefined) {
  expires.setUTCDate(expires.getUTCDate() + Number(args.days));
} else {
  // Default term is 12 months. Calendar months, not 30-day blocks, so an annual renewal lands
  // on the same date each year and matches whatever the invoice says.
  expires.setUTCMonth(expires.getUTCMonth() + Number(args.months ?? 12));
}

const claims = {
  v: 1,
  id: `LIC-${randomUUID()}`,
  customer: args.customer,
  issuedAt: now.toISOString(),
  expiresAt: expires.toISOString(),
  edition,
  ...(args.fingerprint ? { fingerprint: args.fingerprint } : {}),
  ...(args['max-listings'] ? { maxListings: Number(args['max-listings']) } : {}),
};

const token = signLicense(claims, readFileSync(PRIVATE_PATH, 'utf8'));

// Verified against the *compiled-in* public key before it is handed over, so a key that was
// rotated in `.license-keys/` but never pasted into `public-key.ts` is caught here rather than
// by the customer, on the install, at activation time.
const status = verifyLicense(token, {
  publicKeyPem: resolveLicensePublicKey(process.env),
  nowMs: Date.now(),
});
if (status.state !== 'valid') {
  console.error(`Issued token does not verify against the compiled-in public key (${status.state}).`);
  console.error('The signing key and packages/shared/src/license/public-key.ts disagree — see doc 13 §7.');
  process.exit(1);
}

console.log(`Customer: ${claims.customer}`);
console.log(`Licence:  ${claims.id}`);
console.log(`Edition:  ${claims.edition}`);
console.log(`Expires:  ${claims.expiresAt}`);
console.log('\nToken (give this to the customer):\n');
console.log(token);
