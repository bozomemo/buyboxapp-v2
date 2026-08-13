/**
 * The doc 07 §1 job catalog, as data — one source of truth for `apps/worker`'s ticker
 * cadences and `apps/web`'s Jobs screen (doc 12 6.9: "schedule, last run, next run,
 * enable/disable, run-now"), so the UI's displayed schedule can never drift from what
 * actually fires.
 */
import { CONFIRM_SUBMISSIONS_JOB } from './pipeline/confirm-submissions.js';
import { IMPORT_BUNDLES_JOB } from './pipeline/import-bundles.js';
import { IMPORT_LISTINGS_JOB } from './pipeline/import-listings.js';
import { IMPORT_STOCK_ITEMS_JOB } from './pipeline/import-stock-items.js';
import { OBSERVE_BUYBOX_JOB } from './pipeline/observe-buybox.js';
import { PRUNE_HISTORY_JOB } from './pipeline/prune-history-job.js';
import { REPRICE_JOB } from './pipeline/reprice.js';
import { RESET_BUDGET_JOB } from './pipeline/reset-budget.js';
import { SUBMIT_PRICE_CHANGES_JOB } from './pipeline/submit-price-changes.js';

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
}

export const JOB_CATALOG: readonly JobCatalogEntry[] = [
  {
    jobName: IMPORT_LISTINGS_JOB,
    label: 'İlan İçe Aktarma',
    cadenceMs: 30 * 60_000,
    perMarketplace: true,
    defaultPayload: {},
  },
  {
    jobName: OBSERVE_BUYBOX_JOB,
    label: 'Buybox Gözlemi',
    cadenceMs: 60_000,
    perMarketplace: true,
    defaultPayload: { cycleNumber: 0 },
  },
  {
    jobName: REPRICE_JOB,
    label: 'Yeniden Fiyatlandırma',
    cadenceMs: 5 * 60_000,
    perMarketplace: true,
    defaultPayload: { mode: 'live' },
  },
  {
    jobName: SUBMIT_PRICE_CHANGES_JOB,
    label: 'Fiyat Gönderimi',
    cadenceMs: 30_000,
    perMarketplace: true,
    defaultPayload: {},
  },
  {
    jobName: CONFIRM_SUBMISSIONS_JOB,
    label: 'Gönderim Onayı',
    cadenceMs: 60_000,
    perMarketplace: true,
    defaultPayload: {},
  },
  {
    jobName: RESET_BUDGET_JOB,
    label: 'Bütçe Sıfırlama',
    cadenceMs: 60 * 60_000,
    perMarketplace: true,
    defaultPayload: {},
  },
  {
    jobName: IMPORT_STOCK_ITEMS_JOB,
    label: 'Stok İçe Aktarma',
    cadenceMs: 24 * 60 * 60_000,
    perMarketplace: false,
    defaultPayload: {},
  },
  {
    jobName: PRUNE_HISTORY_JOB,
    label: 'Geçmiş Temizliği',
    cadenceMs: 24 * 60 * 60_000,
    perMarketplace: false,
    defaultPayload: {},
  },
  {
    // Deliberately no cadence (doc 10 §4 / Phase 5 note in apps/worker/src/index.ts): no bundle
    // source port exists yet, so this only ever runs from an explicit payload.
    jobName: IMPORT_BUNDLES_JOB,
    label: 'Paket İçe Aktarma',
    cadenceMs: null,
    perMarketplace: false,
    defaultPayload: { sourceCode: 'excel', sourceConfig: {} },
  },
];

/** `app_settings` key gating whether a cadence-driven job fires (doc 12 6.9 "enable/disable"). Missing ⇒ enabled. */
export function jobEnabledSettingKey(jobName: string): string {
  return `job.${jobName}.enabled`;
}
