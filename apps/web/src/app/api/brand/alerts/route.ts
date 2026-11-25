/**
 * Alarmlar (`/brand/alerts`) — price-band violations (doc 17 §5.4, build plan 11.6).
 *
 * Open violations first, ordered so a brand product's cards sit together; then the ones resolved
 * in the last `RESOLVED_WINDOW_MS`. Returned with the listings lane's freshness, together and on
 * purpose, as `/api/alerts` does: zero open violations beside a lane that has not read anything in
 * hours is "we have not looked", not "all clear".
 *
 * Amounts cross as decimal kuruş strings, like every other route.
 */
import { LOW_STOCK_THRESHOLD } from '@buybox/core';
import { bandViolationsRepo, brandProductsRepo, notificationDeliveriesRepo } from '@buybox/db';
import { BAND_STALE_AFTER_MS } from '@buybox/jobs';
import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/server/auth/guard';
import { bandStaleness } from '@/lib/server/band-staleness';
import { brandAvailability } from '@/lib/server/brand-availability';
import { getAppDb } from '@/lib/server/db';

/** How far back the "recently resolved" list reaches. */
const RESOLVED_WINDOW_MS = 7 * 24 * 60 * 60_000;

function toWire(
  row: bandViolationsRepo.BandViolationListRow,
  deliveries: Map<string, notificationDeliveriesRepo.NotificationDeliveryRow[]>,
) {
  return {
    /** Who was told, per channel (doc 07 §7.6): the screen says who was not, and why. */
    notifications: (deliveries.get(row.id) ?? []).map((d) => ({
      channel: d.channel,
      state: d.state,
      reason: d.lastError,
    })),
    id: row.id,
    brandProductId: row.brandProductId,
    brandProductName: row.brandProductName,
    trackedProductId: row.trackedProductId,
    cardLabel: row.cardLabel,
    cardUrl: row.cardUrl,
    marketplaceCode: row.marketplaceCode,
    kind: row.kind,
    sellerRef: row.sellerRef,
    sellerName: row.sellerName,
    state: row.state,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    resolvedAt: row.resolvedAt,
    resolution: row.resolution,
    thresholdApplied: row.thresholdApplied.toString(),
    unitMultiplier: row.unitMultiplier,
    observedPrice: row.observedPrice.toString(),
    priceSource: row.priceSource,
    /** Shelf price or only the coupon (brand roadmap §6.7). */
    basis: row.basis,
  };
}

async function getHandler() {
  const appDb = getAppDb();
  const nowMs = Date.now();
  const [open, resolved, staleness, availability, linkedCardCount] = await Promise.all([
    bandViolationsRepo.queryBandViolations(appDb, { state: 'open' }),
    bandViolationsRepo.queryBandViolations(appDb, {
      state: 'resolved',
      resolvedSinceMs: nowMs - RESOLVED_WINDOW_MS,
      limit: 200,
    }),
    bandStaleness(appDb, nowMs),
    brandAvailability(appDb),
    brandProductsRepo.countLinkedCards(appDb),
  ]);
  const deliveries = await notificationDeliveriesRepo.deliveriesForSubjects(
    appDb,
    'bandViolation',
    [...open, ...resolved].map((row) => row.id),
  );
  return NextResponse.json({
    open: open.map((row) => toWire(row, deliveries)),
    resolved: resolved.map((row) => toWire(row, deliveries)),
    resolvedWindowMs: RESOLVED_WINDOW_MS,
    staleness,
    staleAfterMs: BAND_STALE_AFTER_MS,
    linkedCardCount,
    /** Shelf and stock warnings on linked cards (brand roadmap §6.8). */
    availability,
    lowStockThreshold: LOW_STOCK_THRESHOLD,
  });
}

export const GET = withPermission('view', getHandler);
