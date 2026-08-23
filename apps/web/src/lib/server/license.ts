/**
 * The web process's licence gate (docs/13-licensing.md §6). The verification itself lives in
 * `@buybox/shared` (pure) and the database read in `@buybox/jobs` (`getLicenseStatus`); this
 * module only adds the short-lived in-process cache the middleware needs, so that gating every
 * request does not mean a database round-trip per request.
 *
 * `globalThis` caching for the same reason `db.ts` uses it: Next.js dev-mode module reloads
 * would otherwise reset it constantly. It is strictly best-effort — Next 16's proxy docs warn
 * that proxy code may not share globals with the render runtime — and a cache that never hits
 * simply means one database read per request, never a wrong verdict.
 */
import { getLicenseStatus } from '@buybox/jobs';
import { isLicensedToRun, LICENSE_CACHE_TTL_MS, type LicenseStatus } from '@buybox/shared';
import { getAppDb, isBootstrapped } from './db';

declare global {
  var __buyboxLicenseStatus: { status: LicenseStatus; atMs: number } | undefined;
}

/**
 * Dropped whenever the licence changes, so a freshly pasted licence takes effect on the very
 * next request rather than up to `LICENSE_CACHE_TTL_MS` later (doc 13 §4.2, R-LIC-5).
 */
export function invalidateLicenseCache(): void {
  globalThis.__buyboxLicenseStatus = undefined;
}

export async function readLicenseStatus(): Promise<LicenseStatus> {
  // Before the setup wizard's database step there is no database to read the stored licence
  // from. The environment variable is still honoured, so a container install that supplies
  // `LICENSE_TOKEN` is licensed from its first request; anything else is `missing`, which is
  // the correct fail-closed answer and is what puts a fresh install on the licence screen.
  if (!isBootstrapped()) {
    const { verifyLicense, resolveLicensePublicKey } = await import('@buybox/shared');
    return verifyLicense(process.env.LICENSE_TOKEN, {
      publicKeyPem: resolveLicensePublicKey(process.env),
      nowMs: Date.now(),
    });
  }

  try {
    return await getLicenseStatus(getAppDb(), { nowMs: Date.now() });
  } catch {
    // A database we cannot read means we cannot tell whether this install is licensed. Doc 13
    // §4 is fail-closed, so that is "stopped" — but it is reported as `missing` rather than
    // invented as a specific invalid reason, since nothing about the licence itself is known.
    return { state: 'missing' };
  }
}

/** Cached for `LICENSE_CACHE_TTL_MS` — the form the per-request middleware uses. */
export async function getCachedLicenseStatus(): Promise<LicenseStatus> {
  const cached = globalThis.__buyboxLicenseStatus;
  const nowMs = Date.now();
  if (cached && nowMs - cached.atMs < LICENSE_CACHE_TTL_MS) return cached.status;

  const status = await readLicenseStatus();
  globalThis.__buyboxLicenseStatus = { status, atMs: nowMs };
  return status;
}

export async function isWebLicensed(): Promise<boolean> {
  return isLicensedToRun(await getCachedLicenseStatus());
}
