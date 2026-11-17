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
import { bandViolationsRepo } from '@buybox/db';
import { BAND_STALE_AFTER_MS } from '@buybox/jobs';
import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/server/auth/guard';
import { bandStaleness } from '@/lib/server/band-staleness';
import { getAppDb } from '@/lib/server/db';

/** How far back the "recently resolved" list reaches. */
const RESOLVED_WINDOW_MS = 7 * 24 * 60 * 60_000;

function toWire(row: bandViolationsRepo.BandViolationListRow) {
  return {
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
  };
}

async function getHandler() {
  const appDb = getAppDb();
  const nowMs = Date.now();
  const [open, resolved, staleness] = await Promise.all([
    bandViolationsRepo.queryBandViolations(appDb, { state: 'open' }),
    bandViolationsRepo.queryBandViolations(appDb, {
      state: 'resolved',
      resolvedSinceMs: nowMs - RESOLVED_WINDOW_MS,
      limit: 200,
    }),
    bandStaleness(appDb, nowMs),
  ]);
  return NextResponse.json({
    open: open.map(toWire),
    resolved: resolved.map(toWire),
    resolvedWindowMs: RESOLVED_WINDOW_MS,
    staleness,
    staleAfterMs: BAND_STALE_AFTER_MS,
  });
}

export const GET = withPermission('view', getHandler);
