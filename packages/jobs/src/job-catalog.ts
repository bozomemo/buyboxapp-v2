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
    defaultPayload: { cycleNumber: 0 },
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
    defaultPayload: { sourceCode: 'excel', sourceConfig: {} },
    defaultEnabled: true,
  },
  {
    jobName: SCRAPE_COMPETITORS_JOB,
    label: 'Rakip Verisi Toplama (raporlama)',
    cadenceMs: SCRAPE_CYCLE_MS,
    perMarketplace: true,
    defaultPayload: { cycleNumber: 0 },
    // Off until an operator turns it on: scraping needs an explicit business decision
    // (api-references §1.6, doc 04 §1.5), and nothing depends on it (doc 12 Phase 7 DoD).
    defaultEnabled: false,
  },
];

/** `app_settings` key gating whether a cadence-driven job fires (doc 12 6.9 "enable/disable"). */
export function jobEnabledSettingKey(jobName: string): string {
  return `job.${jobName}.enabled`;
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
