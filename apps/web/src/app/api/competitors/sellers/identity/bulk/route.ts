/**
 * _Seçilenlerin kimliğini çöz_ — queues one `ResolveSellerIdentities` run for the sellers ticked on
 * `/watched-brands/sellers` (2026-11-25, product owner; doc 06 §12.4 Faz 7).
 *
 * - **One run per marketplace**, naming the sellers; the run walks them one after another through
 *   the same source the single button uses, so the six-per-minute rate is unchanged.
 * - **Only sellers there is something to do for.** A seller already resolved is left out — the
 *   operator can press _Yeniden çöz_ on that one — and so is a ref that is not registered. Both
 *   are counted back, so the screen can say what it did.
 * - **One selection at a time per marketplace.** A second press while a run is queued or running
 *   is answered 409, like the single button and the tracked-product rescan.
 * - **Refused whole above `IDENTITY_BULK_MAX_SELLERS`**, never truncated: resolving part of a
 *   selection and reporting success is how someone comes to believe a list was finished.
 */
import { NextResponse } from 'next/server';
import { competitorSellersRepo, jobsRepo, newId, sellerIdentitiesRepo } from '@buybox/db';
import { IDENTITY_BULK_MAX_SELLERS, RESOLVE_SELLER_IDENTITIES_JOB } from '@buybox/jobs';
import { getAppDb } from '@/lib/server/db';
import { invalidBody, readJsonBody } from '@/lib/server/request-body';
import { withPermission } from '@/lib/server/auth/guard';

interface SellerKey {
  readonly marketplaceCode: string;
  readonly sellerRef: string;
}

function readSellers(value: unknown): SellerKey[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: SellerKey[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const { marketplaceCode, sellerRef } = item as Record<string, unknown>;
    if (typeof marketplaceCode !== 'string' || typeof sellerRef !== 'string') continue;
    if (!marketplaceCode || !sellerRef) continue;
    const key = `${marketplaceCode}::${sellerRef}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ marketplaceCode, sellerRef });
  }
  return out;
}

async function postHandler(request: Request) {
  const body = await readJsonBody<{ sellers?: unknown }>(request);
  if (body === null) return invalidBody();
  const sellers = readSellers(body.sellers);

  if (sellers.length === 0) {
    return NextResponse.json({ error: 'En az bir satıcı seçin.' }, { status: 400 });
  }
  if (sellers.length > IDENTITY_BULK_MAX_SELLERS) {
    return NextResponse.json(
      {
        error: `Tek seferde en fazla ${IDENTITY_BULK_MAX_SELLERS} satıcının kimliği çözülebilir — ${sellers.length} satıcı seçtiniz.`,
      },
      { status: 400 },
    );
  }

  const appDb = getAppDb();
  let missing = 0;
  let alreadyResolved = 0;
  const byMarketplace = new Map<string, string[]>();
  for (const key of sellers) {
    const seller = await competitorSellersRepo.getCompetitorSeller(appDb, key.marketplaceCode, key.sellerRef);
    if (!seller) {
      missing += 1;
      continue;
    }
    if (await sellerIdentitiesRepo.getSellerIdentity(appDb, seller.id)) {
      alreadyResolved += 1;
      continue;
    }
    const bucket = byMarketplace.get(seller.marketplaceCode);
    if (bucket) bucket.push(seller.sellerRef);
    else byMarketplace.set(seller.marketplaceCode, [seller.sellerRef]);
  }

  for (const marketplaceCode of byMarketplace.keys()) {
    const active = await jobsRepo.countActiveJobsForTarget(appDb, RESOLVE_SELLER_IDENTITIES_JOB, marketplaceCode);
    if (active > 0) {
      return NextResponse.json(
        {
          error:
            'Seçili satıcılar için bir kimlik çözümü zaten kuyrukta veya çalışıyor. İlerlemesi İşler ekranında görünür.',
        },
        { status: 409 },
      );
    }
  }

  const nowMs = Date.now();
  const jobIds: string[] = [];
  for (const [marketplaceCode, sellerRefs] of byMarketplace) {
    const jobId = newId();
    await jobsRepo.enqueueJob(appDb, {
      id: jobId,
      jobName: RESOLVE_SELLER_IDENTITIES_JOB,
      payload: JSON.stringify({ marketplaceCode, sellerRefs }),
      // Same queue position as the cadence work, not ahead of it: unlike the single button, a
      // selection is a long run nobody is watching second by second.
      priority: 0,
      state: 'ready',
      runAfter: nowMs,
      lockedBy: null,
      lockedUntil: null,
      attempts: 0,
      // One attempt. Per-seller failures are recorded inside the run and do not fail it; a retry
      // of the whole run would load every page again for the sellers that already answered.
      maxAttempts: 1,
      lastError: null,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    jobIds.push(jobId);
  }

  const queued = [...byMarketplace.values()].reduce((sum, refs) => sum + refs.length, 0);
  return NextResponse.json({ ok: true, jobIds, queued, alreadyResolved, missing });
}

export const POST = withPermission('catalogue.manage', postHandler);
