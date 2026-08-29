/**
 * "Seçilenleri şimdi tara" — enqueues a `RescanTrackedProducts` run for the rows the operator
 * ticked on `/tracked-products` (doc 06 §12.2).
 *
 * Enqueues rather than scrapes inline, for the reason `/api/watched-brands/[id]/sweep` and
 * `/api/jobs/run-now` do: the web process inserts a `job_queue` row and whichever process's
 * scheduler polls next claims it. Even a fifty-product rescan is minutes at the conservative
 * scrape rate — well past a sensible HTTP timeout — and running it as a job puts its progress
 * on the Jobs screen for free.
 *
 * **Split per marketplace.** A competitor source is registered per marketplace and a run has
 * exactly one, so a selection spanning Trendyol and Hepsiburada becomes two jobs. That is also
 * what keeps the two marketplaces independent under the guard below.
 *
 * ## One rescan per marketplace at a time
 *
 * A second press while the first is queued or running is answered 409, not queued behind it —
 * the same single-flight rule, enforced the same way, as the brand sweep. Two rescans against
 * one marketplace would halve each other's share of that source's rate limit for no gain, and
 * `countActiveJobsForTarget` counts a payload-less run as covering the marketplace, so a
 * whole-marketplace `ScrapeCompetitors` does not need a separate check: it is a different job
 * name and deliberately does not suppress this one. A rescan is fifty pages against a source
 * already pacing itself, and an operator waiting on an hourly catalogue pass to finish before
 * they may look at one product is the problem this endpoint exists to solve.
 */
import { NextResponse } from 'next/server';
import { RESCAN_MAX_PRODUCTS, RESCAN_TRACKED_PRODUCTS_JOB } from '@buybox/jobs';
import { jobsRepo, newId, trackedProductsRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

export async function POST(request: Request) {
  const body = (await request.json()) as { ids?: unknown };
  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.filter((id): id is string => typeof id === 'string' && id.length > 0))]
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: 'En az bir ürün seçin.' }, { status: 400 });
  }
  if (ids.length > RESCAN_MAX_PRODUCTS) {
    // Refused rather than truncated: silently reading part of a selection and reporting success
    // is how an operator comes to believe a figure was refreshed when it was not.
    return NextResponse.json(
      {
        error: `Tek seferde en fazla ${RESCAN_MAX_PRODUCTS} ürün taranabilir — ${ids.length} ürün seçtiniz. Bir markanın tamamı için İzlenen Markalar ekranından "Şimdi tara" kullanın.`,
      },
      { status: 400 },
    );
  }

  const appDb = getAppDb();

  // Resolved here, not in the handler, so the operator learns *now* that a row has gone — and so
  // the payload carries only ids that exist and the job's totals mean what they say.
  const byMarketplace = new Map<string, string[]>();
  for (const id of ids) {
    const product = await trackedProductsRepo.getTrackedProduct(appDb, id);
    if (!product) continue;
    const bucket = byMarketplace.get(product.marketplaceCode);
    if (bucket) bucket.push(id);
    else byMarketplace.set(product.marketplaceCode, [id]);
  }

  if (byMarketplace.size === 0) {
    return NextResponse.json({ error: 'Seçilen ürünler bulunamadı.' }, { status: 404 });
  }

  for (const marketplaceCode of byMarketplace.keys()) {
    const active = await jobsRepo.countActiveJobsForTarget(
      appDb,
      RESCAN_TRACKED_PRODUCTS_JOB,
      marketplaceCode,
    );
    if (active > 0) {
      return NextResponse.json(
        {
          error: `${marketplaceCode} için bir yeniden tarama zaten kuyrukta veya çalışıyor. İlerlemesi İşler ekranında görünür.`,
        },
        { status: 409 },
      );
    }
  }

  const nowMs = Date.now();
  const jobIds: string[] = [];
  for (const [marketplaceCode, productIds] of byMarketplace) {
    const jobId = newId();
    await jobsRepo.enqueueJob(appDb, {
      id: jobId,
      jobName: RESCAN_TRACKED_PRODUCTS_JOB,
      payload: JSON.stringify({ marketplaceCode, trackedProductIds: productIds }),
      // Ahead of the cadence work in the same queue — the claim is `ORDER BY priority ASC`, so a
      // *lower* number is claimed first. This is the one scrape a human is waiting on, and it is
      // bounded at fifty pages, so it cannot starve anything behind it.
      priority: -1,
      state: 'ready',
      runAfter: nowMs,
      lockedBy: null,
      lockedUntil: null,
      attempts: 0,
      // One attempt, not three. A rescan is a snapshot the operator asked for at a moment; a
      // retry minutes later answers a question nobody is still asking, and the per-product
      // failures inside the run are already tolerated and recorded.
      maxAttempts: 1,
      lastError: null,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    jobIds.push(jobId);
  }

  const queued = [...byMarketplace.values()].reduce((sum, list) => sum + list.length, 0);
  return NextResponse.json({ ok: true, jobIds, queued, missing: ids.length - queued });
}
