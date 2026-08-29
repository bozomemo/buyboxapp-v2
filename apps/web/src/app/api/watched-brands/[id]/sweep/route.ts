/**
 * "Şimdi tara" — enqueues a `SweepBrandCatalogue` run scoped to one brand.
 *
 * Enqueues rather than sweeps inline, for the same reason `/api/jobs/run-now` does: the web
 * process inserts a `job_queue` row and whichever process's scheduler polls next picks it up.
 * That also keeps the browser out of the request — a full sweep is a minute for a small brand
 * and five for a large one, well past any sensible HTTP timeout — and puts progress on the Jobs
 * screen, which already renders it.
 *
 * The job is off by default in `JOB_CATALOG`, and that gates the *cadence* ticker, not this: an
 * operator asking for one sweep by hand has made the explicit decision api-references §1.6 wants,
 * for that one run.
 *
 * ## One sweep per brand at a time
 *
 * A second press while the first sweep is still queued or running is answered 409, not queued.
 * Nothing about the queue prevented it: the scheduler's own "one run at a time" guard covers the
 * *cadence* path only, and its ticks do not wait for each other — the second row was claimed and
 * started about two seconds later, so both sweeps ran at once. Two runs of one brand rewrite the
 * same rows for no gain, halve each other's share of the source's rate limit, and duplicate the
 * rating-history samples both passes detect as changed.
 *
 * A whole-marketplace sweep already in flight also answers 409 for any brand it covers — see
 * `countActiveJobsForPayloadField`. Two *different* brands remain free to run concurrently; that
 * is safe now the shared Playwright page serialises its fetches (`playwright-fetch.ts`), and it
 * is how an operator gets through several brands without waiting on each.
 */
import { NextResponse } from 'next/server';
import { DEFAULT_MAX_ATTEMPTS, SWEEP_BRAND_CATALOGUE_JOB } from '@buybox/jobs';
import { jobsRepo, newId, watchedBrandsRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const appDb = getAppDb();

  const brand = await watchedBrandsRepo.getWatchedBrand(appDb, id);
  if (!brand) return NextResponse.json({ error: 'Marka bulunamadı.' }, { status: 404 });

  const active = await jobsRepo.countActiveJobsForPayloadField(
    appDb,
    SWEEP_BRAND_CATALOGUE_JOB,
    'watchedBrandId',
    brand.id,
  );
  if (active > 0) {
    return NextResponse.json(
      { error: `${brand.label} için bir tarama zaten kuyrukta veya çalışıyor. İlerlemesi İşler ekranında.` },
      { status: 409 },
    );
  }

  const nowMs = Date.now();
  const jobId = newId();
  await jobsRepo.enqueueJob(appDb, {
    id: jobId,
    jobName: SWEEP_BRAND_CATALOGUE_JOB,
    payload: JSON.stringify({ marketplaceCode: brand.marketplaceCode, watchedBrandId: brand.id }),
    priority: 0,
    state: 'ready',
    runAfter: nowMs,
    lockedBy: null,
    lockedUntil: null,
    attempts: 0,
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
    lastError: null,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  return NextResponse.json({ ok: true, jobId });
}
