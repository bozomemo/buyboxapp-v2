/**
 * The database-backed licence gate (docs/13-licensing.md §3, §4.3, §6) — the I/O half of
 * licensing, whose pure half is `verifyLicense` in `@buybox/shared`.
 *
 * This is the licensing counterpart of `isSystemPaused` in `scheduler.ts`: the *predicate*
 * lives in `packages/shared` so the UI and the scheduler can never drift apart on what
 * "licensed" means, and only the reading of the row lives here.
 */
import { configRepo, newId, type AppDatabase } from '@buybox/db';
import {
  isLicensedToRun,
  resolveLicensePublicKey,
  verifyLicense,
  LICENSE_LAST_SEEN_SETTING_KEY,
  LICENSE_TOKEN_ENV_VAR,
  LICENSE_TOKEN_SETTING_KEY,
  type LicenseStatus,
} from '@buybox/shared';

/**
 * How far the clock high-water mark (doc 13 §4.3) is allowed to lag before it is rewritten.
 * `setAppSetting` audits every write, and this is evaluated on every scheduler tick and every
 * uncached web request, so writing it each time would bury the settings audit trail under a
 * heartbeat. Six hours keeps rollback detection far finer-grained than the 24-hour tolerance
 * it feeds, at four audit rows a day.
 */
export const LICENSE_LAST_SEEN_WRITE_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** doc 13 §3 — environment first, then the row the setup wizard and Licence screen write. */
export async function readLicenseToken(
  appDb: AppDatabase,
  env: Record<string, string | undefined> = process.env,
): Promise<string | undefined> {
  const fromEnv = env[LICENSE_TOKEN_ENV_VAR];
  if (fromEnv !== undefined && fromEnv.trim() !== '') return fromEnv;
  const row = await configRepo.getAppSetting(appDb, LICENSE_TOKEN_SETTING_KEY);
  return row?.value;
}

async function readLastSeenMs(appDb: AppDatabase): Promise<number | undefined> {
  const row = await configRepo.getAppSetting(appDb, LICENSE_LAST_SEEN_SETTING_KEY);
  if (!row) return undefined;
  const parsed = Number(row.value);
  // A corrupted high-water mark must not become a permanent `clock-rollback`: an unparseable
  // value is treated as absent, and the next successful evaluation rewrites it.
  return Number.isFinite(parsed) ? parsed : undefined;
}

export interface LicenseGateOptions {
  readonly nowMs: number;
  readonly env?: Record<string, string | undefined>;
  /** This install's fingerprint, when one is computed. Binding is soft — see doc 13 §5. */
  readonly fingerprint?: string;
}

/**
 * Reads the configured licence, evaluates it against `nowMs`, and advances the clock
 * high-water mark. Returns a status; never throws for an unlicensed install, because "not
 * licensed" is an ordinary state both the UI and the scheduler have to render, not a fault.
 *
 * A database error *is* left to throw: it means we cannot tell whether the install is
 * licensed, and callers treat that as stopped (fail-closed, doc 13 §4).
 */
export async function getLicenseStatus(
  appDb: AppDatabase,
  options: LicenseGateOptions,
): Promise<LicenseStatus> {
  const { nowMs, env = process.env, fingerprint } = options;
  const token = await readLicenseToken(appDb, env);
  const lastSeenMs = await readLastSeenMs(appDb);

  const status = verifyLicense(token, {
    publicKeyPem: resolveLicensePublicKey(env),
    nowMs,
    lastSeenMs,
    fingerprint,
  });

  // Only advance the mark on a monotonic step forward, and only from a licence that actually
  // verified: writing it from an unlicensed install would let a fresh, never-licensed copy
  // seed its own high-water mark, and writing it backwards would erase the very evidence a
  // rollback is detected against.
  if (isLicensedToRun(status)) {
    const stale = lastSeenMs === undefined || nowMs - lastSeenMs >= LICENSE_LAST_SEEN_WRITE_INTERVAL_MS;
    if (stale && (lastSeenMs === undefined || nowMs > lastSeenMs)) {
      await configRepo.setAppSetting(
        appDb,
        {
          key: LICENSE_LAST_SEEN_SETTING_KEY,
          value: String(nowMs),
          updatedBy: 'system:license',
          updatedAt: nowMs,
        },
        newId(),
      );
    }
  }

  return status;
}

/** Fail-closed convenience for callers that only need the yes/no (doc 13 §4). */
export async function isLicensed(appDb: AppDatabase, nowMs: number): Promise<boolean> {
  return isLicensedToRun(await getLicenseStatus(appDb, { nowMs }));
}
