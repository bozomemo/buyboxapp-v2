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
 * cadence. `ImportBundles` is deliberately **not** auto-cadenced: doc 10 §4 defines no bundle
 * *source* port, so (as already decided in Phase 5) it only ever runs from an explicit payload —
 * manually, via the Jobs screen, until a future source supplies one.
 *
 * Every cadence — the tickers' interval and `PruneHistory`'s `scheduler.register` cadence alike —
 * is resolved once, here, via `getJobCadenceMs` (doc 07 §8, doc 08 §12): a stored operator
 * override if present, else `JOB_CATALOG`'s compiled default. This is the *only* place cadence is
 * read; there is no second hardcoded copy to drift out of sync with the Jobs screen. A changed
 * override takes effect on the worker's next restart, not mid-process — the same startup-time
 * read the scrape rate limit and marketplace credentials already use.
 */
import type { MarketplaceCode } from '@buybox/core';
import { checkSchemaVersion, configRepo, createDb, type AppDatabase } from '@buybox/db';
import {
  HepsiburadaAdapter,
  HepsiburadaCredentialsSchema,
  HepsiburadaPublicListingsSource,
  TrendyolAdapter,
  TRENDYOL_STAGE_BASE_URL,
  TrendyolPublicPageSource,
  type ICompetitorSource,
  type IMarketplaceAdapter,
} from '@buybox/adapters';
import {
  buildAdapterRegistry,
  syncMerchantRef,
  buildCompetitorSourceRegistry,
  CONFIRM_SUBMISSIONS_JOB,
  confirmSubmissions,
  getJobCadenceMs,
  getScrapeRateLimit,
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
  SCRAPE_COMPETITORS_JOB,
  scrapeCompetitors,
  Scheduler,
  submitPriceChanges,
  SUBMIT_PRICE_CHANGES_JOB,
  systemClock,
  type CompetitorSourceRegistry,
  type MarketplaceAdapterRegistry,
} from '@buybox/jobs';
import {
  createLogger,
  FileSecretStore,
  marketplaceCredentialsKey,
  parseBootstrapEnv,
  type ISecretStore,
} from '@buybox/shared';

const logger = createLogger({ name: 'worker' });

export interface WorkerHandle {
  readonly scheduler: Scheduler;
  readonly appDb: AppDatabase;
  readonly adapters: MarketplaceAdapterRegistry;
  readonly competitorSources: CompetitorSourceRegistry;
  shutdown(): Promise<void>;
}

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
      // api-references §1.1: stage becomes production by swapping host; `environment` rides
      // along in the stored credentials blob, same as Hepsiburada below.
      baseUrl: credentials.environment === 'stage' ? TRENDYOL_STAGE_BASE_URL : undefined,
    });
  }
  if (code === 'hepsiburada') {
    const parsed = HepsiburadaCredentialsSchema.safeParse(credentials);
    // Malformed or incomplete credentials leave the marketplace unregistered rather than
    // producing an adapter that fails on every call: an unregistered marketplace is visibly
    // absent, while a registered broken one looks like a transient outage.
    if (!parsed.success) return undefined;
    return new HepsiburadaAdapter({
      credentials: parsed.data,
      environment: credentials.environment === 'sit' ? 'sit' : 'production',
      // api-references §2.6: on a malformed submission no upload id is returned and this
      // header is the only handle a merchant support ticket has, for 7 days.
      onCorrelation: (correlation) => {
        if (correlation.correlationId === null) return;
        logger.info('hepsiburada.correlation', { ...correlation });
      },
    });
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
    if (!adapter) continue;
    entries.push([code, adapter]);
    // Our own seller id, recorded from the credentials this adapter just authenticated with.
    // Done here rather than only in `ImportListings` because this runs on every boot whatever
    // the operator has enabled — and `ImportListings` can be switched off while
    // `ScrapeCompetitors`, which needs the value to tell our offer from a competitor's, keeps
    // running. See `syncMerchantRef` for why a stale value is silent rather than loud.
    await syncMerchantRef(appDb, code, adapter.merchantRef, Date.now());
  }
  return buildAdapterRegistry(entries);
}

/**
 * Reporting-only competitor sources (doc 07 §7, api-references §1.6). Built for every enabled
 * marketplace that has a scraper, independently of the marketplace adapters: this registry
 * exists so competitor *history* can be collected, and nothing on the control path reads it.
 *
 * The `ScrapeCompetitors` job is off by default (`JOB_CATALOG.defaultEnabled: false`), so
 * registering a source here does not start any scraping — an operator still has to switch the
 * job on, which is the "explicit business decision" api-references §1.6 requires.
 *
 * Note that Hepsiburada's source is registered even though its *adapter* is blocked (doc 12
 * Phase 4.4): the public listings endpoint needs no marketplace credential, so the two are
 * genuinely independent. Until the adapter is unblocked there are no Hepsiburada listings to
 * scrape, and this registry entry simply never gets asked for one.
 *
 * Both sources are given `SCRAPER_BROWSER_USER_AGENT` (doc 08 §12, api-references §1.6/§2.11):
 * an honest `SCRAPER_USER_AGENT` gets a 403 from both marketplaces' bot detection even at a
 * conservative request rate — confirmed 2026-08-17 by the operator's own browser reaching the
 * same Trendyol product page without incident from the same network while the honest agent was
 * blocked. The product owner authorised the same reporting-only exception already in place for
 * Hepsiburada (2026-08-13) for Trendyol on 2026-08-17. `SCRAPER_USER_AGENT` is currently unused
 * by any scraper as a result; it stays in the config schema for a future honest source.
 *
 * Rate/burst are read from `app_settings` (`getScrapeRateLimit`, doc 08 §12) so an operator who
 * hits a run of 403s (doc 06 §7/§8) can slow a scraper down without a code change — falling
 * back to each source's own conservative compiled default when nothing has been stored. This is
 * a startup-time read, same as the credentials above: a changed rate limit takes effect on the
 * next worker restart, not mid-process.
 */
async function buildCompetitorSources(
  appDb: AppDatabase,
  adapters: MarketplaceAdapterRegistry,
  browserUserAgent: string,
): Promise<CompetitorSourceRegistry> {
  const entries: [MarketplaceCode, ICompetitorSource][] = [];
  if (adapters.has('trendyol')) {
    const rateLimit = await getScrapeRateLimit(appDb, 'trendyol');
    entries.push([
      'trendyol',
      new TrendyolPublicPageSource({
        userAgent: browserUserAgent,
        requestsPerMinute: rateLimit?.requestsPerMinute,
        burst: rateLimit?.burst,
      }),
    ]);
  }
  if (adapters.has('hepsiburada')) {
    const rateLimit = await getScrapeRateLimit(appDb, 'hepsiburada');
    entries.push([
      'hepsiburada',
      new HepsiburadaPublicListingsSource({
        userAgent: browserUserAgent,
        requestsPerMinute: rateLimit?.requestsPerMinute,
        burst: rateLimit?.burst,
      }),
    ]);
  }
  return buildCompetitorSourceRegistry(entries);
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
  // `SCRAPER_BROWSER_USER_AGENT` is the recorded exception for both reporting-only scrapers
  // (api-references §1.6, §2.11) — deployment configuration, not a constant.
  const competitorSources = await buildCompetitorSources(appDb, adapters, env.SCRAPER_BROWSER_USER_AGENT);

  // Resolved once, at boot (doc 07 §8): a stored operator override if present, else
  // `JOB_CATALOG`'s compiled default.
  const [
    pruneHistoryCadence,
    importListingsCadence,
    observeBuyboxCadence,
    repriceCadence,
    submitPriceChangesCadence,
    confirmSubmissionsCadence,
    resetBudgetCadence,
    scrapeCompetitorsCadence,
    importStockItemsCadence,
  ] = await Promise.all([
    getJobCadenceMs(appDb, PRUNE_HISTORY_JOB),
    getJobCadenceMs(appDb, IMPORT_LISTINGS_JOB),
    getJobCadenceMs(appDb, OBSERVE_BUYBOX_JOB),
    getJobCadenceMs(appDb, REPRICE_JOB),
    getJobCadenceMs(appDb, SUBMIT_PRICE_CHANGES_JOB),
    getJobCadenceMs(appDb, CONFIRM_SUBMISSIONS_JOB),
    getJobCadenceMs(appDb, RESET_BUDGET_JOB),
    getJobCadenceMs(appDb, SCRAPE_COMPETITORS_JOB),
    getJobCadenceMs(appDb, IMPORT_STOCK_ITEMS_JOB),
  ]);
  // None of these jobs has a null default cadence, so the `??` fallback only ever guards a
  // theoretical `getJobCadenceMs` bug, not a real code path.
  const pruneHistoryCadenceMs = pruneHistoryCadence ?? 60_000;
  const importListingsCadenceMs = importListingsCadence ?? 60_000;
  const observeBuyboxCadenceMs = observeBuyboxCadence ?? 60_000;
  const repriceCadenceMs = repriceCadence ?? 60_000;
  const submitPriceChangesCadenceMs = submitPriceChangesCadence ?? 60_000;
  const confirmSubmissionsCadenceMs = confirmSubmissionsCadence ?? 60_000;
  const resetBudgetCadenceMs = resetBudgetCadence ?? 60_000;
  const scrapeCompetitorsCadenceMs = scrapeCompetitorsCadence ?? 60_000;
  const importStockItemsCadenceMs = importStockItemsCadence ?? 60_000;

  const scheduler = new Scheduler({
    appDb,
    clock: systemClock,
    adapters,
    competitorSources,
    instanceId: `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`,
  });

  scheduler.register({ jobName: PRUNE_HISTORY_JOB, handler: pruneHistoryJob, cadenceMs: pruneHistoryCadenceMs });
  scheduler.register({ jobName: IMPORT_LISTINGS_JOB, handler: importListings });
  scheduler.register({ jobName: OBSERVE_BUYBOX_JOB, handler: observeBuybox });
  scheduler.register({ jobName: REPRICE_JOB, handler: reprice });
  scheduler.register({ jobName: SUBMIT_PRICE_CHANGES_JOB, handler: submitPriceChanges });
  scheduler.register({ jobName: CONFIRM_SUBMISSIONS_JOB, handler: confirmSubmissions });
  scheduler.register({ jobName: RESET_BUDGET_JOB, handler: resetBudget });
  scheduler.register({ jobName: IMPORT_STOCK_ITEMS_JOB, handler: importStockItems });
  scheduler.register({ jobName: SCRAPE_COMPETITORS_JOB, handler: scrapeCompetitors });

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
  everyMarketplace(IMPORT_LISTINGS_JOB, importListingsCadenceMs);
  everyMarketplace(OBSERVE_BUYBOX_JOB, observeBuyboxCadenceMs, { cycleNumber: 0 });
  everyMarketplace(REPRICE_JOB, repriceCadenceMs, { mode: 'live' });
  everyMarketplace(SUBMIT_PRICE_CHANGES_JOB, submitPriceChangesCadenceMs);
  everyMarketplace(CONFIRM_SUBMISSIONS_JOB, confirmSubmissionsCadenceMs);
  everyMarketplace(RESET_BUDGET_JOB, resetBudgetCadenceMs);
  // Off unless the operator enabled it — `isJobEnabled` inside `everyMarketplace` gates this.
  everyMarketplace(SCRAPE_COMPETITORS_JOB, scrapeCompetitorsCadenceMs, { cycleNumber: 0 });

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
  }, importStockItemsCadenceMs);
  tickers.push(importStockItemsTicker);

  return {
    scheduler,
    appDb,
    adapters,
    competitorSources,
    async shutdown() {
      for (const ticker of tickers) clearInterval(ticker);
      await scheduler.shutdown();
      // Releases TrendyolPublicPageSource's Playwright browser (2026-08-17) and any other
      // source-owned resource; a no-op for sources that hold nothing (competitor-source.ts).
      await Promise.all([...competitorSources.values()].map((source) => source.close?.()));
    },
  };
}
