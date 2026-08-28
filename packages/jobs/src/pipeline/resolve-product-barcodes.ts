/**
 * `ResolveProductBarcodes` — fills in the barcodes that make a cross-marketplace match possible
 * (api-references §2.14, doc 06 §12.5, Faz 8).
 *
 * ```
 * take up to `batchSize` tracked products nobody has asked about, freshest sweep first
 * for each, read its product page and store what it says — including "it says none"
 * stop early on a run of failures rather than spending the whole batch learning the same thing
 * ```
 *
 * ## Why a batch job and not a sweep
 *
 * This is the slow tier: one request per **product**, against 36 products per catalogue page.
 * Whiskas' 564 products cost 16 catalogue requests and 564 of these, at four a minute. A brand's
 * barcodes are therefore filled in over days, a batch at a time, and that is the intended shape
 * — not a limitation to work around. `barcode_resolved_at` is what makes it resumable: each run
 * picks up where the last one stopped, and a product is asked about once.
 *
 * ⚠️ **Reporting only.** Nothing here writes an observation, a listing or a price, and nothing
 * it produces reaches a pricing decision. Turning it off leaves every Trendyol report intact and
 * costs only the cross-marketplace column, which says so where it is read.
 */
import { ProductDetailError, type IProductDetailSource } from '@buybox/adapters';
import type { MarketplaceCode } from '@buybox/core';
import { eventsRepo, newId, productBarcodesRepo } from '@buybox/db';
import { z } from 'zod';
import type { JobContext, JobResult } from '../job.js';
import { getProductDetailSource } from '../product-detail-source-registry.js';

export const RESOLVE_PRODUCT_BARCODES_JOB = 'ResolveProductBarcodes';

/**
 * Products per run. 60 at four a minute is about a quarter-hour of work — long enough to make
 * progress on a 564-product brand, short enough that a run is never the thing holding a queue.
 */
export const BARCODE_BATCH_SIZE = 60;

/**
 * Consecutive failures that end a run early.
 *
 * Five, because the failures this job sees come in two flavours and only one is worth
 * continuing through. A single dead product fails alone and the next one succeeds. A blocked
 * client, a redesigned page or a lost network fails *every* product, and grinding through 60 of
 * them proves nothing while making 60 requests to a marketplace that is already refusing us.
 */
export const BARCODE_MAX_CONSECUTIVE_FAILURES = 5;

export const ResolveProductBarcodesPayloadSchema = z.object({
  marketplaceCode: z.enum(['trendyol', 'hepsiburada']),
  batchSize: z.number().int().min(1).default(BARCODE_BATCH_SIZE),
  maxConsecutiveFailures: z.number().int().min(1).default(BARCODE_MAX_CONSECUTIVE_FAILURES),
});

export type ResolveProductBarcodesPayload = z.infer<typeof ResolveProductBarcodesPayloadSchema>;

/** Never escalates — a reporting job's failure is recorded and the run continues. */
async function noteEvent(
  ctx: JobContext,
  marketplaceCode: MarketplaceCode,
  level: 'info' | 'warn',
  code: string,
  message: string,
): Promise<void> {
  try {
    await eventsRepo.logEvent(ctx.appDb, {
      id: newId(),
      at: ctx.clock.nowMs(),
      level,
      marketplaceCode,
      listingId: null,
      jobRunId: ctx.correlationId,
      code,
      message,
      context: null,
    });
  } catch {
    // Deliberately silent: an unwritable event must not lose the barcodes already stored.
  }
}

export interface BarcodeAttempt {
  readonly barcode: string | null;
  readonly error: string | null;
}

/**
 * Reads one product's page.
 *
 * An `identityMismatch` is a **failure and never a stored answer**: the page is about a
 * different product and its barcode belongs to that one. Writing it here would attach one
 * article's barcode to another's row, and every match built on it afterwards would be
 * confidently wrong — the exact outcome the barcode join exists to avoid.
 */
export async function resolveOneBarcode(
  source: IProductDetailSource,
  productRef: string,
  productUrl: string,
): Promise<BarcodeAttempt> {
  try {
    const snapshot = await source.fetchProductDetail(productRef, productUrl);
    return { barcode: snapshot.detail.barcode, error: null };
  } catch (error) {
    const reason =
      error instanceof ProductDetailError
        ? `${error.kind}: ${error.message}`
        : error instanceof Error
          ? error.message
          : String(error);
    return { barcode: null, error: reason };
  }
}

export async function resolveProductBarcodes(ctx: JobContext): Promise<JobResult> {
  const payload = ResolveProductBarcodesPayloadSchema.parse(JSON.parse(ctx.payload));
  const marketplaceCode = payload.marketplaceCode as MarketplaceCode;

  const source = getProductDetailSource(ctx.productDetailSources, marketplaceCode);
  if (!source) {
    // A marketplace with no detail source is a supported configuration: its products simply have
    // no barcode, and the match report says how many.
    return { itemsTotal: 0, itemsOk: 0, itemsFailed: 0 };
  }

  const targets = await productBarcodesRepo.barcodeTargets(
    ctx.appDb,
    marketplaceCode,
    payload.batchSize,
  );
  if (targets.length === 0) {
    return { itemsTotal: 0, itemsOk: 0, itemsFailed: 0 };
  }

  let ok = 0;
  let failed = 0;
  let statedNone = 0;
  let consecutiveFailures = 0;
  let lastError: string | null = null;

  for (const [index, target] of targets.entries()) {
    ctx.reportProgress({ done: index, total: targets.length, currentItem: target.label });

    const attempt = await resolveOneBarcode(source, target.productRef, target.productUrl);
    if (attempt.error !== null) {
      failed += 1;
      consecutiveFailures += 1;
      lastError = attempt.error;
      // The failure is recorded on the product, not just counted in this run. Without it the
      // permanently broken rows come back at the head of the next run, and the one after that,
      // for ever — see `BARCODE_MAX_ATTEMPTS`. No answer is written: a failed read is not the
      // statement that the page carries no barcode.
      await productBarcodesRepo.recordBarcodeAttemptFailed(ctx.appDb, target.id);
      if (consecutiveFailures >= payload.maxConsecutiveFailures) {
        await noteEvent(
          ctx,
          marketplaceCode,
          'warn',
          'BarcodeRunAborted',
          `Barkod turu ${consecutiveFailures} art arda hata sonrası durduruldu: ${lastError}`,
        );
        break;
      }
      continue;
    }

    consecutiveFailures = 0;
    // Stored either way. "The page stated no barcode" is an answer, and recording it is what
    // stops this product being asked again every night for ever.
    await productBarcodesRepo.setProductBarcode(
      ctx.appDb,
      target.id,
      attempt.barcode,
      ctx.clock.nowMs(),
    );
    if (attempt.barcode === null) statedNone += 1;
    ok += 1;
  }

  ctx.reportProgress({ done: targets.length, total: targets.length, currentItem: null });

  if (ok > 0) {
    await noteEvent(
      ctx,
      marketplaceCode,
      'info',
      'BarcodesResolved',
      `${ok} üründe barkod soruldu (${ok - statedNone} barkod bulundu, ${statedNone} üründe sayfa barkod bildirmedi)`,
    );
  }

  return { itemsTotal: targets.length, itemsOk: ok, itemsFailed: failed };
}
