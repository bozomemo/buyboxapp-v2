/**
 * Turns a tracked product's raw observation rows — one per offer, per look — into the two series
 * `/tracked-products/[id]` shows: a per-look summary and a per-seller history (doc 06 §12.2's
 * detail-screen entry).
 *
 * Pulled out of the route because every branch here fails *silently*: a seller that withdrew
 * looks identical to one that never existed, a renamed seller splits into two rows that each
 * look complete, and a look with no rank-1 offer produces a plausible chart with a hole in it.
 * None of those throw, so a test is the only thing that notices.
 */

export interface ObservationRow {
  readonly observedAt: number;
  readonly status: 'ok' | 'parseFailed' | 'fetchFailed';
  readonly rank: number | null;
  readonly sellerName: string | null;
  readonly sellerRef: string | null;
  readonly price: bigint | null;
  readonly finalPrice: bigint | null;
  readonly offeredStock: number | null;
}

export interface LookSummary {
  readonly observedAt: number;
  readonly status: string;
  /** Offers seen in this look; `0` on a failed look, which writes one status-only row. */
  readonly offers: number;
  readonly buyboxPrice: bigint | null;
}

export interface SellerPoint {
  readonly observedAt: number;
  readonly rank: number | null;
  readonly price: bigint | null;
  readonly finalPrice: bigint | null;
  readonly offeredStock: number | null;
}

export interface SellerSeries {
  readonly key: string;
  readonly sellerName: string;
  readonly sellerRef: string | null;
  /** The payload carried no seller id, so rows were grouped by name — shown to the operator. */
  readonly unverifiedKey: boolean;
  /** This seller's row in the newest look, or `null` when it no longer offers the product. */
  readonly current: SellerPoint | null;
  readonly previousPrice: bigint | null;
  readonly firstSeenAt: number | null;
  readonly lastSeenAt: number | null;
  readonly points: readonly SellerPoint[];
}

/**
 * Identity within *this one product's own* history. `seller_ref` when the payload gave one; the
 * folded display name only when it did not, and the caller shows that fallback as unverified.
 *
 * This is a display grouping, never an identity claim — the thing `competitor_seller_groups`
 * (doc 05 §5) refuses to infer is *cross-marketplace* sameness from a matching name, which is a
 * decision about who a company is. Two rows of one product's history under one name is not that.
 */
function sellerKey(row: ObservationRow): string {
  return row.sellerRef ?? `name:${(row.sellerName ?? '').trim().toLocaleLowerCase('tr')}`;
}

/** One entry per look, oldest first. Failed looks are kept: "we looked and could not read it". */
export function summariseLooks(rows: readonly ObservationRow[]): LookSummary[] {
  const looks = new Map<
    number,
    { observedAt: number; status: string; offers: number; buyboxPrice: bigint | null }
  >();
  for (const row of rows) {
    const look = looks.get(row.observedAt) ?? {
      observedAt: row.observedAt,
      status: row.status,
      offers: 0,
      buyboxPrice: null,
    };
    if (row.status === 'ok') {
      look.offers += 1;
      if (row.rank === 1) look.buyboxPrice = row.price;
    }
    looks.set(row.observedAt, look);
  }
  return [...looks.values()].sort((a, b) => a.observedAt - b.observedAt);
}

/**
 * One entry per seller seen anywhere in the window, ordered as the table shows them: current
 * offers by rank, then withdrawn sellers by how recently they were last seen.
 *
 * `latestObservedAt` is what decides "current" — passed in rather than re-derived so the sellers
 * table and the look history can never disagree about which look is the newest one.
 */
export function seriesBySeller(
  rows: readonly ObservationRow[],
  latestObservedAt: number | null,
): SellerSeries[] {
  const bySeller = new Map<
    string,
    {
      key: string;
      sellerName: string;
      sellerRef: string | null;
      unverifiedKey: boolean;
      points: SellerPoint[];
    }
  >();

  for (const row of rows) {
    if (row.status !== 'ok') continue;
    const key = sellerKey(row);
    const entry = bySeller.get(key) ?? {
      key,
      sellerName: row.sellerName ?? '',
      sellerRef: row.sellerRef,
      unverifiedKey: row.sellerRef === null,
      points: [],
    };
    // Last name seen wins: a seller that renames itself under a stable `seller_ref` keeps one
    // row rather than appearing twice under two names.
    if (row.sellerName) entry.sellerName = row.sellerName;
    entry.points.push({
      observedAt: row.observedAt,
      rank: row.rank,
      price: row.price,
      finalPrice: row.finalPrice,
      offeredStock: row.offeredStock,
    });
    bySeller.set(key, entry);
  }

  const series = [...bySeller.values()].map((s): SellerSeries => {
    const points = [...s.points].sort((a, b) => a.observedAt - b.observedAt);
    const last = points[points.length - 1];
    const previous = points[points.length - 2];
    return {
      key: s.key,
      sellerName: s.sellerName,
      sellerRef: s.sellerRef,
      unverifiedKey: s.unverifiedKey,
      current: last && last.observedAt === latestObservedAt ? last : null,
      previousPrice: previous?.price ?? null,
      firstSeenAt: points[0]?.observedAt ?? null,
      lastSeenAt: last?.observedAt ?? null,
      points,
    };
  });

  // Current offers by rank; a withdrawn seller keeps its row, below them, most recent first —
  // a competitor leaving the page is information, and dropping the row would hide it.
  return series.sort((a, b) => {
    if (a.current && b.current)
      return (a.current.rank ?? Number.MAX_SAFE_INTEGER) - (b.current.rank ?? Number.MAX_SAFE_INTEGER);
    if (a.current) return -1;
    if (b.current) return 1;
    return (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0);
  });
}
