/**
 * Aligning several brands' daily series onto one time axis (2026-09-03).
 *
 * Each brand is aggregated separately — one `brandDailyTrend` per brand — so each comes back
 * with only the days *it* has data for. A chart needs one shared axis, and the alignment is the
 * whole risk: two brands whose arrays happen to be the same length would draw perfectly and
 * compare the wrong days, with nothing on screen to say so. That failure is silent, which is why
 * this is a separate, tested function rather than four lines inside a component.
 *
 * A day a brand has no point for becomes `null`, which the chart renders as a gap. It is **not**
 * carried forward from the previous day: a missing day means nothing was stored, which since the
 * change detection of Faz 4 usually means nothing moved — but it can equally mean the rotation
 * did not reach that brand, and interpolating would turn "we did not look" into a flat price.
 */

export interface BrandSeriesInput {
  readonly id: string;
  readonly label: string;
  readonly points: readonly { readonly dayMs: number; readonly avgPrice: string | null }[];
}

export interface AlignedSeries {
  /** Every day any brand has a point for, ascending. */
  readonly timestamps: readonly number[];
  readonly brands: readonly {
    readonly id: string;
    readonly label: string;
    /** One value per timestamp, `null` where that brand has no point for that day. */
    readonly values: readonly (bigint | null)[];
  }[];
}

export function alignBrandSeries(series: readonly BrandSeriesInput[]): AlignedSeries {
  const days = new Set<number>();
  for (const brand of series) {
    for (const point of brand.points) days.add(point.dayMs);
  }
  const timestamps = [...days].sort((a, b) => a - b);

  return {
    timestamps,
    brands: series.map((brand) => {
      const byDay = new Map(
        brand.points.map((point) => [point.dayMs, point.avgPrice === null ? null : BigInt(point.avgPrice)]),
      );
      // `?? null` covers both "this brand has no point for that day" and "it had one with no
      // readable price". Both are gaps, and neither is a zero.
      return {
        id: brand.id,
        label: brand.label,
        values: timestamps.map((day) => byDay.get(day) ?? null),
      };
    }),
  };
}

/**
 * Colours for the comparison lines, own brands first.
 *
 * Own and rival are told apart by **position in this list plus the legend**, never by a
 * red/green pairing: neither is a good or a bad thing, and colouring a competitor's brand as an
 * alarm would be a judgement the report is not making.
 */
export const COMPARISON_COLORS: readonly string[] = [
  'var(--color-accent)',
  'var(--color-warning)',
  'var(--color-success)',
  'var(--color-muted)',
];
