/**
 * The doc 07 §1 job catalog, as data — one source of truth for `apps/worker`'s ticker
 * cadences and `apps/web`'s Jobs screen (doc 12 6.9: "schedule, last run, next run,
 * enable/disable, run-now"), so the UI's displayed schedule can never drift from what
 * actually fires.
 */
import type { AppDatabase } from '@buybox/db';
import { configRepo } from '@buybox/db';
import { CONFIRM_SUBMISSIONS_JOB } from './pipeline/confirm-submissions.js';
import { IMPORT_BUNDLES_JOB } from './pipeline/import-bundles.js';
import { IMPORT_LISTINGS_JOB } from './pipeline/import-listings.js';
import { IMPORT_STOCK_ITEMS_JOB } from './pipeline/import-stock-items.js';
import { OBSERVE_BUYBOX_JOB } from './pipeline/observe-buybox.js';
import { PRUNE_HISTORY_JOB } from './pipeline/prune-history-job.js';
import { REPRICE_JOB } from './pipeline/reprice.js';
import { RESET_BUDGET_JOB } from './pipeline/reset-budget.js';
import { SCRAPE_COMPETITORS_JOB } from './pipeline/scrape-competitors.js';
import { SWEEP_BRAND_CATALOGUE_JOB } from './pipeline/sweep-brand-catalogue.js';
import { RESOLVE_PRODUCT_BARCODES_JOB } from './pipeline/resolve-product-barcodes.js';
import { EVALUATE_BRAND_FINDINGS_JOB } from './pipeline/evaluate-brand-findings.js';
import { SUBMIT_PRICE_CHANGES_JOB } from './pipeline/submit-price-changes.js';
import { SCRAPE_CYCLE_MS } from './scrape-config.js';

export interface JobCatalogEntry {
  readonly jobName: string;
  /** Turkish label for the Jobs screen. */
  readonly label: string;
  /** `null` for jobs that only ever run on an explicit "run now" (doc 12 Phase 5's ImportBundles note). */
  readonly cadenceMs: number | null;
  /** Whether this job is ticked once per registered marketplace, vs. once globally. */
  readonly perMarketplace: boolean;
  /** Sample/default payload shown pre-filled on a manual "run now". */
  readonly defaultPayload: Record<string, unknown>;
  /**
   * Whether the job fires when the operator has expressed no preference. `true` for every
   * job the system needs to do its work; `false` only for `ScrapeCompetitors`, which
   * api-references §1.6 and doc 04 §1.5 require an *explicit business decision* to run —
   * scraping may conflict with Trendyol's terms of service, so it must be switched on
   * deliberately and never start by default on a fresh install.
   */
  readonly defaultEnabled: boolean;
}

export const JOB_CATALOG: readonly JobCatalogEntry[] = [
  {
    jobName: IMPORT_LISTINGS_JOB,
    label: 'İlan İçe Aktarma',
    cadenceMs: 30 * 60_000,
    perMarketplace: true,
    defaultPayload: {},
    defaultEnabled: true,
  },
  {
    jobName: OBSERVE_BUYBOX_JOB,
    label: 'Buybox Gözlemi',
    cadenceMs: 60_000,
    perMarketplace: true,
    defaultPayload: {},
    defaultEnabled: true,
  },
  {
    jobName: REPRICE_JOB,
    label: 'Yeniden Fiyatlandırma',
    cadenceMs: 5 * 60_000,
    perMarketplace: true,
    defaultPayload: { mode: 'live' },
    defaultEnabled: true,
  },
  {
    jobName: SUBMIT_PRICE_CHANGES_JOB,
    label: 'Fiyat Gönderimi',
    cadenceMs: 30_000,
    perMarketplace: true,
    defaultPayload: {},
    defaultEnabled: true,
  },
  {
    jobName: CONFIRM_SUBMISSIONS_JOB,
    label: 'Gönderim Onayı',
    cadenceMs: 60_000,
    perMarketplace: true,
    defaultPayload: {},
    defaultEnabled: true,
  },
  {
    jobName: RESET_BUDGET_JOB,
    label: 'Bütçe Sıfırlama',
    cadenceMs: 60 * 60_000,
    perMarketplace: true,
    defaultPayload: {},
    defaultEnabled: true,
  },
  {
    jobName: IMPORT_STOCK_ITEMS_JOB,
    label: 'Stok İçe Aktarma',
    cadenceMs: 24 * 60 * 60_000,
    perMarketplace: false,
    // Empty on purpose, and the one entry a caller must not send verbatim: this job's payload is
    // the *configured* product source, which lives in `app_settings` and cannot be a compiled-in
    // constant. `/api/jobs/run-now` fills it from `resolveImportStockItemsPayload`.
    defaultPayload: {},
    defaultEnabled: true,
  },
  {
    jobName: PRUNE_HISTORY_JOB,
    label: 'Geçmiş Temizliği',
    cadenceMs: 24 * 60 * 60_000,
    perMarketplace: false,
    defaultPayload: {},
    defaultEnabled: true,
  },
  {
    // Deliberately no cadence (doc 10 §4 / Phase 5 note in apps/worker/src/index.ts): no bundle
    // source port exists yet, so this only ever runs from an explicit payload.
    jobName: IMPORT_BUNDLES_JOB,
    label: 'Paket İçe Aktarma',
    cadenceMs: null,
    perMarketplace: false,
    // The payload this job actually takes (doc 07 §1.1): a resolved bundle list, supplied by
    // hand. It used to read `{ sourceCode: 'excel', sourceConfig: {} }` — a product-source
    // payload copied from the job above, which this handler's schema rejects outright.
    defaultPayload: { bundles: [] },
    defaultEnabled: true,
  },
  {
    jobName: SCRAPE_COMPETITORS_JOB,
    label: 'Rakip Verisi Toplama (raporlama)',
    cadenceMs: SCRAPE_CYCLE_MS,
    perMarketplace: true,
    defaultPayload: {},
    // Off until an operator turns it on: scraping needs an explicit business decision
    // (api-references §1.6, doc 04 §1.5), and nothing depends on it (doc 12 Phase 7 DoD).
    defaultEnabled: false,
  },
  {
    jobName: SWEEP_BRAND_CATALOGUE_JOB,
    label: 'Marka Kataloğu Taraması (raporlama)',
    // Daily. The sweep is the cheap tier — 37 pages for Whiskas, 203 for Royal Canin, about a
    // minute and five and a half respectively — so a full pass per day costs little; it is the
    // per-product seller scrape that is expensive and paced separately (api-references §1.7).
    cadenceMs: 24 * 60 * 60_000,
    perMarketplace: true,
    defaultPayload: {},
    // Off by default for exactly the same reason as `ScrapeCompetitors` above, and on the same
    // authority: this reads the same public pages under the same business decision.
    defaultEnabled: false,
  },
  {
    jobName: RESOLVE_PRODUCT_BARCODES_JOB,
    label: 'Barkod Tamamlama (raporlama)',
    // Hourly, and a batch at a time. This is the slow tier: one request per product against 36
    // products per catalogue page, so a brand's barcodes fill in over days rather than in a
    // pass. A short cadence with a small batch keeps it a steady drip instead of a nightly
    // burst — and every run resumes exactly where the last stopped (api-references §2.14).
    cadenceMs: 60 * 60_000,
    perMarketplace: true,
    defaultPayload: {},
    // Off by default on the same authority as the two above: it reads the same public pages
    // under the same business decision, and no report breaks while it is off.
    defaultEnabled: false,
  },
  {
    jobName: EVALUATE_BRAND_FINDINGS_JOB,
    label: 'Denetim Bulguları (raporlama)',
    // Every six hours. The evaluation makes **no marketplace requests at all** — it reads the
    // archive the scraping jobs already wrote — so its cost is a handful of aggregate queries
    // per brand and the cadence is set by how fresh a notification should be rather than by
    // politeness to anyone. Six hours is roughly a working half-day: fast enough that a blocked
    // seller returning is noticed the same day, slow enough that nobody learns to ignore it.
    cadenceMs: 6 * 60 * 60_000,
    // Once globally: a finding is per *brand*, and brands are enumerated inside the job. Ticking
    // per marketplace would evaluate every brand once per marketplace and open each finding twice.
    perMarketplace: false,
    defaultPayload: {},
    // On by default, and it is the only reporting job that is. The three above make requests to
    // a marketplace and therefore need an explicit business decision; this one only reads what
    // they already stored, so an install that has enabled them has already made that decision
    // and would gain nothing from a second switch.
    defaultEnabled: true,
  },
];

/** `app_settings` key gating whether a cadence-driven job fires (doc 12 6.9 "enable/disable"). */
export function jobEnabledSettingKey(jobName: string): string {
  return `job.${jobName}.enabled`;
}

/**
 * Floor for an operator-supplied cadence override (doc 07 §8, doc 08 §12). Below the fastest
 * catalogue default (`SubmitPriceChanges` at 30 s) is very likely a typo, not an intentional
 * choice — this stops a fat-fingered value from hammering a marketplace or the DB.
 */
export const MIN_JOB_CADENCE_MS = 10_000;

/** `app_settings` key holding an operator's cadence override for a job, if any (doc 07 §8). */
export function jobCadenceSettingKey(jobName: string): string {
  return `job.${jobName}.cadenceMs`;
}

/** Catalogue default only — `null` for a job with no cadence at all (`ImportBundles`). */
export function jobDefaultCadenceMs(jobName: string): number | null {
  return JOB_CATALOG.find((entry) => entry.jobName === jobName)?.cadenceMs ?? null;
}

/**
 * Effective cadence for a job: a stored override wins, else the catalogue default. Mirrors
 * `isJobEnabled`'s precedence. A job with no cadence at all (`ImportBundles`) never accepts an
 * override (doc 07 §1.1 — no bundle-source port exists yet), so this can only return `null` via
 * the catalogue default, never via a stored setting.
 *
 * Read once at worker startup (`apps/worker/src/index.ts`) — a changed setting takes effect on
 * the worker's next restart, not mid-process, the same as the scrape rate limit and marketplace
 * credentials.
 */
export async function getJobCadenceMs(appDb: AppDatabase, jobName: string): Promise<number | null> {
  const def = jobDefaultCadenceMs(jobName);
  if (def === null) return null;
  const setting = await configRepo.getAppSetting(appDb, jobCadenceSettingKey(jobName));
  if (!setting) return def;
  // Tolerate a corrupt, non-numeric or since-lowered-floor stored value by falling back to the
  // default rather than throwing or handing the worker a nonsensical interval.
  try {
    const parsed = JSON.parse(setting.value) as unknown;
    return typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= MIN_JOB_CADENCE_MS
      ? parsed
      : def;
  } catch {
    return def;
  }
}

/** What "no setting stored" means for a job — see `JobCatalogEntry.defaultEnabled`. */
export function jobDefaultEnabled(jobName: string): boolean {
  return JOB_CATALOG.find((entry) => entry.jobName === jobName)?.defaultEnabled ?? true;
}

/**
 * doc 12 6.9 "enable/disable". An explicit stored setting always wins; with none stored the
 * job's catalogue default applies, which is `true` for everything except `ScrapeCompetitors`
 * (api-references §1.6 requires an explicit decision before any scraping happens).
 *
 * Lives here rather than in `scheduler.ts` (which re-exports it for the existing public API)
 * so `runner.ts` can also read it — for the retry-vs-give-up decision in `handleFailure` —
 * without creating a `scheduler.ts` ⇄ `runner.ts` import cycle.
 */
export async function isJobEnabled(appDb: AppDatabase, jobName: string): Promise<boolean> {
  const setting = await configRepo.getAppSetting(appDb, jobEnabledSettingKey(jobName));
  if (setting?.value === 'false') return false;
  if (setting?.value === 'true') return true;
  return jobDefaultEnabled(jobName);
}
