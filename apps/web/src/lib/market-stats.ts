/**
 * The market as one look saw it: how many sellers, what they charged, how far apart they were
 * (doc 06 §12.4, Faz 4).
 *
 * Pure, and computed here rather than in SQL on purpose. A **median** has no exact form that is
 * portable across SQLite, PostgreSQL and MySQL, and three dialect-specific window-function
 * queries for one number is a worse risk than computing it where the data already is. It can
 * live here because the input is bounded by construction: one look at one product is every
 * offer the page showed, a few dozen rows at most, and the grid asks for one page of products
 * at a time. The *period* figures — the band across a whole window — genuinely cannot be
 * computed this way and are aggregated in the database (`brand-reports.ts`).
 *
 * Money stays `bigint` kuruş throughout; only the percentage is a `number`, because a
 * percentage is not money.
 */

/** The subset of an observation this module reads. Mirrors the API's per-look offer shape. */
export interface OfferLike {
  readonly status: string;
  readonly rank: number | null;
  readonly sellerName: string | null;
  /** Kuruş as a decimal string — how `bigint` crosses the JSON boundary. */
  readonly price: string | null;
}

export interface MarketSnapshot {
  /** Offers with a price in the latest look. Not distinct sellers: one look lists each once. */
  readonly sellerCount: number;
  readonly minPrice: bigint | null;
  readonly medianPrice: bigint | null;
  readonly maxPrice: bigint | null;
  /**
   * How far the dearest offer sits above the cheapest, in percent of the cheapest.
   *
   * `null` for a single-seller product — a market of one has no spread, and reporting `0` would
   * put it beside genuinely tight markets in a sort. Measured against the minimum rather than
   * the median so that the figure keeps the plain reading "the top is X% above the bottom".
   */
  readonly spreadPct: number | null;
  readonly buyboxPrice: bigint | null;
  readonly buyboxSeller: string | null;
}

export const EMPTY_MARKET: MarketSnapshot = {
  sellerCount: 0,
  minPrice: null,
  medianPrice: null,
  maxPrice: null,
  spreadPct: null,
  buyboxPrice: null,
  buyboxSeller: null,
};

/**
 * The middle of a sorted price list.
 *
 * An even count averages the two middle values and **rounds half up in kuruş** rather than
 * returning a fraction: the result is money, and money in this system is an integer number of
 * kuruş at every layer. Rounding up rather than truncating keeps the median of `[100, 101]`
 * at 101 rather than 100 — either is defensible, and the point is that it is one fixed rule
 * instead of whatever integer division happened to do.
 */
function median(sorted: readonly bigint[]): bigint | null {
  if (sorted.length === 0) return null;
  const mid = sorted.length >> 1;
  if (sorted.length % 2 === 1) return sorted[mid]!;
  const sum = sorted[mid - 1]! + sorted[mid]!;
  return sum / 2n + (sum % 2n === 0n ? 0n : 1n);
}

/**
 * Reduces one look's offers to the row a grid shows.
 *
 * A failed look yields `EMPTY_MARKET`: its rows are a status, not offers. So does a look whose
 * offers all lack a price — an empty market and an unreadable one both mean "we cannot say",
 * and saying nothing is the honest rendering of both.
 */
export function marketSnapshot(offers: readonly OfferLike[]): MarketSnapshot {
  const priced = offers.filter((o) => o.status === 'ok' && o.price !== null);
  if (priced.length === 0) return EMPTY_MARKET;

  const prices = priced.map((o) => BigInt(o.price!)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const minPrice = prices[0]!;
  const maxPrice = prices[prices.length - 1]!;

  // Guarded against a zero minimum, which the marketplace should never report and which would
  // otherwise divide by zero and render as `Infinity%`.
  const spreadPct =
    prices.length < 2 || minPrice <= 0n
      ? null
      : (Number(maxPrice - minPrice) / Number(minPrice)) * 100;

  const buybox = priced.find((o) => o.rank === 1);

  return {
    sellerCount: priced.length,
    minPrice,
    medianPrice: median(prices),
    maxPrice,
    spreadPct,
    // The buybox holder is whoever the page ranked first, which is **not** whoever is cheapest:
    // the marketplace weighs delivery and seller score too. Reading it off the rank rather than
    // off the price is what keeps "who wins" and "who is cheapest" separate findings.
    buyboxPrice: buybox ? BigInt(buybox.price!) : null,
    buyboxSeller: buybox?.sellerName ?? null,
  };
}
