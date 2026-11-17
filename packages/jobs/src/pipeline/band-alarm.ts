/**
 * The price-band alarm, run inside the shared read (doc 07 §7.5, doc 17 §5, build plan 11.6).
 *
 * Called by `scrapeTrackedProducts` after every **successful** look, so a card is evaluated
 * whichever lane — `SweepListedProducts`, `SweepTrackedProducts` or `RescanTrackedProducts` —
 * read it. A failed look never reaches this file: a page we could not read says nothing about
 * the price on it (§5.3).
 *
 * The judge is `evaluateBand`, the same function the İlanlar grid calls, and the buybox is the
 * rank-1 offer, the same row İlanlar takes — so the screen and the alarm cannot disagree.
 *
 * ⚠️ **Reporting only**, on doc 07 §7's terms. It reads no `listings` row and writes no price.
 * The caller wraps it so that an exception here is recorded and the look still counts.
 *
 * Notification of the rows opened here is build plan 11.7 (`notification_deliveries`). Until
 * that lands, the rows are on Alarmlar and on İlanlar, and this function returns them so the
 * notifier has one place to hook in.
 */
import { evaluateBand, planBandReconcile, type BandLook } from '@buybox/core';
import type { CompetitorOffer } from '@buybox/adapters';
import { bandViolationsRepo, type brandProductsRepo } from '@buybox/db';
import type { JobContext } from '../job.js';

export interface BandAlarmResult {
  readonly opened: number;
  readonly resolved: number;
}

/** The look's offers as stored on an opened violation — evidence that outlives the 90-day prune. */
function snapshotJson(offers: readonly CompetitorOffer[]): string {
  return JSON.stringify(
    offers.map((o) => ({
      rank: o.rank,
      sellerRef: o.sellerRef,
      sellerName: o.sellerName,
      price: o.price?.toKurus().toString() ?? null,
      finalPrice: o.finalPrice?.toKurus().toString() ?? null,
      offeredStock: o.offeredStock,
    })),
  );
}

export async function evaluateCardBand(
  ctx: JobContext,
  trackedProductId: string,
  link: brandProductsRepo.CardLink,
  offers: readonly CompetitorOffer[],
  nowMs: number,
): Promise<BandAlarmResult> {
  const openRows = await bandViolationsRepo.openViolationsForCard(ctx.appDb, trackedProductId);

  // A card moved to another brand product: its old product's violations end with the old link.
  const stale = openRows.filter((row) => row.brandProductId !== link.brandProductId);
  const current = openRows.filter((row) => row.brandProductId === link.brandProductId);

  let look: BandLook;
  if (offers.length === 0) {
    look = { kind: 'noOffers' };
  } else {
    const buybox = offers.find((o) => o.rank === 1) ?? null;
    look = {
      kind: 'offers',
      buyboxSeller: { sellerRef: buybox?.sellerRef ?? null, sellerName: buybox?.sellerName ?? '' },
      evaluation: evaluateBand(
        { referencePrice: link.referencePrice, minPrice: link.minPrice, maxPrice: link.maxPrice },
        link.unitMultiplier,
        buybox === null
          ? null
          : { price: buybox.price?.toKurus() ?? null, finalPrice: buybox.finalPrice?.toKurus() ?? null },
      ),
    };
  }

  const plan = planBandReconcile(current, look);
  const opened = await bandViolationsRepo.applyBandPlan(ctx.appDb, {
    trackedProductId,
    brandProductId: link.brandProductId,
    unitMultiplier: link.unitMultiplier,
    snapshot: plan.open.length > 0 ? snapshotJson(offers) : '[]',
    nowMs,
    plan: {
      ...plan,
      resolve: [...stale.map((row) => ({ id: row.id, resolution: 'unlinked' as const })), ...plan.resolve],
    },
  });
  return { opened: opened.length, resolved: stale.length + plan.resolve.length };
}
