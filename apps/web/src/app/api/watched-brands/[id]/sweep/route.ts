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
 *
 * ## `withSellers` — the catalogue, then every seller on it
 *
 * The default, and what the screen's "Şimdi tara" sends (operator request 2026-09-08). A sweep
 * alone answers "what products exist under this brand?" and collects no seller, price or buybox
 * data whatsoever — that is `ScrapeCompetitors`' tracked half, which rotates the whole catalogue
 * at 300 products a cycle, so a newly watched brand read as complete on every brand screen while
 * its products still said "hiç bakılmadı" for the better part of a day.
 *
 * With the flag set, the sweep chains a `ScrapeBrandSellers` run per brand it swept (doc 07
 * §7.3), which walks that brand's whole catalogue a page at a time — 305 products for Acana,
 * 5,204 for Royal Canin — with no rotation ceiling. That is hours of fetching at the configured
 * rate, which is the point rather than a side effect, so it is a flag an operator sets and never
 * something the cadence does.
 *
 * The chaining happens *inside* the sweep handler rather than here: the scheduler claims several
 * jobs per tick and does not order them, so a seller scrape queued alongside the sweep could win
 * the race and read the brand as it was before it.
 */
import { NextResponse } from 'next/server';
import { DEFAULT_MAX_ATTEMPTS, SCRAPE_BRAND_SELLERS_JOB, SWEEP_BRAND_CATALOGUE_JOB } from '@buybox/jobs';
import { jobsRepo, newId, watchedBrandsRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const appDb = getAppDb();

  // Defaults to `true`: an empty body is the screen's "Şimdi tara", and a catalogue with no
  // sellers on it is the state this endpoint exists to get an operator out of. `false` is the
  // deliberate "sadece katalog" press.
  const body = (await request.json().catch(() => ({}))) as { withSellers?: unknown };
  const withSellers = body.withSellers !== false;

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

  if (withSellers) {
    const activeSellerScrape = await jobsRepo.countActiveJobsForPayloadField(
      appDb,
      SCRAPE_BRAND_SELLERS_JOB,
      'watchedBrandId',
      brand.id,
    );
    if (activeSellerScrape > 0) {
      return NextResponse.json(
        {
          error: `${brand.label} için bir satıcı taraması zaten kuyrukta veya çalışıyor. İlerlemesi İşler ekranında.`,
        },
        { status: 409 },
      );
    }
  }

  const nowMs = Date.now();
  const jobId = newId();
  await jobsRepo.enqueueJob(appDb, {
    id: jobId,
    jobName: SWEEP_BRAND_CATALOGUE_JOB,
    payload: JSON.stringify({
      marketplaceCode: brand.marketplaceCode,
      watchedBrandId: brand.id,
      scrapeSellersAfter: withSellers,
    }),
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
  return NextResponse.json({ ok: true, jobId, withSellers });
}
