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
 *
 * One run at a time, per target: these tickers call `scheduler.enqueueNow` directly and so do
 * not pass through `Scheduler.tick`'s own `countActiveJobs` guard. Each `fire` therefore checks
 * `countActiveJobsForTarget` itself before enqueueing, keying on job name *and* the target
 * marketplace read out of the payload, so that a slow Trendyol run never suppresses the
 * Hepsiburada one. Without it a job slower than its own
 * cadence enqueues a fresh copy on every tick and the backlog grows without bound — reachable
 * since cadence became operator-editable (doc 07 §8.1), whose 10 s floor is well under a real
 * catalogue import.
 *
 * Due time, not interval: each ticker keeps *when its job is next due* — one cadence after the
 * last run **started**, read from `job_runs` at boot — and checks it every minute (or every
 * cadence, if shorter). A restart therefore costs at most one check. It used to be
 * `setInterval(fn, cadenceMs)` plus a boot-time "last run *finished* + cadence" check, and
 * nightly restarts in production turned that into a daily job running every other day: see
 * `cadence-clock.ts`. A job that has never run counts as due, so a fresh install doesn't wait a
 * full cadence for its first run. Granularity is per job name, not per marketplace — the same
 * granularity the ticker itself fires at (every marketplace together).
 */
import { hostname } from 'node:os';
import { checkEveryMs, createCadenceClock } from './cadence-clock.js';
import type { MarketplaceCode } from '@buybox/core';
import {
  autoMigrate,
  checkSchemaVersion,
  configRepo,
  createDb,
  eventsRepo,
  inferDialect,
  jobsRepo,
  newId,
  sqliteFilePath,
  type AppDatabase,
} from '@buybox/db';
import {
  HepsiburadaAdapter,
  HepsiburadaCredentialsSchema,
  HepsiburadaBrandCatalogueSource,
  HepsiburadaProductDetailSource,
  HepsiburadaPublicListingsSource,
  TrendyolAdapter,
  TRENDYOL_STAGE_BASE_URL,
  TrendyolBrandCatalogueSource,
  TrendyolSellerIdentitySource,
  TrendyolPublicPageSource,
  type AdaptiveRateChange,
  type IBrandCatalogueSource,
  type IProductDetailSource,
  type ISellerIdentitySource,
  type ICompetitorSource,
  type IMarketplaceAdapter,
} from '@buybox/adapters';
import {
  buildAdapterRegistry,
  syncMerchantRef,
  buildBrandCatalogueSourceRegistry,
  buildProductDetailSourceRegistry,
  buildSellerIdentitySourceRegistry,
  buildCompetitorSourceRegistry,
  CONFIRM_SUBMISSIONS_JOB,
  confirmSubmissions,
  getJobCadenceMs,
  getScrapeRateLimit,
  IMPORT_LISTINGS_JOB,
  IMPORT_STOCK_ITEMS_JOB,
  IMPORT_BUNDLES_JOB,
  importBundles,
  importListings,
  importStockItems,
  resolveImportStockItemsPayload,
  isJobDispatchable,
  isJobEnabled,
  jobModule,
  OBSERVE_BUYBOX_JOB,
  observeBuybox,
  PRUNE_HISTORY_JOB,
  pruneHistoryJob,
  REPRICE_JOB,
  reprice,
  RESCAN_TRACKED_PRODUCTS_JOB,
  rescanTrackedProducts,
  SCRAPE_BRAND_SELLERS_JOB,
  scrapeBrandSellers,
  RESET_BUDGET_JOB,
  resetBudget,
  SCRAPE_COMPETITORS_JOB,
  scrapeCompetitors,
  Scheduler,
  readDispatchGate,
  readEnabledModules,
  RESOLVE_PRODUCT_BARCODES_JOB,
  RESOLVE_SELLER_IDENTITY_JOB,
  resolveProductBarcodes,
  resolveSellerIdentity,
  SWEEP_BRAND_CATALOGUE_JOB,
  SWEEP_LISTED_PRODUCTS_JOB,
  SWEEP_TRACKED_PRODUCTS_JOB,
  sweepBrandCatalogue,
  sweepListedProducts,
  sweepTrackedProducts,
  EVALUATE_BRAND_FINDINGS_JOB,
  evaluateBrandFindings,
  submitPriceChanges,
  SUBMIT_PRICE_CHANGES_JOB,
  systemClock,
  type BrandCatalogueSourceRegistry,
  type CompetitorSourceRegistry,
  type MarketplaceAdapterRegistry,
  type ProductDetailSourceRegistry,
  type SellerIdentitySourceRegistry,
  isPidAlive,
  releaseLocksOfDeadLocalWorkers,
  workerInstanceId,
} from '@buybox/jobs';
import {
  createLogger,
  FileSecretStore,
  marketplaceCredentialsKey,
  parseBootstrapEnv,
  type BootstrapEnv,
  type ISecretStore,
} from '@buybox/shared';

const logger = createLogger({ name: 'worker' });

export interface WorkerHandle {
  readonly scheduler: Scheduler;
  readonly appDb: AppDatabase;
  readonly adapters: MarketplaceAdapterRegistry;
  readonly competitorSources: CompetitorSourceRegistry;
  readonly brandCatalogueSources: BrandCatalogueSourceRegistry;
  readonly sellerIdentitySources: SellerIdentitySourceRegistry;
  readonly productDetailSources: ProductDetailSourceRegistry;
  /**
   * The database this worker actually opened, resolved to an absolute SQLite path where that
   * applies. Reported so `/api/health` can compare it against the configured `DATABASE_URL`:
   * the worker opens its connection once at boot, while the setup wizard can rewrite the
   * setting afterwards, and on 2026-08-24 that left the two halves of one process running
   * against two different files with no error on either side.
   */
  readonly databaseTarget: string;
  readonly startedAtMs: number;
  /**
   * The cadence, in milliseconds, this worker is *actually* firing each job at — resolved once
   * at boot (`getJobCadenceMs`) and fixed for the process's lifetime, keyed by job name. Jobs
   * with no cadence at all (`ImportBundles`) are absent.
   *
   * Reported for the same reason `databaseTarget` above is: the Jobs screen used to compute its
   * "next run" column from the cadence stored in `app_settings`, which is the value an operator
   * has *saved*, not the value anything is firing at. Saving an override therefore moved the
   * displayed time immediately while the worker kept its boot-time interval — the screen
   * contradicting, in the next column, its own "takes effect on the next restart" note. With
   * this the screen can show what will really happen, and say plainly when the two differ.
   */
  readonly cadenceMsByJobName: ReadonlyMap<string, number>;
  shutdown(): Promise<void>;
}

/** Absolute file path for SQLite, the URL itself otherwise — something two processes can compare. */
export function describeDatabaseTarget(databaseUrl: string): string {
  try {
    return inferDialect(databaseUrl) === 'sqlite' ? sqliteFilePath(databaseUrl) : databaseUrl;
  } catch {
    return databaseUrl;
  }
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
  // A brand-only install enables marketplaces to watch them and never enters seller credentials
  // (doc 17 §1.4), so an enabled marketplace without an adapter is its normal state, not a fault.
  const sellerModuleEnabled = (await readEnabledModules(appDb)).seller;
  const entries: [MarketplaceCode, IMarketplaceAdapter][] = [];
  for (const marketplace of marketplaces) {
    if (!marketplace.enabled) continue;
    const code = marketplace.code as MarketplaceCode;
    const adapter = await buildAdapter(code, secretStore);
    if (!adapter) {
      if (!sellerModuleEnabled) continue;
      // An enabled marketplace whose credentials are absent or malformed. `buildAdapter` returns
      // `undefined` on purpose — an unregistered marketplace is visibly absent where a registered
      // broken one looks like a transient outage — but skipping it in silence is how this ends up
      // being diagnosed from `No marketplace adapter registered for "trendyol"` on every job
      // instead. Say it once, here, where the reason is still known. `/api/health` reports the
      // same contradiction for anyone not reading the log.
      logger.warn('worker.marketplaceEnabledWithoutCredentials', { marketplaceCode: code });
      continue;
    }
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
 * The marketplaces the public-page sources are built for: every **enabled** marketplace row,
 * whether or not seller credentials were stored for it.
 *
 * Until doc 17 the sources below were built only where a marketplace *adapter* existed, which
 * made "enabled" and "has seller credentials" the same test. A brand-only install never enters
 * seller credentials (doc 17 §1.4), and every source here reads a public page that needs none —
 * so tying them to the adapter left such an install with no sources at all, and every brand job
 * failing with `no competitor source registered`.
 */
async function enabledMarketplaceCodes(appDb: AppDatabase): Promise<ReadonlySet<MarketplaceCode>> {
  const marketplaces = await configRepo.listMarketplaces(appDb);
  return new Set(
    marketplaces
      .filter((m) => m.enabled && (m.code === 'trendyol' || m.code === 'hepsiburada'))
      .map((m) => m.code as MarketplaceCode),
  );
}

/**
 * Puts each move of a source's adaptive rate in the event log (doc 07 §7.7).
 *
 * A decrease is `warn`: the system changed its own pace because the marketplace pushed back, and
 * an operator wondering why a sweep slowed down has to be able to find out. An increase is
 * `info` — it is the expected recovery, one per quiet interval.
 *
 * Fire-and-forget because the source calls this synchronously from inside a fetch; a failed
 * write is logged to the process log and never reaches the scrape.
 */
function logRateChange(appDb: AppDatabase, marketplaceCode: MarketplaceCode) {
  return (change: AdaptiveRateChange): void => {
    const decrease = change.direction === 'decrease';
    const message = decrease
      ? `Scrape rate for ${marketplaceCode} lowered ${change.fromPerMinute} → ${change.toPerMinute}/min after HTTP 429; requests paused ${Math.round(change.pauseMs / 1000)} s (ceiling ${change.ceilingPerMinute}/min)`
      : `Scrape rate for ${marketplaceCode} raised ${change.fromPerMinute} → ${change.toPerMinute}/min after a quiet interval (ceiling ${change.ceilingPerMinute}/min)`;
    eventsRepo
      .logEvent(appDb, {
        id: newId(),
        at: Date.now(),
        level: decrease ? 'warn' : 'info',
        marketplaceCode,
        listingId: null,
        jobRunId: null,
        code: decrease ? 'ScrapeRateLowered' : 'ScrapeRateRaised',
        message,
        context: JSON.stringify(change),
      })
      .catch((error: unknown) => logger.warn('scrapeRate.logFailed', { marketplaceCode, error }));
  };
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
 *
 * `requestTimeoutMs` rides along with the rate (2026-09-11) and is passed to every source the
 * operator's setting covers, including the catalogue sweeps below. One number per marketplace
 * rather than one per source, because what it actually describes is *this machine on this link*
 * — the production install's most common failure was a 15 s page load timing out while the
 * marketplace answered normally — and an operator who has decided their box is slow has said
 * something true of every page it fetches. Left unset, each source keeps its own compiled
 * default, which is not the same number for a product page and a catalogue page.
 *
 * For Trendyol's product page the stored rate is a **ceiling** since 2026-10-04 (doc 07 §7.7):
 * the source halves it on a `429` and steps back up while the marketplace stays quiet, and each
 * move lands in the event log through `logRateChange`.
 */
async function buildCompetitorSources(
  appDb: AppDatabase,
  marketplaces: ReadonlySet<MarketplaceCode>,
  browserUserAgent: string,
  honestUserAgent: string,
  hepsiburadaImpersonates: boolean,
): Promise<CompetitorSourceRegistry> {
  const entries: [MarketplaceCode, ICompetitorSource][] = [];
  if (marketplaces.has('trendyol')) {
    const rateLimit = await getScrapeRateLimit(appDb, 'trendyol');
    entries.push([
      'trendyol',
      new TrendyolPublicPageSource({
        userAgent: browserUserAgent,
        requestsPerMinute: rateLimit?.requestsPerMinute,
        burst: rateLimit?.burst,
        requestTimeoutMs: rateLimit?.requestTimeoutMs,
        onRateChange: logRateChange(appDb, 'trendyol'),
      }),
    ]);
  }
  if (marketplaces.has('hepsiburada')) {
    const rateLimit = await getScrapeRateLimit(appDb, 'hepsiburada');
    entries.push([
      'hepsiburada',
      // Honest since 2026-08-28 — the one source whose impersonation exception measurement
      // withdrew. `HEPSIBURADA_IMPERSONATE_BROWSER` puts it back without a release.
      new HepsiburadaPublicListingsSource({
        userAgent: hepsiburadaImpersonates ? browserUserAgent : honestUserAgent,
        impersonateBrowser: hepsiburadaImpersonates,
        requestsPerMinute: rateLimit?.requestsPerMinute,
        burst: rateLimit?.burst,
        requestTimeoutMs: rateLimit?.requestTimeoutMs,
      }),
    ]);
  }
  return buildCompetitorSourceRegistry(entries);
}

/**
 * The brand-catalogue sweep's sources (api-references §1.7) — built alongside the competitor
 * sources above and on exactly the same terms: reporting only, off until an operator enables
 * `SweepBrandCatalogue`, and given `SCRAPER_BROWSER_USER_AGENT` under the same recorded
 * exception.
 *
 * Trendyol only for now. Hepsiburada's catalogue side is the plan's last phase and is
 * deliberately absent rather than stubbed: an absent registry entry is a supported
 * configuration that simply sweeps no Hepsiburada brand, whereas a stub that returned empty
 * pages would look like a brand with no products.
 *
 * It shares `getScrapeRateLimit`'s operator-set rate with the product-page scraper but gets its
 * **own limiter instance** — a sweep is bursty (203 pages back to back for Royal Canin) and the
 * product-page scrape is a steady drip, so one shared bucket would let either starve the other.
 */
async function buildBrandCatalogueSources(
  appDb: AppDatabase,
  marketplaces: ReadonlySet<MarketplaceCode>,
  browserUserAgent: string,
  honestUserAgent: string,
): Promise<BrandCatalogueSourceRegistry> {
  const entries: [MarketplaceCode, IBrandCatalogueSource][] = [];
  if (marketplaces.has('trendyol')) {
    const rateLimit = await getScrapeRateLimit(appDb, 'trendyol');
    entries.push([
      'trendyol',
      new TrendyolBrandCatalogueSource({
        userAgent: browserUserAgent,
        requestsPerMinute: rateLimit?.requestsPerMinute,
        burst: rateLimit?.burst,
        requestTimeoutMs: rateLimit?.requestTimeoutMs,
      }),
    ]);
  }
  if (marketplaces.has('hepsiburada')) {
    // The **honest** agent, and no browser: `/ara?q=…` answered 200 to a request carrying
    // nothing but our own user agent (measured 2026-08-28). Trendyol above needs the browser
    // one because its bot detection fingerprints the TLS handshake; this page does not care,
    // so no exception is claimed here.
    const rateLimit = await getScrapeRateLimit(appDb, 'hepsiburada');
    entries.push([
      'hepsiburada',
      new HepsiburadaBrandCatalogueSource({
        userAgent: honestUserAgent,
        requestsPerMinute: rateLimit?.requestsPerMinute,
        burst: rateLimit?.burst,
        requestTimeoutMs: rateLimit?.requestTimeoutMs,
      }),
    ]);
  }
  return buildBrandCatalogueSourceRegistry(entries);
}

/**
 * The on-demand seller-identity source (doc 06 §12.4 Faz 7).
 *
 * Its own registry and its own `TrendyolSellerIdentitySource` instance, because it is the one
 * source allowed to request a product page **as** a merchant — a request whose ordering is a
 * preview rather than the buybox. Keeping it out of the competitor registry means no scraping
 * job can reach it by accident.
 *
 * Its rate limit is the class's own conservative default rather than the operator's scrape rate:
 * the scrape rate is set for a throughput job, and this one runs when a person presses a button.
 */
async function buildSellerIdentitySources(
  marketplaces: ReadonlySet<MarketplaceCode>,
  browserUserAgent: string,
): Promise<SellerIdentitySourceRegistry> {
  const entries: [MarketplaceCode, ISellerIdentitySource][] = [];
  if (marketplaces.has('trendyol')) {
    entries.push(['trendyol', new TrendyolSellerIdentitySource({ userAgent: browserUserAgent })]);
  }
  return buildSellerIdentitySourceRegistry(entries);
}

/**
 * The barcode backfill's sources (api-references §2.14, Faz 8).
 *
 * Its own registry, because the product page carries a **truncated** seller list that looks
 * complete — 2 of 6 sellers beside `hasMoreListings: true`. A job holding only this registry
 * has no type such a list could arrive in.
 *
 * Its rate limit is the class's own conservative default rather than the operator's scrape rate:
 * this is the slow tier, one request per product against 36 products per catalogue page, and it
 * is meant to be a drip that runs for days without ever competing with the sweep.
 */
async function buildProductDetailSources(
  marketplaces: ReadonlySet<MarketplaceCode>,
  honestUserAgent: string,
): Promise<ProductDetailSourceRegistry> {
  const entries: [MarketplaceCode, IProductDetailSource][] = [];
  if (marketplaces.has('hepsiburada')) {
    entries.push(['hepsiburada', new HepsiburadaProductDetailSource({ userAgent: honestUserAgent })]);
  }
  return buildProductDetailSourceRegistry(entries);
}

export interface StartWorkerOptions {
  readonly env?: Record<string, string | undefined>;
  /** Test/embedding hook: reuse an already-open database instead of opening one from env. */
  readonly appDb?: AppDatabase;
}

/**
 * Doc 05 §1: the app compares schema version at boot and refuses to start on a mismatch. Doc 14
 * §5.2 narrows that in exactly one direction, for exactly one deployment: a packaged customer
 * install sets `AUTO_MIGRATE=1` and the service migrates itself forward, because there is nobody
 * at a terminal to run `npm run migrate` and the database may be one the operator chose in the
 * wizard — possibly a PostgreSQL server the installer knows nothing about.
 *
 * A database *ahead* of this build refuses either way; `autoMigrate` enforces that, along with
 * the pre-migration backup and the cross-process lock. Every failure here is fatal on purpose:
 * a half-migrated schema must never serve traffic.
 */
async function ensureSchema(appDb: AppDatabase, env: BootstrapEnv): Promise<void> {
  if (env.AUTO_MIGRATE === '1') {
    // `APP_VERSION` is written by the installer (doc 14 §4.3) purely so a backup filename says
    // which build's schema it predates. Absent on a checkout, and the backup is still taken.
    const version = process.env.APP_VERSION;
    const result = await autoMigrate(appDb, {
      databaseUrl: env.DATABASE_URL,
      ...(version === undefined ? {} : { version }),
    });
    if (!result.migrated) return;
    logger.info(
      result.backupPath
        ? 'Applied pending migrations at boot; database backed up first.'
        : 'Applied pending migrations at boot. No backup was taken — either this database was empty, or its engine is not one we can copy aside; back it up yourself before upgrading.',
      {
        appliedBefore: result.appliedBefore,
        appliedAfter: result.appliedAfter,
        backupPath: result.backupPath ?? null,
      },
    );
    return;
  }

  const versionStatus = await checkSchemaVersion(appDb);
  if (!versionStatus.upToDate) {
    // The setup wizard (doc 10 §6 step 1) is the only place migrations run interactively;
    // a worker boot with a stale schema must refuse rather than silently run DDL.
    throw new Error(
      `Schema version mismatch: ${versionStatus.appliedCount} of ${versionStatus.expectedCount} ` +
        `migrations applied. Run migrations from the setup wizard or 'npm run migrate' first.`,
    );
  }
}

/**
 * How often the worker checks whether the operator has changed marketplace configuration.
 *
 * Cheap enough to be frequent — one indexed SELECT over a table with at most two rows — and
 * short enough that finishing the setup wizard is followed by working jobs rather than by a
 * support question.
 */
const MARKETPLACE_RELOAD_INTERVAL_MS = 10_000;

/**
 * A value that changes whenever marketplace configuration does.
 *
 * Both routes that store credentials (`setup/marketplace/save`, `settings/marketplaces`) upsert
 * the marketplace row with a fresh `updatedAt` in the same request, so this covers a credential
 * change as well as an enable/disable — without the credentials themselves ever being read
 * here, which they must not be (CLAUDE.md: no credential in the app database).
 */
async function marketplaceConfigRevision(appDb: AppDatabase): Promise<string> {
  const marketplaces = await configRepo.listMarketplaces(appDb);
  return marketplaces
    .map((m) => `${m.code}:${m.enabled ? 1 : 0}:${m.updatedAt}`)
    .sort()
    .join('|');
}

export async function startWorker(options: StartWorkerOptions = {}): Promise<WorkerHandle> {
  const env = parseBootstrapEnv(options.env ?? process.env);
  const appDb = options.appDb ?? createDb(env.DATABASE_URL);

  await ensureSchema(appDb, env);

  const secretStore = new FileSecretStore(env.SECRET_STORE_PATH, env.SECRET_STORE_KEY);
  // Deliberately `let`: rebuilt in place by `reloadIfConfigChanged` below when the operator
  // configures a marketplace after this process booted, which on a fresh install is always.
  let adapters = await buildAdapters(appDb, secretStore);
  let publicMarketplaces = await enabledMarketplaceCodes(appDb);
  // `SCRAPER_BROWSER_USER_AGENT` is the recorded exception for both reporting-only scrapers
  // (api-references §1.6, §2.11) — deployment configuration, not a constant.
  let competitorSources = await buildCompetitorSources(
    appDb,
    publicMarketplaces,
    env.SCRAPER_BROWSER_USER_AGENT,
    env.SCRAPER_USER_AGENT,
    env.HEPSIBURADA_IMPERSONATE_BROWSER === '1',
  );
  let brandCatalogueSources = await buildBrandCatalogueSources(
    appDb,
    publicMarketplaces,
    env.SCRAPER_BROWSER_USER_AGENT,
    env.SCRAPER_USER_AGENT,
  );
  let sellerIdentitySources = await buildSellerIdentitySources(
    publicMarketplaces,
    env.SCRAPER_BROWSER_USER_AGENT,
  );
  let productDetailSources = await buildProductDetailSources(publicMarketplaces, env.SCRAPER_USER_AGENT);
  let marketplaceConfig = await marketplaceConfigRevision(appDb);

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
    sweepBrandCatalogueCadence,
    sweepTrackedProductsCadence,
    sweepListedProductsCadence,
    resolveProductBarcodesCadence,
    evaluateBrandFindingsCadence,
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
    getJobCadenceMs(appDb, SWEEP_BRAND_CATALOGUE_JOB),
    getJobCadenceMs(appDb, SWEEP_TRACKED_PRODUCTS_JOB),
    getJobCadenceMs(appDb, SWEEP_LISTED_PRODUCTS_JOB),
    getJobCadenceMs(appDb, RESOLVE_PRODUCT_BARCODES_JOB),
    getJobCadenceMs(appDb, EVALUATE_BRAND_FINDINGS_JOB),
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
  const sweepBrandCatalogueCadenceMs = sweepBrandCatalogueCadence ?? 24 * 60 * 60_000;
  const sweepTrackedProductsCadenceMs = sweepTrackedProductsCadence ?? 60_000;
  const sweepListedProductsCadenceMs = sweepListedProductsCadence ?? 30 * 60_000;
  const resolveProductBarcodesCadenceMs = resolveProductBarcodesCadence ?? 60 * 60_000;
  const evaluateBrandFindingsCadenceMs = evaluateBrandFindingsCadence ?? 6 * 60 * 60_000;
  const importStockItemsCadenceMs = importStockItemsCadence ?? 60_000;

  // Exactly the values the tickers below are built from — assembled here, next to them, so the
  // two cannot drift. See `WorkerHandle.cadenceMsByJobName` for why anything outside needs them.
  const cadenceMsByJobName = new Map<string, number>([
    [PRUNE_HISTORY_JOB, pruneHistoryCadenceMs],
    [IMPORT_LISTINGS_JOB, importListingsCadenceMs],
    [OBSERVE_BUYBOX_JOB, observeBuyboxCadenceMs],
    [REPRICE_JOB, repriceCadenceMs],
    [SUBMIT_PRICE_CHANGES_JOB, submitPriceChangesCadenceMs],
    [CONFIRM_SUBMISSIONS_JOB, confirmSubmissionsCadenceMs],
    [RESET_BUDGET_JOB, resetBudgetCadenceMs],
    [SCRAPE_COMPETITORS_JOB, scrapeCompetitorsCadenceMs],
    [SWEEP_BRAND_CATALOGUE_JOB, sweepBrandCatalogueCadenceMs],
    [SWEEP_TRACKED_PRODUCTS_JOB, sweepTrackedProductsCadenceMs],
    [SWEEP_LISTED_PRODUCTS_JOB, sweepListedProductsCadenceMs],
    [RESOLVE_PRODUCT_BARCODES_JOB, resolveProductBarcodesCadenceMs],
    [EVALUATE_BRAND_FINDINGS_JOB, evaluateBrandFindingsCadenceMs],
    [IMPORT_STOCK_ITEMS_JOB, importStockItemsCadenceMs],
  ]);

  // Names its host as well as its process, so a later worker on this machine can tell that the
  // one which held a claim is gone (`releaseLocksOfDeadLocalWorkers`, packages/jobs).
  const instanceId = workerInstanceId(process.pid, hostname(), Math.random().toString(36).slice(2, 8));
  const scheduler = new Scheduler({
    appDb,
    clock: systemClock,
    adapters,
    competitorSources,
    brandCatalogueSources,
    sellerIdentitySources,
    productDetailSources,
    instanceId,
    // A rejected tick must not become an unhandled rejection: in single-process mode that
    // terminates the web server too. Log it and let the next tick try again.
    onTickError: (error) => logger.error('scheduler.tickFailed', { error }),
  });

  scheduler.register({
    jobName: PRUNE_HISTORY_JOB,
    handler: pruneHistoryJob,
    cadenceMs: pruneHistoryCadenceMs,
  });
  scheduler.register({ jobName: IMPORT_LISTINGS_JOB, handler: importListings });
  scheduler.register({ jobName: OBSERVE_BUYBOX_JOB, handler: observeBuybox });
  scheduler.register({ jobName: REPRICE_JOB, handler: reprice });
  scheduler.register({ jobName: SUBMIT_PRICE_CHANGES_JOB, handler: submitPriceChanges });
  scheduler.register({ jobName: CONFIRM_SUBMISSIONS_JOB, handler: confirmSubmissions });
  scheduler.register({ jobName: RESET_BUDGET_JOB, handler: resetBudget });
  scheduler.register({ jobName: IMPORT_STOCK_ITEMS_JOB, handler: importStockItems });
  // No cadence (see this file's doc comment), but it must still be *registered*: `claimNextJob`
  // only ever claims a job whose name a worker has registered, so an unregistered catalogue entry
  // does not fail — it sits in `job_queue` as `ready` for ever, with no `job_runs` row and
  // therefore nothing at all on the Jobs screen. Measured 2026-08-29: "Şimdi çalıştır" on
  // Paket İçe Aktarma looked like it did nothing whatsoever.
  scheduler.register({ jobName: IMPORT_BUNDLES_JOB, handler: importBundles });
  scheduler.register({ jobName: SCRAPE_COMPETITORS_JOB, handler: scrapeCompetitors });
  scheduler.register({ jobName: SWEEP_BRAND_CATALOGUE_JOB, handler: sweepBrandCatalogue });
  /**
   * A pass walks a whole catalogue and takes hours, so its visibility timeout is measured in
   * hours too — the runner heartbeats the lock while a handler runs, and this is only the window
   * a genuinely dead worker's row waits before another instance may claim it (doc 07 §7.4).
   */
  scheduler.register({
    jobName: SWEEP_TRACKED_PRODUCTS_JOB,
    handler: sweepTrackedProducts,
    // No `cadenceMs`: this job is ticked per marketplace by `everyMarketplace` below, like every
    // other `perMarketplace` job — the scheduler's own cadence enqueues a payload-less `{}`,
    // which this handler's schema rejects for want of a marketplace.
    visibilityTimeoutMs: 6 * 60 * 60_000,
  });
  // A listings pass finishes in minutes (doc 07 §7.5), not hours — a shorter timeout than the
  // catalogue sweep's is enough, and a shorter one notices a genuinely dead worker sooner.
  scheduler.register({
    jobName: SWEEP_LISTED_PRODUCTS_JOB,
    handler: sweepListedProducts,
    visibilityTimeoutMs: 30 * 60_000,
  });
  // Cadenced by the scheduler itself rather than by a ticker, like `PruneHistory`: it is global
  // rather than per marketplace — a finding belongs to a *brand*, and the job enumerates brands
  // — so a per-marketplace tick would evaluate every brand once per marketplace and open each
  // finding twice.
  scheduler.register({
    jobName: EVALUATE_BRAND_FINDINGS_JOB,
    handler: (ctx) => evaluateBrandFindings(ctx),
    cadenceMs: evaluateBrandFindingsCadenceMs,
  });
  // On demand only — no cadence, and deliberately not in `JOB_CATALOG`: a resolution names
  // one firm, so it is enqueued from that seller's own row and nowhere else.
  scheduler.register({ jobName: RESOLVE_SELLER_IDENTITY_JOB, handler: resolveSellerIdentity });
  // Likewise on demand only: a rescan names the rows an operator ticked, so it is enqueued from
  // `/api/tracked-products/rescan` and has no runnable empty payload to put in the catalogue.
  scheduler.register({ jobName: RESCAN_TRACKED_PRODUCTS_JOB, handler: rescanTrackedProducts });
  // On demand only, and the one job with no meaningful per-run product ceiling: it reads a whole
  // brand — 5,204 products for Royal Canin — because that is what the operator pressed. Its
  // lock is renewed by the runner's heartbeat, so a run measured in hours is not a stuck one.
  scheduler.register({ jobName: SCRAPE_BRAND_SELLERS_JOB, handler: scrapeBrandSellers });
  scheduler.register({ jobName: RESOLVE_PRODUCT_BARCODES_JOB, handler: resolveProductBarcodes });

  // Before the first tick: claims a previous worker on this machine held when it stopped would
  // otherwise stay `locked` until their visibility timeout — up to six hours (see stale-locks.ts).
  const releasedOwners = await releaseLocksOfDeadLocalWorkers(appDb, {
    selfId: instanceId,
    host: hostname(),
    isPidAlive,
    nowMs: systemClock.nowMs(),
  });
  if (releasedOwners.length > 0) logger.warn('worker.releasedDeadWorkerLocks', { owners: releasedOwners });

  scheduler.startLoop();

  // Read once at boot (see file doc comment's "Catch-up on boot"): the latest completed/failed
  // run per job name, so a ticker can tell whether its cadence had already elapsed before this
  // restart.
  const latestRunByName = new Map(
    (await jobsRepo.latestJobRunPerJobName(appDb)).map((run) => [run.jobName, run]),
  );
  /**
   * Runs `fire` whenever `jobName`'s cadence has elapsed since its last run *started*, checking
   * every `checkEveryMs(cadenceMs)` — see `cadence-clock.ts` for why this is not a plain
   * `setInterval(fire, cadenceMs)`. Fires once at boot if already due, and that fire is awaited
   * with the others before `startWorker` returns (`catchUpFires`).
   */
  const startTicker = (jobName: string, cadenceMs: number, fire: () => Promise<void>): void => {
    const clock = createCadenceClock(cadenceMs, latestRunByName.get(jobName)?.startedAt);
    // A check that lands while the previous fire is still awaiting the database must not fire
    // again: `countActiveJobsForTarget` only sees a job once it has been enqueued.
    let firing = false;
    const fireIfDue = async (): Promise<void> => {
      const nowMs = Date.now();
      if (firing || !clock.isDue(nowMs)) return;
      firing = true;
      try {
        await fire();
        // Only after `fire` resolved: one that threw is retried at the next check rather than
        // a whole cadence later.
        clock.markFired(nowMs);
      } finally {
        firing = false;
      }
    };
    if (clock.isDue(Date.now())) {
      catchUpFires.push(
        fireIfDue().catch((error) => logger.warn('ticker.catchUpFailed', { jobName, error })),
      );
    }
    // Caught, not `void fire()`: an interval callback's rejection is an unhandled rejection,
    // which Node terminates the process for — taking the web server down with it in
    // single-process mode over one transient database error. Same reasoning as
    // `Scheduler.startLoop`'s `onTickError`.
    tickers.push(
      setInterval(() => {
        void fireIfDue().catch((error: unknown) => logger.error('ticker.fireFailed', { jobName, error }));
      }, checkEveryMs(cadenceMs)),
    );
  };

  // Who each ticker fires for depends on the job's module (doc 17 §1.2). A seller job needs a
  // marketplace adapter — our own credentials — while a brand job reads public pages and needs
  // only the marketplace to be enabled. One list for both left a brand-only install, which has
  // no adapters, with nothing to tick at all.
  let sellerMarketplaceCodes: readonly MarketplaceCode[] = [...adapters.keys()];
  let brandMarketplaceCodes: readonly MarketplaceCode[] = [...publicMarketplaces];
  const tickers: ReturnType<typeof setInterval>[] = [];
  // Boot-time catch-up fires (see file doc comment) are awaited below, before `startWorker`
  // returns, rather than left fire-and-forget like the interval-triggered ones — otherwise a
  // caller that shuts the worker down (and closes its `appDb`) immediately after boot can race
  // an in-flight catch-up query against a now-closed connection (this is exactly how the
  // embedding test's fresh in-memory db caught it).
  const catchUpFires: Promise<void>[] = [];

  const everyMarketplace = (
    jobName: string,
    intervalMs: number,
    extraPayload: Record<string, unknown> = {},
    /**
     * Optional narrowing of *which* marketplaces this job is ticked for. A job with no source
     * for a marketplace can only ever record an empty run there, and a cadence that files one of
     * those every hour buries the runs that mean something (measured 2026-08-29: hourly
     * `ResolveProductBarcodes` runs of 0 items on a Trendyol-only install, which has no product
     * detail source at all). The handler still treats an absent source as a supported no-op —
     * this only stops the *ticker* from asking.
     */
    appliesTo: (marketplaceCode: MarketplaceCode) => boolean = () => true,
  ) => {
    const fire = async (): Promise<void> => {
      // doc 17 §1.3 — a disabled module's jobs are not enqueued. The scheduler would refuse to
      // claim them anyway; not enqueueing keeps the queue free of rows nothing will ever run.
      if (!isJobDispatchable(jobName, await readDispatchGate(appDb))) return;
      // doc 12 6.9 "enable/disable" — an operator-disabled job simply doesn't fire.
      if (!(await isJobEnabled(appDb, jobName))) return;
      const marketplaceCodes =
        jobModule(jobName) === 'brand' ? brandMarketplaceCodes : sellerMarketplaceCodes;
      for (const marketplaceCode of marketplaceCodes) {
        if (!appliesTo(marketplaceCode)) continue;
        const payload = JSON.stringify({ marketplaceCode, ...extraPayload });
        // doc 07 §8 "one run at a time", per target. `Scheduler.tick` applies this to the jobs
        // it cadences itself; these tickers bypass that path entirely by calling `enqueueNow`,
        // so without this a job that takes longer than its cadence queues another copy of
        // itself on every tick and the backlog only ever grows. Reachable in practice since
        // cadence became operator-editable (doc 07 §8.1): `MIN_JOB_CADENCE_MS` allows 10 s,
        // which is shorter than a real `ImportListings` over a full catalogue.
        if ((await jobsRepo.countActiveJobsForTarget(appDb, jobName, marketplaceCode)) > 0) {
          // Not an error: a slower-than-cadence job is a legitimate state. Logged because the
          // alternative — silently dropping every tick — is how "the job never runs" looks from
          // the outside.
          logger.info('ticker.skippedStillActive', { jobName, marketplaceCode });
          continue;
        }
        await scheduler.enqueueNow(jobName, payload);
      }
    };
    startTicker(jobName, intervalMs, fire);
  };
  everyMarketplace(IMPORT_LISTINGS_JOB, importListingsCadenceMs);
  // No cycle field is passed: the tier cadences are **absolute durations** resolved from each
  // handler's own `cycleMs` default (doc 07 §4.1). They used to be a literal `cycleNumber: 0`
  // that was never incremented, which made every tier due on every tick — gap G-1.
  //
  // Deliberately not this ticker's cadence, though that was the first shape tried: it would tie
  // "Warm is daily" to how often the job happens to fire, so an operator lowering the cadence to
  // 15 minutes (doc 07 §8.1 lets them) would silently turn daily into six-hourly. The tick rate
  // is the resolution at which due-ness is checked; it is not the tier interval.
  everyMarketplace(OBSERVE_BUYBOX_JOB, observeBuyboxCadenceMs);
  everyMarketplace(REPRICE_JOB, repriceCadenceMs, { mode: 'live' });
  everyMarketplace(SUBMIT_PRICE_CHANGES_JOB, submitPriceChangesCadenceMs);
  everyMarketplace(CONFIRM_SUBMISSIONS_JOB, confirmSubmissionsCadenceMs);
  everyMarketplace(RESET_BUDGET_JOB, resetBudgetCadenceMs);
  // Off unless the operator enabled it — `isJobEnabled` inside `everyMarketplace` gates this.
  everyMarketplace(SCRAPE_COMPETITORS_JOB, scrapeCompetitorsCadenceMs);
  // Likewise off unless enabled, and on the same authority (api-references §1.6/§1.7).
  everyMarketplace(SWEEP_BRAND_CATALOGUE_JOB, sweepBrandCatalogueCadenceMs);
  // A pass takes hours, so this minute is only the gap between passes: `countActiveJobsForTarget`
  // above skips the tick while one is still walking (doc 07 §7.4).
  everyMarketplace(SWEEP_TRACKED_PRODUCTS_JOB, sweepTrackedProductsCadenceMs);
  // Two lanes, one shared rate limiter (doc 07 §7.5): running both never raises the request rate,
  // it only lets the listings lane skip the queue behind a catalogue pass.
  everyMarketplace(SWEEP_LISTED_PRODUCTS_JOB, sweepListedProductsCadenceMs);
  // Only where a product-detail source exists — `productDetailSources` is rebuilt by
  // `reloadIfConfigChanged`, so this reads the live registry rather than a boot-time snapshot.
  everyMarketplace(RESOLVE_PRODUCT_BARCODES_JOB, resolveProductBarcodesCadenceMs, {}, (code) =>
    productDetailSources.has(code),
  );

  const fireImportStockItems = async (): Promise<void> => {
    if (!isJobDispatchable(IMPORT_STOCK_ITEMS_JOB, await readDispatchGate(appDb))) return;
    if (!(await isJobEnabled(appDb, IMPORT_STOCK_ITEMS_JOB))) return;
    // `null` = nothing to run: wizard step 6 not completed, or a source with no batch behind it
    // (`manual`, doc 10 §4). Firing anyway is how this cadence spent every day since setup
    // failing `ManualProductSource`'s single-entry schema (measured 2026-08-29).
    const resolved = await resolveImportStockItemsPayload(appDb);
    if (!resolved) return;
    const payload = JSON.stringify(resolved);
    // Same "one run at a time" guard as `everyMarketplace` above — this job reads a whole
    // product catalogue and is the likeliest of all of them to outlast its own cadence. Keyed on
    // the job name alone, not a target: this one is global rather than per marketplace, so two
    // concurrent runs are never wanted whatever their payloads say.
    if ((await jobsRepo.countActiveJobs(appDb, IMPORT_STOCK_ITEMS_JOB)) > 0) {
      logger.info('ticker.skippedStillActive', { jobName: IMPORT_STOCK_ITEMS_JOB });
      return;
    }
    await scheduler.enqueueNow(IMPORT_STOCK_ITEMS_JOB, payload);
  };
  startTicker(IMPORT_STOCK_ITEMS_JOB, importStockItemsCadenceMs, fireImportStockItems);

  /**
   * Picks up marketplace configuration entered after this process booted.
   *
   * Everything a job needs to reach a marketplace used to be resolved exactly once, at boot. A
   * fresh install has no credentials at that moment — the operator enters them in the setup
   * wizard minutes later — so the registries stayed empty and every `ImportListings` failed with
   * `No marketplace adapter registered for "trendyol"`, every `ScrapeCompetitors` with
   * `no competitor source registered`, until somebody thought to restart the service. Nothing on
   * any screen said so. Measured end-to-end on a clean 0.1.2 install, 2026-08-24.
   *
   * Deferred while a job is running: the outgoing competitor sources own a Playwright browser
   * that is closed here, and closing it under a running scrape would fail that scrape instead of
   * the reload. The check simply runs again in `MARKETPLACE_RELOAD_INTERVAL_MS`.
   *
   * The revision is read *before* the rebuild, so a change that lands mid-rebuild is picked up on
   * the next pass rather than being recorded as already applied.
   */
  const reloadIfConfigChanged = async (): Promise<void> => {
    const revision = await marketplaceConfigRevision(appDb);
    if (revision === marketplaceConfig) return;
    if (!scheduler.isIdle()) return;

    const nextAdapters = await buildAdapters(appDb, secretStore);
    const nextPublicMarketplaces = await enabledMarketplaceCodes(appDb);
    const nextSources = await buildCompetitorSources(
      appDb,
      nextPublicMarketplaces,
      env.SCRAPER_BROWSER_USER_AGENT,
      env.SCRAPER_USER_AGENT,
      env.HEPSIBURADA_IMPERSONATE_BROWSER === '1',
    );
    const nextCatalogueSources = await buildBrandCatalogueSources(
      appDb,
      nextPublicMarketplaces,
      env.SCRAPER_BROWSER_USER_AGENT,
      env.SCRAPER_USER_AGENT,
    );
    const nextIdentitySources = await buildSellerIdentitySources(
      nextPublicMarketplaces,
      env.SCRAPER_BROWSER_USER_AGENT,
    );
    const nextDetailSources = await buildProductDetailSources(nextPublicMarketplaces, env.SCRAPER_USER_AGENT);
    const outgoingSources = competitorSources;
    const outgoingCatalogueSources = brandCatalogueSources;
    const outgoingIdentitySources = sellerIdentitySources;
    const outgoingDetailSources = productDetailSources;

    adapters = nextAdapters;
    competitorSources = nextSources;
    brandCatalogueSources = nextCatalogueSources;
    sellerIdentitySources = nextIdentitySources;
    productDetailSources = nextDetailSources;
    publicMarketplaces = nextPublicMarketplaces;
    sellerMarketplaceCodes = [...nextAdapters.keys()];
    brandMarketplaceCodes = [...nextPublicMarketplaces];
    scheduler.setRegistries(
      nextAdapters,
      nextSources,
      nextCatalogueSources,
      nextIdentitySources,
      nextDetailSources,
    );
    marketplaceConfig = revision;

    await Promise.all([
      ...[...outgoingSources.values()].map((source) => source.close?.()),
      ...[...outgoingCatalogueSources.values()].map((source) => source.close?.()),
      ...[...outgoingIdentitySources.values()].map((source) => source.close?.()),
      ...[...outgoingDetailSources.values()].map((source) => source.close?.()),
    ]);
    logger.info('worker.marketplacesReloaded', {
      sellerMarketplaces: sellerMarketplaceCodes,
      brandMarketplaces: brandMarketplaceCodes,
    });
  };
  tickers.push(
    setInterval(() => {
      void reloadIfConfigChanged().catch((error) => logger.error('worker.reloadFailed', { error }));
    }, MARKETPLACE_RELOAD_INTERVAL_MS),
  );

  // Boot isn't done until any overdue job this restart owes has at least been kicked off —
  // see `catchUpFires`'s doc comment above.
  await Promise.all(catchUpFires);

  return {
    scheduler,
    appDb,
    // Getters, not snapshots: `reloadIfConfigChanged` replaces both, and a caller reading a
    // boot-time copy would be told the install has no marketplaces long after it has one.
    get adapters() {
      return adapters;
    },
    get competitorSources() {
      return competitorSources;
    },
    get brandCatalogueSources() {
      return brandCatalogueSources;
    },
    get productDetailSources() {
      return productDetailSources;
    },
    get sellerIdentitySources() {
      return sellerIdentitySources;
    },
    databaseTarget: describeDatabaseTarget(env.DATABASE_URL),
    startedAtMs: Date.now(),
    cadenceMsByJobName,
    async shutdown() {
      for (const ticker of tickers) clearInterval(ticker);
      await scheduler.shutdown();
      // Releases TrendyolPublicPageSource's Playwright browser (2026-08-17) and any other
      // source-owned resource; a no-op for sources that hold nothing (competitor-source.ts).
      await Promise.all([
        ...[...competitorSources.values()].map((source) => source.close?.()),
        // The sweep source owns its own Playwright browser, separate from the scraper's.
        ...[...brandCatalogueSources.values()].map((source) => source.close?.()),
        // And the identity source owns a third, for the same reason: a merchant-scoped page
        // needs a real browser exactly as the neutral one does.
        ...[...sellerIdentitySources.values()].map((source) => source.close?.()),
        // `reloadIfConfigChanged` already closes the outgoing product-detail sources; this is
        // the shutdown half of the same pair, missing since the registry was added.
        ...[...productDetailSources.values()].map((source) => source.close?.()),
      ]);
    },
  };
}
