/**
 * `ImportListings` (doc 07 §1, §2, §6) — full listing sync from the marketplace adapter:
 * price, stock, commission, VAT, status. Idempotent upsert plus a stale sweep gated on full
 * success, per doc 07 §6 exactly — never delete-then-reload (doc 09 §25).
 */
import { getAdapter } from '../adapter-registry.js';
import { parseStockCode, type MarketplaceCode } from '@buybox/core';
import { eventsRepo, listingsRepo, newId } from '@buybox/db';
import { z } from 'zod';
import type { JobContext, JobResult } from '../job.js';
import { syncMerchantRef } from '../merchant-ref.js';
import { encodeListingExtra } from './listing-extra.js';

export const IMPORT_LISTINGS_JOB = 'ImportListings';

export const ImportListingsPayloadSchema = z.object({
  marketplaceCode: z.enum(['trendyol', 'hepsiburada']),
});

export type ImportListingsPayload = z.infer<typeof ImportListingsPayloadSchema>;

export async function importListings(ctx: JobContext): Promise<JobResult> {
  const payload = ImportListingsPayloadSchema.parse(JSON.parse(ctx.payload));
  const marketplaceCode: MarketplaceCode = payload.marketplaceCode;
  const adapter = getAdapter(ctx.adapters, marketplaceCode);
  const runStartedAt = ctx.clock.nowMs();

  // Picks up a credential change without waiting for a restart; the guarantee is at
  // worker startup (see `syncMerchantRef`).
  await syncMerchantRef(ctx.appDb, marketplaceCode, adapter.merchantRef, runStartedAt, ctx.correlationId);

  let itemsTotal = 0;
  let itemsOk = 0;
  let itemsFailed = 0;

  try {
    for await (const listing of adapter.fetchListings()) {
      itemsTotal += 1;
      try {
        const parsed = parseStockCode(listing.sellerStockCode);
        const baseStockCode = parsed.ok ? parsed.value.baseCode : null;
        if (!parsed.ok) {
          await eventsRepo.logEvent(ctx.appDb, {
            id: newId(),
            at: runStartedAt,
            level: 'warn',
            marketplaceCode,
            listingId: null,
            jobRunId: ctx.correlationId,
            code: 'UnparseableStockCode',
            message: `Listing ${listing.marketplaceListingId}: seller SKU "${listing.sellerStockCode}" does not parse (doc 07 §2.1) — imported with baseStockCode = null, excluded from repricing`,
            context: JSON.stringify({ marketplaceListingId: listing.marketplaceListingId }),
          });
        }

        const existing = await listingsRepo.findListingByMarketplaceId(
          ctx.appDb,
          marketplaceCode,
          listing.marketplaceListingId,
        );

        await listingsRepo.upsertListing(ctx.appDb, {
          id: existing?.id ?? newId(),
          marketplaceCode,
          marketplaceListingId: listing.marketplaceListingId,
          sellerStockCode: listing.sellerStockCode,
          baseStockCode,
          unitCount: parsed.ok ? parsed.value.unitCount : 1,
          isBundle: parsed.ok ? parsed.value.isBundle : false,
          // doc 05: `product_name` is NOT NULL, but not every marketplace returns one —
          // Hepsiburada's listing service carries no name field at all (api-references §2.4);
          // the name is catalogue data on a different, still-unverified service. An existing
          // name is never overwritten with a stand-in, and on first insert the seller stock
          // code stands in until a product source or the catalogue integration supplies a real
          // one. The adapter does not fabricate it, and this is the only place that decides.
          productName: listing.productName ?? existing?.productName ?? listing.sellerStockCode,
          price: listing.price.toKurus(),
          listPrice: listing.listPrice?.toKurus() ?? null,
          customerPrice: listing.customerPrice?.toKurus() ?? null,
          offeredStock: listing.offeredStock,
          commissionRate: listing.commissionRate,
          vatRate: listing.vatRate,
          dispatchTime: listing.dispatchTime,
          isSalable: listing.isSalable,
          isLocked: listing.isLocked,
          isSuspended: listing.isSuspended,
          // Optional on the port: absent means the marketplace does not report it, which is
          // not the same as false — but the column is NOT NULL, so absence stores as false.
          // Hepsiburada reports it (api-references §2.4); Trendyol has no such flag.
          isFrozen: listing.isFrozen ?? false,
          isArchived: listing.isArchived,
          isBlacklisted: listing.isBlacklisted,
          lockReasons: listing.lockReasons.length > 0 ? JSON.stringify(listing.lockReasons) : null,
          deactivationReasons:
            listing.deactivationReasons.length > 0 ? JSON.stringify(listing.deactivationReasons) : null,
          // Operator-owned fields: only ever meaningful on first insert; upsertListing
          // excludes them from the conflict update, so re-sending defaults here is safe.
          minPrice: null,
          maxPrice: null,
          allowIncrease: true,
          allowDecrease: true,
          // doc 10 §6 step 8: "everything starts DISABLED" — applies to both the pricing
          // engine (repriceEnabled) and buybox/competitor observation (observationEnabled),
          // which are independent operator opt-ins (docs/07 §2.1 vs the ObserveBuybox/
          // ScrapeCompetitors candidate query).
          repriceEnabled: false,
          observationEnabled: false,
          // doc 05 §5: marketplace-specific fields preserved verbatim. Today that is the
          // public product-page reference the reporting scrape needs (doc 07 §7).
          extra: encodeListingExtra(listing.productPage),
          firstSeenAt: existing?.firstSeenAt ?? runStartedAt,
          lastSeenAt: runStartedAt,
          updatedAt: runStartedAt,
        });
        itemsOk += 1;
      } catch (error) {
        itemsFailed += 1;
        await eventsRepo.logEvent(ctx.appDb, {
          id: newId(),
          at: runStartedAt,
          level: 'warn',
          marketplaceCode,
          listingId: null,
          jobRunId: ctx.correlationId,
          code: 'ListingImportFailed',
          message: `Failed to upsert listing ${listing.marketplaceListingId}: ${error instanceof Error ? error.message : String(error)}`,
          context: JSON.stringify({ marketplaceListingId: listing.marketplaceListingId }),
        });
      }
    }
  } catch (error) {
    // A transport/adapter-level failure mid-stream: doc 07 §6 — the stale sweep must NOT run,
    // since we don't know whether the pages we never reached would have kept more listings
    // "seen". Surface the partial result; nothing already upserted is rolled back (each
    // listing's own upsert already committed and is still correctly "seen" as of this run).
    const message = error instanceof Error ? error.message : String(error);
    await eventsRepo.logEvent(ctx.appDb, {
      id: newId(),
      at: runStartedAt,
      level: 'error',
      marketplaceCode,
      listingId: null,
      jobRunId: ctx.correlationId,
      code: 'ImportListingsAborted',
      message: `ImportListings for ${marketplaceCode} aborted mid-run, stale sweep skipped: ${message}`,
      context: null,
    });
    return { itemsTotal, itemsOk, itemsFailed, error: message };
  }

  // Only reached on a fully successful pass (doc 07 §6).
  await listingsRepo.sweepStaleListings(ctx.appDb, marketplaceCode, runStartedAt);

  return { itemsTotal, itemsOk, itemsFailed };
}
