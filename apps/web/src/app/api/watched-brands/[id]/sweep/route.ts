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
