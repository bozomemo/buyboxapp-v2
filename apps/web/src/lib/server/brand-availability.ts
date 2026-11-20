/**
 * Shelf and stock warnings for every linked card (brand roadmap §6.8) — the "Bulunurluk" section
 * of Alarmlar.
 *
 * Read from the cards' stored state and their last successful look, now; nothing is stored. The
 * judgement is `classifyAvailability` in `packages/core`. A card that has never been read
 * successfully has no row: "we have not looked" is not "nobody sells it".
 *
 * Reporting only, like the rest of the brand module.
 */
import { classifyAvailability, LOW_STOCK_THRESHOLD, resolveSellerPolicy, type AvailabilityIssue } from '@buybox/core';
import { brandQueuesRepo, competitorSellersRepo, sellerPoliciesRepo, trackedProductsRepo, type AppDatabase } from '@buybox/db';
import { toSellerPolicyRules } from '@/lib/server/seller-policy-rules';

export interface AvailabilityRow {
  trackedProductId: string;
  cardLabel: string;
  cardUrl: string;
  marketplaceCode: string;
  brandProductId: string;
  brandProductName: string;
  unitMultiplier: number;
  issue: AvailabilityIssue;
  ratingCount: number | null;
  lastScrapedAt: number | null;
  /** When a seller was last seen on the card — for `noSellers`, how long the shelf is empty. */
  lastSellerSeenAt: number | null;
  buyboxSeller: string | null;
  /** The buybox offer's stock as the marketplace displays it. */
  offeredStock: number | null;
  /** Sellers on the last look — for `onlyUnauthorised`, who is selling. */
  sellerCount: number;
}

const ISSUE_ORDER: Record<AvailabilityIssue, number> = { noSellers: 0, onlyUnauthorised: 1, lowStock: 2 };

export async function brandAvailability(appDb: AppDatabase): Promise<AvailabilityRow[]> {
  const cards = (await brandQueuesRepo.linkedCardsForAvailability(appDb)).filter((card) => card.hasSellers !== null);
  if (cards.length === 0) return [];

  const groupIds = [...new Set(cards.flatMap((c) => (c.watchedBrandGroupId === null ? [] : [c.watchedBrandGroupId])))];
  const [latest, policyRows, sellers] = await Promise.all([
    trackedProductsRepo.latestTrackedProductObservationsFor(
      appDb,
      cards.filter((c) => c.hasSellers === true).map((c) => c.trackedProductId),
    ),
    Promise.all(groupIds.map((id) => sellerPoliciesRepo.listSellerPolicies(appDb, { watchedBrandGroupId: id }))),
    groupIds.length === 0 ? Promise.resolve([]) : competitorSellersRepo.listCompetitorSellers(appDb),
  ]);
  const rules = toSellerPolicyRules(policyRows.flat());
  const taxNumbers = new Map(sellers.map((s) => [`${s.marketplaceCode}::${s.sellerRef}`, s.taxNumber]));

  const rows: AvailabilityRow[] = [];
  for (const card of cards) {
    const offers = (latest.get(card.trackedProductId) ?? []).filter((o) => o.status === 'ok');
    const scope =
      card.watchedBrandId !== null && card.watchedBrandGroupId !== null
        ? { watchedBrandId: card.watchedBrandId, watchedBrandGroupId: card.watchedBrandGroupId }
        : null;
    // An authorised rule must be in force for this brand before "nobody authorised" means anything.
    const policyInForce =
      scope !== null &&
      rules.some(
        (r) =>
          r.status === 'authorised' &&
          r.watchedBrandGroupId === scope.watchedBrandGroupId &&
          (r.watchedBrandId === null || r.watchedBrandId === scope.watchedBrandId),
      );
    const issues = classifyAvailability({
      hasSellers: card.hasSellers,
      policyInForce,
      lowStockThreshold: LOW_STOCK_THRESHOLD,
      offers: offers.map((o) => ({
        rank: o.rank,
        offeredStock: o.offeredStock,
        verdict:
          scope === null || o.sellerRef === null
            ? null
            : resolveSellerPolicy(
                rules,
                {
                  marketplaceCode: card.marketplaceCode,
                  sellerRef: o.sellerRef,
                  taxNumber: taxNumbers.get(`${card.marketplaceCode}::${o.sellerRef}`) ?? null,
                },
                scope,
              ).verdict,
      })),
    });
    const buybox = offers.find((o) => o.rank === 1) ?? null;
    for (const issue of issues) {
      rows.push({
        trackedProductId: card.trackedProductId,
        cardLabel: card.label,
        cardUrl: card.productUrl,
        marketplaceCode: card.marketplaceCode,
        brandProductId: card.brandProductId,
        brandProductName: card.brandProductName,
        unitMultiplier: card.unitMultiplier,
        issue,
        ratingCount: card.ratingCount,
        lastScrapedAt: card.lastScrapedAt,
        lastSellerSeenAt: card.lastSellerSeenAt,
        buyboxSeller: buybox?.sellerName ?? null,
        offeredStock: buybox?.offeredStock ?? null,
        sellerCount: offers.length,
      });
    }
  }
  // By issue, then the most reviewed (best-selling) card first: an empty shelf on a top seller
  // costs most.
  return rows.sort(
    (a, b) =>
      ISSUE_ORDER[a.issue] - ISSUE_ORDER[b.issue] ||
      (b.ratingCount ?? -1) - (a.ratingCount ?? -1) ||
      a.cardLabel.localeCompare(b.cardLabel, 'tr'),
  );
}
