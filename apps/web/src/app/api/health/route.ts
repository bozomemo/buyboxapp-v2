/**
 * Liveness and schema report (doc 14 §5.1). The installer polls this after starting the service
 * and **fails the installation** if it never answers — so this route's job is to answer, always,
 * and to say what is wrong in the body rather than by failing.
 *
 * Two consequences shape it:
 *
 * 1. It is exempt from the licence gate (`apps/web/src/proxy.ts`). Verification happens before
 *    any licence exists, and a 402 here would make every first install look broken.
 * 2. It returns 200 even when the database is unreachable or unmigrated. It *reports*
 *    connectivity; it does not depend on it. A fresh install has no `.env.local` at all until
 *    the wizard writes one, and that is a healthy process, not a failed one.
 *
 * `status` is therefore about the process: `ok` once the database answers and its schema matches
 * this build, `degraded` while anything below that is still true.
 */
import { NextResponse } from 'next/server';
import { checkSchemaVersion, configRepo, inferDialect, sqliteFilePath } from '@buybox/db';
import { getAppDb, isBootstrapped, tryGetBootstrapEnv } from '@/lib/server/db';
import { getWorkerStatus } from '@/lib/server/worker-status';

export const dynamic = 'force-dynamic';

interface DatabaseReport {
  readonly configured: boolean;
  readonly reachable: boolean;
  readonly dialect?: string;
  readonly schema?: { readonly drift: string; readonly applied: number; readonly expected: number };
  readonly error?: string;
}

async function describeDatabase(): Promise<DatabaseReport> {
  if (!isBootstrapped()) return { configured: false, reachable: false };
  try {
    const appDb = getAppDb();
    const status = await checkSchemaVersion(appDb);
    return {
      configured: true,
      reachable: true,
      dialect: appDb.dialect,
      schema: { drift: status.drift, applied: status.appliedCount, expected: status.expectedCount },
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * The database the *configuration* currently names, in the same form the worker reports — an
 * absolute path for SQLite. Comparing the two is the whole point: the worker opens its
 * connection once at boot and the setup wizard can rewrite `DATABASE_URL` afterwards, which on
 * 2026-08-24 left one process running two halves against two different files, each of them
 * individually healthy.
 */
function configuredDatabaseTarget(): string | undefined {
  const env = tryGetBootstrapEnv();
  if (!env) return undefined;
  try {
    return inferDialect(env.DATABASE_URL) === 'sqlite'
      ? sqliteFilePath(env.DATABASE_URL)
      : env.DATABASE_URL;
  } catch {
    return env.DATABASE_URL;
  }
}

/**
 * Marketplaces the operator has switched on, or `undefined` when the database cannot be read.
 *
 * `undefined` and `[]` mean different things here and must not be collapsed: an unreachable
 * database is already reported by `describeDatabase`, and inferring "no marketplace is enabled"
 * from a failed read would raise a second, wrong warning on top of it.
 */
async function enabledMarketplaceCodes(): Promise<string[] | undefined> {
  if (!isBootstrapped()) return undefined;
  try {
    const marketplaces = await configRepo.listMarketplaces(getAppDb());
    return marketplaces.filter((m) => m.enabled).map((m) => m.code);
  } catch {
    return undefined;
  }
}

export async function GET() {
  const database = await describeDatabase();
  const worker = getWorkerStatus();
  const configured = configuredDatabaseTarget();

  const warnings: string[] = [];
  // A worker on a different database than the web half is the failure this route exists to
  // make visible. It is a `degraded`, not a note: jobs queue up and nothing ever runs them.
  if (worker.running && configured && worker.databaseTarget !== configured) {
    warnings.push(
      `Worker farklı bir veritabanına bağlı (${worker.databaseTarget}), yapılandırma ise ${configured}. Servisi yeniden başlatın.`,
    );
  }
  // Ticks are two seconds apart; a minute of silence means the loop has stopped, whatever the
  // reason. Reported rather than diagnosed — the log is where the reason lives.
  if (worker.running && worker.msSinceLastTick !== undefined && worker.msSinceLastTick > 60_000) {
    warnings.push(`Worker ${Math.round(worker.msSinceLastTick / 1000)} saniyedir tick atmadı.`);
  }
  // An enabled marketplace the worker holds no adapter for. Every job targeting it fails with
  // `No marketplace adapter registered for "<code>"` while the Marketplaces screen still shows
  // it ticked — the contradiction was previously only visible in the job errors themselves.
  //
  // Only ever raised against a marketplace the operator actually switched on, which is what
  // keeps it off a fresh install: nothing is enabled there, so this stays silent and the
  // installer's `status: ok` check (§5 step 8) is unaffected. A brief window right after
  // enabling one is expected and correct — the worker rebuilds its registries within
  // `MARKETPLACE_RELOAD_INTERVAL_MS`, and jobs really do fail until it has.
  const enabled = await enabledMarketplaceCodes();
  if (worker.running && enabled && worker.marketplaces) {
    const registered = new Set(worker.marketplaces);
    const missing = enabled.filter((code) => !registered.has(code));
    if (missing.length > 0) {
      warnings.push(
        `${missing.join(', ')} etkin görünüyor ama worker bu pazaryeri için adapter kuramadı — ` +
          'kimlik bilgileri eksik veya okunamıyor. İşler "No marketplace adapter registered" ile ' +
          'hata verir. Ayarlar > Pazaryerleri ekranından kimlik bilgilerini yeniden girip kaydedin.',
      );
    }
  }

  const healthy =
    database.reachable && database.schema?.drift === 'up-to-date' && warnings.length === 0;
  return NextResponse.json({
    status: healthy ? 'ok' : 'degraded',
    version: process.env.APP_VERSION ?? null,
    database,
    // `configured` is reported even when no worker runs here: on a split deployment the web
    // process has no embedded worker at all, and `running: false` is then correct, not a fault.
    worker: { ...worker, configuredDatabase: configured ?? null },
    warnings,
    at: new Date().toISOString(),
  });
}
