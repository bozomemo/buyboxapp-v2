/**
 * How often a tracked product earns another look (2026-09-03).
 *
 * The per-run ceiling turns the deep scrape into a rotation, and until now that rotation was
 * flat: oldest look first, every product equal. On an operator-curated list of forty that was
 * right. On a brand catalogue it spends the budget badly — the live install rotates 300 products
 * an hour, so a 4,863-product brand is a full pass every sixteen hours, and a product nobody
 * sells and nobody has ever rated consumes exactly as much of that budget as the brand's
 * best-selling line with eleven sellers fighting over it.
 *
 * This module decides nothing about *whether* a product is read — every product is still read,
 * and a starved one eventually rises to the top by sheer staleness. It decides only **what
 * counts as due**, by scaling the interval a product waits.
 *
 * Pure, table-tested, and deliberately built from fields the row already carries: the rotation
 * runs over the whole catalogue before the ceiling is applied, so anything requiring a second
 * query per product would cost more than the scheduling it saves.
 */
import type { trackedProductsRepo } from '@buybox/db';

/** The interval a product with nothing special about it waits. One cycle of the scrape job. */
export const ROTATION_BASE_INTERVAL_MS = 60 * 60_000;

/**
 * Multipliers, each attached to a signal the row already carries. They multiply, so a product
 * that is both unsold and unrated waits longest — which is the intended reading: two independent
 * reasons to believe nothing is happening to it.
 */
export const ROTATION_WEIGHTS = {
  /**
   * Nobody was selling it at the last successful look. Checking an empty page hourly buys
   * almost nothing — the interesting event is a *seller appearing*, and a day's delay in
   * noticing that is acceptable where a day's delay on a live price war is not.
   *
   * Emphatically not "never": a product only leaves the rotation by being deactivated, which is
   * a decision a person makes. Coming back is exactly the event worth catching.
   */
  noSellers: 6,
  /**
   * The marketplace has never recorded a rating — the same "nobody buys this" proxy the
   * dead-product suggestion acts on, used here for something far gentler than deactivation. Only
   * a genuine `0` counts; `null` is our own failure to read and earns no penalty.
   */
  neverRated: 3,
  /**
   * The brand published a price for it. That is an operator saying in as many words that this
   * product matters, and a violation of a published price is the one finding on these screens
   * that is actionable on its own — so it is worth seeing sooner.
   */
  hasReferencePrice: 0.5,
} as const;

type Product = trackedProductsRepo.TrackedProductRow;

/** The interval this product waits between looks. Never below the base for a priced product. */
export function rotationIntervalMs(product: Product): number {
  let interval = ROTATION_BASE_INTERVAL_MS;
  if (product.hasSellers === false) interval *= ROTATION_WEIGHTS.noSellers;
  if (product.ratingCount === 0) interval *= ROTATION_WEIGHTS.neverRated;
  if (product.referencePrice !== null && product.referencePrice !== undefined) {
    interval *= ROTATION_WEIGHTS.hasReferencePrice;
  }
  return interval;
}

/**
 * Orders a marketplace's tracked products by how overdue they are, most overdue first.
 *
 * Two properties matter more than the weights, and both are asserted in the tests:
 *
 * - **A product never looked at comes first**, whatever its weight. There is no evidence about
 *   it to weigh, and a rotation that let weights defer an unseen product could leave part of a
 *   freshly swept catalogue unread indefinitely.
 * - **No product can starve.** Overdue-ness is measured in multiples of a product's own
 *   interval, so a deprioritised product's position rises without limit as it waits, and it
 *   overtakes a favoured product that was read recently. Sorting by a fixed weight instead
 *   would let a large enough favoured set hold the head of the queue for ever.
 */
export function byRotationPriority(products: readonly Product[], nowMs: number): Product[] {
  return [...products].sort((a, b) => {
    const aNever = a.lastScrapedAt === null || a.lastScrapedAt === undefined;
    const bNever = b.lastScrapedAt === null || b.lastScrapedAt === undefined;
    if (aNever !== bNever) return aNever ? -1 : 1;
    if (!aNever && !bNever) {
      // How many of its own intervals each has waited. Larger is more overdue.
      const aOverdue = (nowMs - a.lastScrapedAt!) / rotationIntervalMs(a);
      const bOverdue = (nowMs - b.lastScrapedAt!) / rotationIntervalMs(b);
      if (aOverdue !== bOverdue) return bOverdue - aOverdue;
    }
    // Stable tie-break so a catalogue that has never been looked at cannot re-select a different
    // arbitrary subset each run and starve the rest. Ids are UUID v7.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
