/**
 * `EvaluateBrandFindings` — runs the brand audit on a cadence and pushes what is new
 * (2026-09-03).
 *
 * ```
 * for each active watched brand:
 *     collect the same facts the findings screen collects
 *     derive the same findings, with the operator's own thresholds
 *     reconcile them against what was already open
 *     send the ones nobody has been told about yet
 * ```
 *
 * ## Why this job exists
 *
 * Every signal the audit produces was already correct and none of it reached anyone who was not
 * looking at the screen. A brand manager does not open a dashboard hourly, and the findings
 * where a day's delay costs most — a blocked seller returning, a seller under the published
 * price — are exactly the ones that sat unread. This is the *push* half; `/watched-brands/findings`
 * remains the pull half, and both run through `collectBrandFindings` so they cannot disagree.
 *
 * ## What it does not do
 *
 * **It never touches a price.** Like every other job in the brand module it reads
 * `tracked_products`; `Reprice` and `ObserveBuybox` read `listings`. Turning this on cannot
 * change what any listing sells for, which is the property that lets it default to *on* where
 * the scraping jobs default to off — it makes no requests at all, it only reads the archive
 * those jobs already wrote.
 *
 * **It never notifies a resolution.** A finding disappears either because the condition ended
 * or because somebody moved a threshold, and nothing here can tell the two apart. See
 * `findings-notifier.ts`.
 *
 * **A notification failure is not a run failure.** The finding is stored either way; only
 * `notified_at` stays null, and the next run tries again. An install with no webhook configured
 * is the normal case and is not an error — it loses a notification, never a finding.
 */
import { brandFindingsRepo, eventsRepo, newId, watchedBrandsRepo, type AppDatabase } from '@buybox/db';
import { z } from 'zod';
import type { AuditThresholds } from '@buybox/core';
import { DEFAULT_AUDIT_THRESHOLDS } from '@buybox/core';
import { configRepo } from '@buybox/db';
import type { JobContext, JobResult } from '../job.js';
import { collectBrandFindings } from './brand-findings.js';
import {
  MAX_FINDINGS_PER_MESSAGE,
  WebhookFindingNotifier,
  type IFindingNotifier,
} from './findings-notifier.js';

export const EVALUATE_BRAND_FINDINGS_JOB = 'EvaluateBrandFindings';

/**
 * The window each evaluation looks back over. Matches the findings screen's own default, so an
 * operator who opens the screen after a notification sees the run that produced it rather than a
 * differently-scoped one.
 */
export const FINDINGS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Where the operator's threshold overrides live. Shared with the web app, by key. */
export const AUDIT_THRESHOLDS_KEY = 'brandAudit.thresholds';

export const EvaluateBrandFindingsPayloadSchema = z.object({
  /** Evaluate one brand instead of all of them — the "run now" path from a screen. */
  watchedBrandId: z.string().optional(),
});

export type EvaluateBrandFindingsPayload = z.infer<typeof EvaluateBrandFindingsPayloadSchema>;

/**
 * The thresholds in force, merged over the defaults.
 *
 * Merged rather than used as stored, for the reason the web app's copy of this gives at length:
 * a value stored before a threshold existed carries no key for it, and `undefined` flowing into
 * a comparison makes every comparison false — the finding silently stops firing on exactly the
 * installs that have saved this row once.
 */
async function readThresholds(appDb: AppDatabase): Promise<AuditThresholds> {
  const setting = await configRepo.getAppSetting(appDb, AUDIT_THRESHOLDS_KEY);
  if (!setting) return DEFAULT_AUDIT_THRESHOLDS;
  try {
    return { ...DEFAULT_AUDIT_THRESHOLDS, ...(JSON.parse(setting.value) as Partial<AuditThresholds>) };
  } catch {
    // A row we cannot parse is a reason to run on the documented defaults, not a reason to stop
    // producing findings. The screen shows the same numbers and would say the same thing.
    return DEFAULT_AUDIT_THRESHOLDS;
  }
}

export interface EvaluateBrandFindingsOptions {
  /**
   * Where to push. Injected so the job is testable without a network, and resolved from the
   * environment by the worker — a webhook URL is a bearer token and must not live in a settings
   * row (CLAUDE.md).
   */
  readonly notifier?: IFindingNotifier;
}

export async function evaluateBrandFindings(
  ctx: JobContext,
  options: EvaluateBrandFindingsOptions = {},
): Promise<JobResult> {
  const payload = EvaluateBrandFindingsPayloadSchema.parse(JSON.parse(ctx.payload || '{}'));
  const nowMs = ctx.clock.nowMs();
  const thresholds = await readThresholds(ctx.appDb);
  const notifier = options.notifier ?? webhookNotifierFromEnv();

  /**
   * Own brands only (2026-09-03).
   *
   * A competitor's brand is watched for price comparison, not for audit, and the audit's whole
   * `stated` tier is meaningless against one: "yasaklı satıcı" and "yetkili listesinde yok" are
   * statements about **our** distribution agreements, and nobody is unauthorised by us to sell
   * somebody else's brand. Evaluating a rival would open hundreds of findings that are wrong in
   * kind rather than in degree, which is the fastest way to make an audit list unreadable.
   */
  const brands = (
    await watchedBrandsRepo.listWatchedBrands(ctx.appDb, { activeOnly: true, ownOnly: true })
  ).filter((brand) => payload.watchedBrandId === undefined || brand.id === payload.watchedBrandId);

  let itemsOk = 0;
  let itemsFailed = 0;
  let done = 0;

  for (const brand of brands) {
    ctx.reportProgress({ done, total: brands.length, currentItem: brand.label });
    done += 1;
    try {
      const { findings } = await collectBrandFindings(ctx.appDb, {
        brand,
        sinceMs: nowMs - FINDINGS_WINDOW_MS,
        untilMs: nowMs,
        thresholds,
      });

      const { opened, resolved } = await brandFindingsRepo.reconcileBrandFindings(
        ctx.appDb,
        brand.id,
        findings.map((finding) => ({
          key: finding.id,
          kind: finding.kind,
          basis: finding.basis,
          magnitude: finding.magnitude,
          // `bigint` does not survive `JSON.stringify`, and the reference-price finding carries
          // two. Serialised as decimal strings — the same shape money takes on every wire in
          // this system (CLAUDE.md: format only at the display boundary).
          payload: JSON.stringify(finding, (_key, value) =>
            typeof value === 'bigint' ? value.toString() : value,
          ),
        })),
        nowMs,
      );

      itemsOk += 1;

      if (opened.length > 0) {
        await eventsRepo.logEvent(ctx.appDb, {
          id: newId(),
          at: nowMs,
          level: 'info',
          marketplaceCode: brand.marketplaceCode,
          listingId: null,
          jobRunId: ctx.correlationId,
          code: 'BrandFindingsOpened',
          message: `${brand.label}: ${opened.length} yeni denetim bulgusu (${resolved} kapandı)`,
          context: JSON.stringify({ opened: opened.length, resolved, watchedBrandId: brand.id }),
        });
      }

      // Sending is deliberately outside the try that counts the brand as failed: a webhook that
      // is down must not make the evaluation look broken, because the evaluation worked and its
      // findings are stored.
      if (notifier !== null) {
        await notifyOpened(ctx, notifier, brand.label, opened, nowMs);
      }
    } catch (error) {
      itemsFailed += 1;
      await eventsRepo.logEvent(ctx.appDb, {
        id: newId(),
        at: nowMs,
        level: 'warn',
        marketplaceCode: brand.marketplaceCode,
        listingId: null,
        jobRunId: ctx.correlationId,
        code: 'BrandFindingsEvaluationFailed',
        message: `${brand.label} için denetim bulguları hesaplanamadı: ${error instanceof Error ? error.message : String(error)}`,
        context: null,
      });
    }
  }

  return { itemsTotal: brands.length, itemsOk, itemsFailed };
}

/**
 * Sends one message per brand and records what was told, or records that the send failed.
 *
 * `markFindingsNotified` runs **after** the send resolves, never before: a finding whose message
 * failed keeps `notified_at` null and is picked up by the next run, which is the entire reason
 * that column exists rather than being inferred from `first_seen_at`.
 */
async function notifyOpened(
  ctx: JobContext,
  notifier: IFindingNotifier,
  brandLabel: string,
  opened: readonly brandFindingsRepo.BrandFindingRow[],
  nowMs: number,
): Promise<void> {
  if (opened.length === 0) return;
  try {
    await notifier.send({
      brandLabel,
      findings: opened.slice(0, MAX_FINDINGS_PER_MESSAGE),
      omitted: Math.max(0, opened.length - MAX_FINDINGS_PER_MESSAGE),
    });
    await brandFindingsRepo.markFindingsNotified(
      ctx.appDb,
      opened.map((f) => f.id),
      nowMs,
    );
  } catch (error) {
    await eventsRepo.logEvent(ctx.appDb, {
      id: newId(),
      at: nowMs,
      level: 'warn',
      marketplaceCode: null,
      listingId: null,
      jobRunId: ctx.correlationId,
      code: 'BrandFindingsNotificationFailed',
      message: `Denetim bulgusu bildirimi gönderilemedi (${brandLabel}): ${error instanceof Error ? error.message : String(error)}`,
      context: null,
    });
  }
}

/**
 * The transport an install has configured, or `null`.
 *
 * Read from the environment at call time rather than at import, so a worker restart is all it
 * takes to change it. `null` — nothing configured — is the normal state and is not an error:
 * findings are still derived, stored and on the screen.
 */
function webhookNotifierFromEnv(): IFindingNotifier | null {
  const url = process.env.FINDINGS_WEBHOOK_URL;
  return url ? new WebhookFindingNotifier(url) : null;
}
