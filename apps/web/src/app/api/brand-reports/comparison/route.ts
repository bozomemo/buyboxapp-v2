/**
 * Brand price comparison — ours against a competitor's (2026-09-03).
 *
 * The brand module already sweeps any brand and reads every seller on every one of its products.
 * Pointed at a rival, the same machinery answers a question it was never asked: *what does that
 * brand charge, and how does ours sit against it.* The only thing that was missing is the
 * intent — `watched_brands.is_own_brand` — and this report.
 *
 * ## What the index is, exactly
 *
 * `indexPct` is our brand's mean offer price as a percentage of the baseline brand's, over the
 * same window and the same archive. 112 means our brand's offers average 12% above theirs.
 *
 * **It is not a like-for-like price comparison and the screen says so.** Two brands are not two
 * versions of one product: pack sizes differ, the mix differs, and a brand with more premium
 * lines will index high while being cheaper on every comparable item. What the figure tracks
 * honestly is *movement* — the index over time says whether the gap is widening or closing,
 * which is the question a brand manager actually brings to it.
 *
 * A per-product comparison would be the like-for-like answer, and it needs the barcode join the
 * cross-marketplace screen uses (doc 06 §12.4 Faz 8). Two brands rarely share a barcode, so that
 * is not a matter of writing the query — it is a different feature, and pretending this one is
 * that one is the misreading worth spending a paragraph to prevent.
 */
import { NextResponse } from 'next/server';
import { brandReportsRepo, watchedBrandsRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** One brand's series, plus the one number a header can carry. */
interface BrandSeries {
  readonly id: string;
  readonly label: string;
  readonly marketplaceCode: string;
  readonly isOwnBrand: boolean;
  readonly points: {
    readonly dayMs: number;
    readonly avgPrice: string | null;
    readonly sellerCount: number;
    readonly productsWithOffers: number;
  }[];
  /** Mean of the daily means over the window, kuruş as a string. `null` with no priced day. */
  readonly windowAvgPrice: string | null;
}

/**
 * The window's average, as the mean of the daily means rather than of every offer.
 *
 * Deliberate: a day on which one volatile product was re-scraped forty times would otherwise
 * dominate a month, and the daily bucket is what the trend already renders. Each day counts
 * once, which is what makes the number and the chart above it agree.
 */
function windowAverage(points: readonly { avgPrice: bigint | null }[]): bigint | null {
  const priced = points.flatMap((p) => (p.avgPrice === null ? [] : [p.avgPrice]));
  if (priced.length === 0) return null;
  const total = priced.reduce((sum, value) => sum + value, 0n);
  return total / BigInt(priced.length);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const appDb = getAppDb();
  const nowMs = Date.now();

  const untilMs = params.get('untilMs') ? Number(params.get('untilMs')) : nowMs;
  const sinceMs = params.get('sinceMs') ? Number(params.get('sinceMs')) : untilMs - DEFAULT_WINDOW_MS;

  const brands = await watchedBrandsRepo.listWatchedBrands(appDb);
  const requested = params.getAll('watchedBrandId');

  /**
   * Which brands to chart. With none named, every watched brand — the comparison is the point,
   * and an operator arriving here wants to see the shape before picking. Capped, because each
   * brand is its own aggregate query and a screen that renders twenty lines is unreadable anyway.
   */
  const selected = (requested.length > 0 ? brands.filter((b) => requested.includes(b.id)) : brands).slice(
    0,
    8,
  );

  const series: BrandSeries[] = await Promise.all(
    selected.map(async (brand) => {
      const points = await brandReportsRepo.brandDailyTrend(appDb, {
        sinceMs,
        untilMs,
        marketplaceCode: brand.marketplaceCode,
        watchedBrandIds: [brand.id],
      });
      return {
        id: brand.id,
        label: brand.label,
        marketplaceCode: brand.marketplaceCode,
        isOwnBrand: brand.isOwnBrand ?? true,
        points: points.map((p) => ({
          dayMs: p.dayMs,
          avgPrice: p.avgPrice?.toString() ?? null,
          sellerCount: p.sellerCount,
          productsWithOffers: p.productsWithOffers,
        })),
        windowAvgPrice: windowAverage(points)?.toString() ?? null,
      };
    }),
  );

  /**
   * The index, computed against the first competitor brand in the selection.
   *
   * `null` whenever there is nothing to divide by — no rival selected, or either side with no
   * priced day in the window. A `100` in that case would read as parity, which is the one wrong
   * answer that looks like a right one.
   */
  const baseline = series.find((s) => !s.isOwnBrand) ?? null;
  const index =
    baseline === null || baseline.windowAvgPrice === null
      ? null
      : {
          baselineBrandId: baseline.id,
          baselineLabel: baseline.label,
          brands: series
            .filter((s) => s.isOwnBrand && s.windowAvgPrice !== null)
            .map((s) => ({
              id: s.id,
              label: s.label,
              // Exact kuruş arithmetic scaled to two decimals, never a float division of prices.
              indexPct:
                Number((BigInt(s.windowAvgPrice!) * 10_000n) / BigInt(baseline.windowAvgPrice!)) / 100,
            })),
        };

  return NextResponse.json({
    window: { sinceMs, untilMs },
    brands: brands.map((b) => ({
      id: b.id,
      label: b.label,
      marketplaceCode: b.marketplaceCode,
      isOwnBrand: b.isOwnBrand ?? true,
    })),
    series,
    index,
    /** No rival brand watched at all — the screen explains rather than showing an empty index. */
    hasCompetitorBrand: brands.some((b) => (b.isOwnBrand ?? true) === false),
  });
}
