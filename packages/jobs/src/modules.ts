/**
 * Which module each job belongs to, and whether it may be dispatched now (doc 17 §1.2–§1.3).
 *
 * Read on **every** scheduler tick and every ticker fire, not once at worker boot like cadence
 * (doc 07 §8.1). Turning the seller module off has to stop price writes on the next tick; a
 * restart-to-apply rule here would leave `SubmitPriceChanges` running behind a menu the operator
 * has just hidden.
 */
import { configRepo, newId, repricingRepo, type AppDatabase } from '@buybox/db';
import {
  MODULE_SETTING_KEYS,
  parseEnabledModules,
  type AppModule,
  type EnabledModules,
} from '@buybox/shared';
import { JOB_CATALOG, jobEnabledSettingKey } from './job-catalog.js';
import { CONFIRM_SUBMISSIONS_JOB } from './pipeline/confirm-submissions.js';
import { EVALUATE_BRAND_FINDINGS_JOB } from './pipeline/evaluate-brand-findings.js';
import { IMPORT_BUNDLES_JOB } from './pipeline/import-bundles.js';
import { IMPORT_LISTINGS_JOB } from './pipeline/import-listings.js';
import { IMPORT_STOCK_ITEMS_JOB } from './pipeline/import-stock-items.js';
import { OBSERVE_BUYBOX_JOB } from './pipeline/observe-buybox.js';
import { PRUNE_HISTORY_JOB } from './pipeline/prune-history-job.js';
import { REPRICE_JOB } from './pipeline/reprice.js';
import { RESCAN_TRACKED_PRODUCTS_JOB } from './pipeline/rescan-tracked-products.js';
import { RESET_BUDGET_JOB } from './pipeline/reset-budget.js';
import { RESOLVE_PRODUCT_BARCODES_JOB } from './pipeline/resolve-product-barcodes.js';
import { RESOLVE_SELLER_IDENTITY_JOB } from './pipeline/resolve-seller-identity.js';
import { SCRAPE_BRAND_SELLERS_JOB } from './pipeline/scrape-brand-sellers.js';
import { SCRAPE_COMPETITORS_JOB } from './pipeline/scrape-competitors.js';
import { SUBMIT_PRICE_CHANGES_JOB } from './pipeline/submit-price-changes.js';
import { SWEEP_BRAND_CATALOGUE_JOB } from './pipeline/sweep-brand-catalogue.js';
import { SWEEP_LISTED_PRODUCTS_JOB } from './pipeline/sweep-listed-products.js';
import { SWEEP_TRACKED_PRODUCTS_JOB } from './pipeline/sweep-tracked-products.js';

/** `core` jobs belong to no module and run whatever is enabled. */
export type JobModule = AppModule | 'core';

/**
 * Every job the worker registers, by module. `ScrapeCompetitors` is the seller's — it reads the
 * sellers on **our own** listings — although it is a scraping job like the brand ones.
 *
 * A job missing from this table is treated as `core` by `jobModule`, which is the safe direction
 * for nothing: a seller job that fell through would keep running with the module off. So the
 * worker's own test asserts every registered job name is listed here.
 */
export const JOB_MODULES: Readonly<Record<string, JobModule>> = {
  [IMPORT_STOCK_ITEMS_JOB]: 'seller',
  [IMPORT_BUNDLES_JOB]: 'seller',
  [IMPORT_LISTINGS_JOB]: 'seller',
  [OBSERVE_BUYBOX_JOB]: 'seller',
  [SCRAPE_COMPETITORS_JOB]: 'seller',
  [REPRICE_JOB]: 'seller',
  [SUBMIT_PRICE_CHANGES_JOB]: 'seller',
  [CONFIRM_SUBMISSIONS_JOB]: 'seller',
  [RESET_BUDGET_JOB]: 'seller',
  [SWEEP_BRAND_CATALOGUE_JOB]: 'brand',
  [SWEEP_TRACKED_PRODUCTS_JOB]: 'brand',
  [SWEEP_LISTED_PRODUCTS_JOB]: 'brand',
  [RESCAN_TRACKED_PRODUCTS_JOB]: 'brand',
  [SCRAPE_BRAND_SELLERS_JOB]: 'brand',
  [RESOLVE_PRODUCT_BARCODES_JOB]: 'brand',
  [RESOLVE_SELLER_IDENTITY_JOB]: 'brand',
  [EVALUATE_BRAND_FINDINGS_JOB]: 'brand',
  [PRUNE_HISTORY_JOB]: 'core',
};

export function jobModule(jobName: string): JobModule {
  return JOB_MODULES[jobName] ?? 'core';
}

export async function readEnabledModules(appDb: AppDatabase): Promise<EnabledModules> {
  const [seller, brand] = await Promise.all([
    configRepo.getAppSetting(appDb, MODULE_SETTING_KEYS.seller),
    configRepo.getAppSetting(appDb, MODULE_SETTING_KEYS.brand),
  ]);
  return parseEnabledModules(seller?.value, brand?.value);
}

/**
 * What the dispatch decision needs to know, read once per tick so that deciding about twenty
 * jobs costs three queries rather than sixty.
 */
export interface DispatchGate {
  readonly modules: EnabledModules;
  /** Submissions the marketplace accepted but has not confirmed — see `isJobDispatchable`. */
  readonly awaitingConfirmation: number;
}

export async function readDispatchGate(appDb: AppDatabase): Promise<DispatchGate> {
  const modules = await readEnabledModules(appDb);
  // Only worth a query when the answer can matter: with the seller module on, the drain rule
  // below is never consulted.
  const awaitingConfirmation = modules.seller ? 0 : await repricingRepo.countAwaitingConfirmation(appDb);
  return { modules, awaitingConfirmation };
}

/**
 * Whether a job may be enqueued or claimed now.
 *
 * The single exception to "a disabled module's jobs do not run" is `ConfirmSubmissions`, which
 * keeps running until nothing is awaiting confirmation. A price change is recorded only once the
 * marketplace confirms it (CLAUDE.md); stopping confirmation mid-batch would leave a price that
 * changed on the marketplace with no record that it did.
 */
export function isJobDispatchable(jobName: string, gate: DispatchGate): boolean {
  const module = jobModule(jobName);
  if (module === 'core') return true;
  if (gate.modules[module]) return true;
  return jobName === CONFIRM_SUBMISSIONS_JOB && gate.awaitingConfirmation > 0;
}

/**
 * The brand module's scanning jobs that are off in the catalogue — the ones that read public
 * marketplace pages and so wait for an explicit business decision (api-references §1.6).
 * Derived rather than listed, so a brand scanning job added later is covered without a second
 * edit. `ScrapeCompetitors` is not among them: it is the seller's, and stays off.
 */
export const BRAND_SCAN_JOBS: readonly string[] = JOB_CATALOG.filter(
  (entry) => jobModule(entry.jobName) === 'brand' && !entry.defaultEnabled,
).map((entry) => entry.jobName);

/**
 * Switches the brand module's scanning jobs on when setup finishes with the brand module chosen
 * (doc 17 §1.4). Ticking _Marka ürün yöneticisiyim_ is the explicit decision these jobs wait for;
 * without this a fresh brand install scanned nothing until the operator found three switches on
 * the Jobs screen. None of these jobs uses seller API credentials.
 *
 * Only where no setting is stored: re-running the wizard must never re-enable a job somebody
 * switched off on purpose. Returns the jobs it switched on.
 */
/** `actor` is who finished the wizard (doc 18 §9.1) — a user, or `bootstrap` before one exists. */
export async function enableBrandScanJobsAtSetup(appDb: AppDatabase, nowMs: number, actor: string): Promise<string[]> {
  if (!(await readEnabledModules(appDb)).brand) return [];
  const enabled: string[] = [];
  for (const jobName of BRAND_SCAN_JOBS) {
    const key = jobEnabledSettingKey(jobName);
    if ((await configRepo.getAppSetting(appDb, key)) !== undefined) continue;
    await configRepo.setAppSetting(
      appDb,
      { key, value: 'true', updatedBy: actor, updatedAt: nowMs },
      newId(),
    );
    enabled.push(jobName);
  }
  return enabled;
}
