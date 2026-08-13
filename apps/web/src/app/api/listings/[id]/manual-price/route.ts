/**
 * Manual price edit from the grid (doc 06 §4.3): goes through the normal outbox — a `queued`
 * `price_submissions` row `ConfirmSubmissions`/`SubmitPriceChanges` pick up exactly like an
 * engine decision, so it gets the same pending/confirmed/failed lifecycle (R-UI-3) and the
 * same post-confirmation audit write (CLAUDE.md hard rule). It also pauses automation for
 * this listing for the policy's `settleDurationMs` (doc 06 §4.3: "so the bot does not
 * immediately overwrite the operator").
 */
import { NextResponse } from 'next/server';
import { configRepo, listingsRepo, newId, repricingRepo } from '@buybox/db';
import { Money } from '@buybox/shared';
import { getAppDb } from '@/lib/server/db';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as { newPrice: string };
  const appDb = getAppDb();
  const nowMs = Date.now();

  const listing = await listingsRepo.getListing(appDb, id);
  if (!listing) return NextResponse.json({ ok: false, error: 'İlan bulunamadı.' }, { status: 404 });

  const newPrice = Money.fromMajorUnitsString(body.newPrice).toKurus();
  if (listing.minPrice !== null && newPrice < listing.minPrice) {
    return NextResponse.json(
      { ok: false, error: 'Fiyat, ilanın belirlenen minimum fiyatının altında.' },
      { status: 400 },
    );
  }

  await repricingRepo.insertPriceSubmission(appDb, {
    id: newId(),
    listingId: id,
    marketplaceCode: listing.marketplaceCode,
    oldPrice: listing.price,
    newPrice,
    reason: 'manual',
    explanation: 'Operatör tarafından ızgaradan elle değiştirildi.',
    priority: 0,
    decidedAt: nowMs,
    state: 'queued',
    submittedAt: null,
    confirmedAt: null,
    marketplaceHandle: null,
    failureCode: null,
    failureMessage: null,
    attempts: 0,
    unitCost: null,
    floorPrice: null,
    buyboxPrice: null,
    secondPrice: null,
    rank: null,
    commissionRate: listing.commissionRate,
    vatRate: listing.vatRate,
  });

  const policy = await configRepo.getRepricingPolicy(appDb, listing.marketplaceCode);
  const settleUntil = nowMs + (policy?.settleDurationMs ?? 0);
  const existingState = await repricingRepo.getRepricingState(appDb, id);
  await repricingRepo.upsertRepricingState(
    appDb,
    existingState
      ? { ...existingState, settleUntil }
      : {
          listingId: id,
          phase: 'SEEKING',
          lastGoodPrice: null,
          lastBadPrice: null,
          optimumPrice: null,
          optimumCtxUnitCost: null,
          optimumCtxCommissionRate: null,
          optimumCtxVatRate: null,
          optimumCtxCampaignRatio: null,
          optimumCtxSecondPrice: null,
          optimumCtxSecondSellerRef: null,
          pendingSubmissionId: null,
          settleUntil,
          consecutiveRejections: 0,
          updatedAt: nowMs,
        },
  );

  return NextResponse.json({ ok: true, pausedUntil: settleUntil });
}
