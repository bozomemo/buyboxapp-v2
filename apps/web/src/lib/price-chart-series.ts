/**
 * The price chart's arithmetic, kept out of the component so it can be tested (the repo has no
 * DOM test setup; a chart bug that only shows as a wrong pixel is exactly the kind that ships).
 *
 * Every function here is pure and takes `bigint` kuruş — the chart converts to `number` only to
 * compute a *position*, never a value it shows, and the money it prints goes through
 * `formatMoney` unconverted.
 */

/** A value per look; `null` means "no observation at this look" — a gap, never a zero. */
export type SeriesValues = readonly (bigint | null)[];

export interface ChartScale {
  /** Kuruş at the bottom of the plot. */
  readonly lo: number;
  /** Kuruş between the bottom and the top; never zero, so a flat series still divides. */
  readonly span: number;
}

/**
 * The vertical scale, over every series at once so they stay comparable, with 8% headroom.
 *
 * Two failure modes it exists to avoid: a flat series (`span` 0) dividing to `Infinity` and
 * leaving the line off-canvas, and `Math.min(...values)` on a long window — a 30-day window at
 * one look per minute is 43,200 arguments, which overflows the call stack rather than returning
 * a wrong answer. Both were live in the sparkline this replaced.
 */
export function chartScale(series: readonly SeriesValues[]): ChartScale | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let seen = 0;
  for (const values of series) {
    for (const value of values) {
      if (value === null) continue;
      const n = Number(value);
      if (n < min) min = n;
      if (n > max) max = n;
      seen += 1;
    }
  }
  if (seen === 0) return null;
  const pad = Math.max(1, (max - min) * 0.08);
  return { lo: min - pad, span: Math.max(1, max + pad - (min - pad)) };
}

/** Vertical position of a value, 0 at the top of the plot and 100 at the bottom. */
export function yPercent(value: bigint, scale: ChartScale): number {
  return 100 - ((Number(value) - scale.lo) / scale.span) * 100;
}

/** Horizontal position of look `index` of `count`, in percent. */
export function xPercent(index: number, count: number): number {
  return count < 2 ? 0 : (index / (count - 1)) * 100;
}

/**
 * The polyline `points` strings for one series, in the chart's own viewBox coordinates — one
 * string per unbroken run. A missing observation ends the run instead of being bridged: a failed
 * scrape must not be drawn as a straight line through the hours it did not see.
 *
 * A run of one point yields no string: a lone point has no line, and the marker drawn on hover
 * is what shows it.
 */
export function lineSegments(
  values: SeriesValues,
  scale: ChartScale,
  width: number,
  height: number,
): string[] {
  const segments: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length > 1) segments.push(run.join(' '));
    run = [];
  };
  values.forEach((value, i) => {
    if (value === null) {
      flush();
      return;
    }
    const x = (xPercent(i, values.length) / 100) * width;
    const y = (yPercent(value, scale) / 100) * height;
    run.push(`${x},${y}`);
  });
  flush();
  return segments;
}

/**
 * Which look a pointer at `ratio` (0 = left edge, 1 = right edge) is nearest to. Clamped, so a
 * drag that leaves the plot holds the end look rather than reading past the end of the array.
 */
export function snapIndex(ratio: number, count: number): number {
  if (count < 1) return 0;
  if (!Number.isFinite(ratio)) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(ratio * (count - 1))));
}

export interface LookSellerRow {
  readonly observedAt: number;
  readonly rank: number | null;
  readonly price: string | null;
}

/**
 * Buybox seller and runner-up price per look, for the tracked-product chart's hover readout.
 *
 * The join is on `observedAt` **exactly**, not on nearest: the looks and the seller series are
 * built from the same observation rows (`summariseLooks` / `seriesBySeller`), so equal timestamps
 * are guaranteed, and a fuzzy join here would silently name a seller for a look they were not in.
 * A look with no rank-1 row — a failed one, or one whose payload had no buybox — is left out, and
 * the caller shows `—`.
 */
export function lookAnnotations(
  sellers: readonly { sellerName: string; points: readonly LookSellerRow[] }[],
): { buyboxSeller: Map<number, string>; secondPrice: Map<number, bigint> } {
  const buyboxSeller = new Map<number, string>();
  const secondPrice = new Map<number, bigint>();
  for (const seller of sellers) {
    for (const point of seller.points) {
      if (point.rank === 1) buyboxSeller.set(point.observedAt, seller.sellerName || '(isimsiz)');
      if (point.rank === 2 && point.price !== null) secondPrice.set(point.observedAt, BigInt(point.price));
    }
  }
  return { buyboxSeller, secondPrice };
}

/**
 * The rank-1 seller in effect at `observedAt` — the last one seen **at or before** it.
 *
 * The listing chart needs this rather than an exact join, because its two series come from
 * different tables written by different jobs (`buybox_observations` from the API poll,
 * `competitor_observations` from the scrape) whose timestamps do not coincide. Never a later
 * seller: that would credit a price to whoever took the buybox afterwards. A point older than the
 * first scrape stays unattributed rather than borrowing the nearest name.
 *
 * `rows` must be ordered oldest-first, as both repository queries return them.
 */
export function sellerAsOf<T extends { observedAt: number }>(
  rows: readonly T[],
  observedAt: number,
): T | null {
  let match: T | null = null;
  for (const row of rows) {
    if (row.observedAt > observedAt) break;
    match = row;
  }
  return match;
}
