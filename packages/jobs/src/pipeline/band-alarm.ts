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
 * Every violation **opened** here enqueues one `notification_deliveries` row per channel
 * (doc 07 §7.5, build plan 11.7); `DeliverNotifications` sends them. A reopening for the same
 * (card, kind, seller) inside `BAND_RENOTIFY_QUIET_MS` is enqueued `suppressed`: recorded, never
 * sent. Confirmations and resolutions enqueue nothing (doc 17 §6).
 */
import { evaluateBand, planBandReconcile, type BandLook } from '@buybox/core';
import type { CompetitorOffer } from '@buybox/adapters';
import { bandViolationsRepo, newId, notificationDeliveriesRepo, type brandProductsRepo } from '@buybox/db';
import type { JobContext } from '../job.js';
import { BAND_RENOTIFY_QUIET_MS } from '../notify-config.js';

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
  for (const row of opened) {
    const quiet = await bandViolationsRepo.resolvedRecentlyForSameSeller(ctx.appDb, {
      trackedProductId,
      kind: row.kind,
      sellerRef: row.sellerRef,
      sellerName: row.sellerName,
      sinceMs: nowMs - BAND_RENOTIFY_QUIET_MS,
    });
    await notificationDeliveriesRepo.enqueueDeliveries(
      ctx.appDb,
      notificationDeliveriesRepo.NOTIFICATION_CHANNELS.map((channel) => ({
        id: newId(),
        subjectType: 'bandViolation',
        subjectId: row.id,
        channel,
        state: quiet ? 'suppressed' : 'pending',
        attempts: 0,
        lastError: quiet ? 'sessiz dönem: aynı satıcı için kısa süre önce kapanan ihlal yeniden açıldı' : null,
        createdAt: nowMs,
        sentAt: null,
      })),
    );
  }

  return { opened: opened.length, resolved: stale.length + plan.resolve.length };
}
