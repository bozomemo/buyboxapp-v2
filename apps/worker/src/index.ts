/**
 * apps/worker — the long-running job host (doc 07, doc 10 §1). `startWorker()` is the single
 * entry point both `apps/worker`'s own standalone process and `apps/web`'s single-process mode
 * (doc 10 §1.1) call — the job code is identical either way, only the host differs.
 *
 * Cadence note: `Scheduler`'s built-in `cadenceMs` mechanism (packages/jobs) enqueues a job with
 * an empty `'{}'` payload, which only works for jobs whose payload is entirely optional
 * (`PruneHistory`). Every other doc 07 §1 job is parametrised per marketplace (or, for
 * `ImportStockItems`, per configured product source) — so this file runs its own lightweight
 * per-target ticker that calls `scheduler.enqueueNow()` with the right payload on each job's
 * documented cadence. `ImportBundles` is deliberately **not** auto-cadenced: doc 10 §4 defines
 * no bundle *source* port, so (as already decided in Phase 5) it only ever runs from an
 * explicit payload — manually, via the Jobs screen, until a future source supplies one.
 */
import type { MarketplaceCode } from '@buybox/core';
import { checkSchemaVersion, configRepo, createDb, type AppDatabase } from '@buybox/db';
import { HepsiburadaAdapter, TrendyolAdapter, type IMarketplaceAdapter } from '@buybox/adapters';
import {
  buildAdapterRegistry,
  CONFIRM_SUBMISSIONS_JOB,
  confirmSubmissions,
  IMPORT_LISTINGS_JOB,
  IMPORT_STOCK_ITEMS_JOB,
  importListings,
  importStockItems,
  isJobEnabled,
  OBSERVE_BUYBOX_JOB,
  observeBuybox,
  PRUNE_HISTORY_JOB,
  pruneHistoryJob,
  REPRICE_JOB,
  reprice,
  RESET_BUDGET_JOB,
  resetBudget,
  Scheduler,
  submitPriceChanges,
  SUBMIT_PRICE_CHANGES_JOB,
  systemClock,
  type MarketplaceAdapterRegistry,
} from '@buybox/jobs';
import {
  FileSecretStore,
  marketplaceCredentialsKey,
  parseBootstrapEnv,
  type ISecretStore,
} from '@buybox/shared';

export interface WorkerHandle {
  readonly scheduler: Scheduler;
  readonly appDb: AppDatabase;
  readonly adapters: MarketplaceAdapterRegistry;
  shutdown(): Promise<void>;
}

/**
 * doc 07 §1's cadence table, in milliseconds. Kept in sync by hand with `JOB_CATALOG`
 * (packages/jobs) — the catalog's `cadenceMs` is what the Jobs screen (doc 12 6.9) *displays*
 * as each job's schedule, this is what actually fires; they must agree.
 */
const CADENCE_MS = {
  importListings: 30 * 60_000,
  observeBuybox: 60_000, // tiering (doc 07 §4) decides per-listing whether a poll is due
  reprice: 5 * 60_000, // conservative default; per-policy pollIntervalMs is honoured inside Reprice's own listing selection in a future refinement
  submitPriceChanges: 30_000,
  confirmSubmissions: 60_000,
  resetBudget: 60 * 60_000, // hourly check; ensureBudgetUsageRow is a no-op once today's row exists
  importStockItems: 24 * 60 * 60_000,
} as const;

async function buildAdapter(
  code: MarketplaceCode,
  secretStore: ISecretStore,
): Promise<IMarketplaceAdapter | undefined> {
  const raw = await secretStore.get(marketplaceCredentialsKey(code));
  if (!raw) return undefined;
  const credentials = JSON.parse(raw) as Record<string, string>;
  if (code === 'trendyol') {
    return new TrendyolAdapter({
      credentials: {
        apiKey: credentials.apiKey ?? '',
        apiSecret: credentials.apiSecret ?? '',
        sellerId: credentials.sellerId ?? '',
        userAgentSuffix: credentials.userAgentSuffix ?? 'SelfIntegration',
      },
    });
  }
  if (code === 'hepsiburada') {
    // Intentionally blocked (doc 12 Phase 4.4, api-references §2.9) — registered so it appears
    // in the UI and its (working) testConnection can honestly report why, not so it can trade.
    return new HepsiburadaAdapter();
  }
  return undefined;
}

/** Every marketplace with `enabled: true` and stored credentials becomes a registered adapter. */
async function buildAdapters(
  appDb: AppDatabase,
  secretStore: ISecretStore,
): Promise<MarketplaceAdapterRegistry> {
  const marketplaces = await configRepo.listMarketplaces(appDb);
  const entries: [MarketplaceCode, IMarketplaceAdapter][] = [];
  for (const marketplace of marketplaces) {
    if (!marketplace.enabled) continue;
    const code = marketplace.code as MarketplaceCode;
    const adapter = await buildAdapter(code, secretStore);
    if (adapter) entries.push([code, adapter]);
  }
  return buildAdapterRegistry(entries);
}

export interface StartWorkerOptions {
  readonly env?: Record<string, string | undefined>;
  /** Test/embedding hook: reuse an already-open database instead of opening one from env. */
  readonly appDb?: AppDatabase;
}

export async function startWorker(options: StartWorkerOptions = {}): Promise<WorkerHandle> {
  const env = parseBootstrapEnv(options.env ?? process.env);
  const appDb = options.appDb ?? createDb(env.DATABASE_URL);

  const versionStatus = await checkSchemaVersion(appDb);
  if (!versionStatus.upToDate) {
    // The setup wizard (doc 10 §6 step 1) is the only place migrations run interactively;
    // a worker boot with a stale schema must refuse rather than silently run DDL.
    throw new Error(
      `Schema version mismatch: ${versionStatus.appliedCount} of ${versionStatus.expectedCount} ` +
        `migrations applied. Run migrations from the setup wizard or 'npm run migrate' first.`,
    );
  }

  const secretStore = new FileSecretStore(env.SECRET_STORE_PATH, env.SECRET_STORE_KEY);
  const adapters = await buildAdapters(appDb, secretStore);

  const scheduler = new Scheduler({
    appDb,
    clock: systemClock,
    adapters,
    instanceId: `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`,
  });

  scheduler.register({ jobName: PRUNE_HISTORY_JOB, handler: pruneHistoryJob, cadenceMs: 24 * 60 * 60_000 });
  scheduler.register({ jobName: IMPORT_LISTINGS_JOB, handler: importListings });
  scheduler.register({ jobName: OBSERVE_BUYBOX_JOB, handler: observeBuybox });
  scheduler.register({ jobName: REPRICE_JOB, handler: reprice });
  scheduler.register({ jobName: SUBMIT_PRICE_CHANGES_JOB, handler: submitPriceChanges });
  scheduler.register({ jobName: CONFIRM_SUBMISSIONS_JOB, handler: confirmSubmissions });
  scheduler.register({ jobName: RESET_BUDGET_JOB, handler: resetBudget });
  scheduler.register({ jobName: IMPORT_STOCK_ITEMS_JOB, handler: importStockItems });

  scheduler.startLoop();

  const marketplaceCodes = [...adapters.keys()];
  const tickers: ReturnType<typeof setInterval>[] = [];
  const everyMarketplace = (
    jobName: string,
    intervalMs: number,
    extraPayload: Record<string, unknown> = {},
  ) => {
    tickers.push(
      setInterval(() => {
        void (async () => {
          // doc 12 6.9 "enable/disable" — an operator-disabled job simply doesn't fire.
          if (!(await isJobEnabled(appDb, jobName))) return;
          for (const marketplaceCode of marketplaceCodes) {
            void scheduler.enqueueNow(jobName, JSON.stringify({ marketplaceCode, ...extraPayload }));
          }
        })();
      }, intervalMs),
    );
  };
  everyMarketplace(IMPORT_LISTINGS_JOB, CADENCE_MS.importListings);
  everyMarketplace(OBSERVE_BUYBOX_JOB, CADENCE_MS.observeBuybox, { cycleNumber: 0 });
  everyMarketplace(REPRICE_JOB, CADENCE_MS.reprice, { mode: 'live' });
  everyMarketplace(SUBMIT_PRICE_CHANGES_JOB, CADENCE_MS.submitPriceChanges);
  everyMarketplace(CONFIRM_SUBMISSIONS_JOB, CADENCE_MS.confirmSubmissions);
  everyMarketplace(RESET_BUDGET_JOB, CADENCE_MS.resetBudget);

  const importStockItemsTicker = setInterval(() => {
    void (async () => {
      if (!(await isJobEnabled(appDb, IMPORT_STOCK_ITEMS_JOB))) return;
      const configured = await configRepo.getAppSetting(appDb, 'productSource.config');
      if (!configured) return; // wizard step 6 not completed yet
      const { sourceCode, sourceConfig } = JSON.parse(configured.value) as {
        sourceCode: string;
        sourceConfig: unknown;
      };
      await scheduler.enqueueNow(IMPORT_STOCK_ITEMS_JOB, JSON.stringify({ sourceCode, sourceConfig }));
    })();
  }, CADENCE_MS.importStockItems);
  tickers.push(importStockItemsTicker);

  return {
    scheduler,
    appDb,
    adapters,
    async shutdown() {
      for (const ticker of tickers) clearInterval(ticker);
      await scheduler.shutdown();
    },
  };
}
