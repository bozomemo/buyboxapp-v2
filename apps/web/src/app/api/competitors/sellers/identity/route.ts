/**
 * One storefront's resolved firm (doc 06 §12.4 Faz 7, guide §29).
 *
 * `GET` reads what is stored, `POST` enqueues a resolution, `DELETE` forgets one.
 *
 * The `POST` **enqueues** rather than resolving inline, for the same reason "Şimdi tara" does: a
 * resolution launches a headless browser against a marketplace and walks up to four product
 * pages behind a six-per-minute limiter, which is well past any sensible HTTP timeout and does
 * not belong in a request the operator's browser is holding open. The screen polls `GET`.
 *
 * `GET` returns the seller's own `taxNumber` beside the resolved one deliberately, even though
 * they are usually the same string. When they differ, the operator entered one by hand and the
 * marketplace states another — a disagreement about which firm is behind a storefront that
 * Faz 5's authorised-seller list is matched on. The screen shows both and nothing reconciles
 * them automatically.
 */
import { NextResponse } from 'next/server';
import { competitorSellersRepo, jobsRepo, newId, sellerIdentitiesRepo } from '@buybox/db';
import { DEFAULT_MAX_ATTEMPTS, RESOLVE_SELLER_IDENTITY_JOB } from '@buybox/jobs';
import { getAppDb } from '@/lib/server/db';
import { invalidBody, readJsonBody } from '@/lib/server/request-body';
import { withPermission } from '@/lib/server/auth/guard';

interface SellerKeyParams {
  readonly marketplaceCode: string;
  readonly sellerRef: string;
}

function readKey(params: URLSearchParams): SellerKeyParams | null {
  const marketplaceCode = params.get('marketplaceCode');
  const sellerRef = params.get('sellerRef');
  if (!marketplaceCode || !sellerRef) return null;
  return { marketplaceCode, sellerRef };
}

async function getHandler(request: Request) {
  const key = readKey(new URL(request.url).searchParams);
  if (!key) {
    return NextResponse.json({ error: 'Pazaryeri ve satıcı kimliği gerekli.' }, { status: 400 });
  }

  const appDb = getAppDb();
  const seller = await competitorSellersRepo.getCompetitorSeller(appDb, key.marketplaceCode, key.sellerRef);
  if (!seller) return NextResponse.json({ error: 'Satıcı bulunamadı.' }, { status: 404 });

  const identity = await sellerIdentitiesRepo.getSellerIdentity(appDb, seller.id);
  return NextResponse.json({
    seller: {
      id: seller.id,
      marketplaceCode: seller.marketplaceCode,
      sellerRef: seller.sellerRef,
      sellerName: seller.sellerName,
      taxNumber: seller.taxNumber,
      operatorNote: seller.operatorNote,
    },
    // `null`, not an empty object: "never resolved" and "resolved, found nothing" are different
    // answers, and only the first should offer a "resolve" button rather than a date.
    identity: identity ?? null,
    // The one comparison worth making for the operator, computed here rather than in the client
    // so the rule lives in one place.
    taxNumberDisagrees:
      identity?.taxNumber != null && seller.taxNumber != null && identity.taxNumber !== seller.taxNumber,
  });
}

async function postHandler(request: Request) {
  const body = await readJsonBody<Partial<SellerKeyParams>>(request);
  if (body === null) return invalidBody();
  if (!body.marketplaceCode || !body.sellerRef) {
    return NextResponse.json({ error: 'Pazaryeri ve satıcı kimliği gerekli.' }, { status: 400 });
  }

  const appDb = getAppDb();
  const seller = await competitorSellersRepo.getCompetitorSeller(
    appDb,
    body.marketplaceCode,
    body.sellerRef,
  );
  if (!seller) return NextResponse.json({ error: 'Satıcı bulunamadı.' }, { status: 404 });

  // One resolution per seller at a time, like every other on-demand job: a second press used to
  // queue a second job and read the same pages twice (2026-09-25).
  const pending = await jobsRepo.listActiveJobsCovering(appDb, RESOLVE_SELLER_IDENTITY_JOB, {
    marketplaceCode: seller.marketplaceCode,
    sellerRef: seller.sellerRef,
  });
  if (pending.length > 0) {
    return NextResponse.json(
      { error: 'Bu satıcı için bir kimlik sorgusu zaten kuyrukta veya çalışıyor.', jobId: pending[0]!.id },
      { status: 409 },
    );
  }

  const nowMs = Date.now();
  const jobId = newId();
  await jobsRepo.enqueueJob(appDb, {
    id: jobId,
    jobName: RESOLVE_SELLER_IDENTITY_JOB,
    payload: JSON.stringify({
      marketplaceCode: seller.marketplaceCode,
      sellerRef: seller.sellerRef,
    }),
    priority: 0,
    state: 'ready',
    runAfter: nowMs,
    lockedBy: null,
    lockedUntil: null,
    attempts: 0,
    // One attempt fewer than the default: a resolution that failed is nearly always a seller who
    // has left the products we know about, and retrying that twice more is three page loads
    // spent re-learning the same thing. The operator can ask again.
    maxAttempts: Math.max(1, DEFAULT_MAX_ATTEMPTS - 1),
    lastError: null,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  return NextResponse.json({ ok: true, jobId });
}

/**
 * Forgets a resolution — guide §29's "retain only while needed", as an operator action.
 *
 * The seller row, its group link, its note and its observation history all survive: this drops
 * the business/contact metadata and nothing else. It does **not** clear
 * `competitor_sellers.tax_number`, which by then may be the key an authorised-seller entry is
 * matched on; that column is the operator's, and only the operator empties it.
 */
async function deleteHandler(request: Request) {
  const key = readKey(new URL(request.url).searchParams);
  if (!key) {
    return NextResponse.json({ error: 'Pazaryeri ve satıcı kimliği gerekli.' }, { status: 400 });
  }

  const appDb = getAppDb();
  const seller = await competitorSellersRepo.getCompetitorSeller(appDb, key.marketplaceCode, key.sellerRef);
  if (!seller) return NextResponse.json({ error: 'Satıcı bulunamadı.' }, { status: 404 });

  await sellerIdentitiesRepo.deleteSellerIdentity(appDb, seller.id);
  return NextResponse.json({ ok: true });
}

export const GET = withPermission('view', getHandler);
export const POST = withPermission('catalogue.manage', postHandler);
export const DELETE = withPermission('catalogue.manage', deleteHandler);
