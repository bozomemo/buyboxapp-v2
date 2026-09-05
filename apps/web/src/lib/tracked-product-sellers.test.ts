/**
 * Table-driven, because none of the shaping here can fail loudly: a withdrawn seller, a renamed
 * one and a failed look all produce a screen that looks perfectly reasonable while being wrong.
 */
import { describe, expect, it } from 'vitest';
import { type ObservationRow, seriesBySeller, summariseLooks } from './tracked-product-sellers';

const T1 = 1_000;
const T2 = 2_000;
const T3 = 3_000;

function offer(partial: Partial<ObservationRow> & { observedAt: number }): ObservationRow {
  return {
    status: 'ok',
    rank: 1,
    sellerName: 'A Satıcı',
    sellerRef: 'ref-a',
    price: 10_000n,
    finalPrice: 10_000n,
    offeredStock: 5,
    ...partial,
  };
}

describe('summariseLooks', () => {
  it('groups offers by look, oldest first, and takes the buybox price off the rank-1 offer', () => {
    const looks = summariseLooks([
      offer({ observedAt: T2, rank: 1, price: 9_000n }),
      offer({ observedAt: T2, rank: 2, price: 9_500n, sellerRef: 'ref-b' }),
      offer({ observedAt: T1, rank: 1, price: 10_000n }),
    ]);
    expect(looks.map((l) => [l.observedAt, l.offers, l.buyboxPrice])).toEqual([
      [T1, 1, 10_000n],
      [T2, 2, 9_000n],
    ]);
  });

  it('keeps a failed look, with no offers and no price — a look that could not be read is not a look that did not happen', () => {
    const looks = summariseLooks([
      offer({ observedAt: T1 }),
      offer({
        observedAt: T2,
        status: 'fetchFailed',
        rank: null,
        sellerName: null,
        sellerRef: null,
        price: null,
      }),
    ]);
    expect(looks[1]).toEqual({ observedAt: T2, status: 'fetchFailed', offers: 0, buyboxPrice: null });
  });

  it('leaves the buybox price null when no offer in the look was rank 1', () => {
    expect(summariseLooks([offer({ observedAt: T1, rank: 2 })])[0]!.buyboxPrice).toBeNull();
  });
});

describe('seriesBySeller', () => {
  it('collects one series per seller_ref and reports the newest look as `current`', () => {
    const series = seriesBySeller(
      [offer({ observedAt: T1, price: 10_000n }), offer({ observedAt: T2, price: 9_000n, offeredStock: 3 })],
      T2,
    );
    expect(series).toHaveLength(1);
    expect(series[0]!.current).toMatchObject({ observedAt: T2, price: 9_000n, offeredStock: 3 });
    expect(series[0]!.previousPrice).toBe(10_000n);
    expect(series[0]!.firstSeenAt).toBe(T1);
  });

  it('keeps a seller that withdrew, with a null `current` — dropping the row would hide the withdrawal', () => {
    const series = seriesBySeller(
      [
        offer({ observedAt: T1, sellerRef: 'ref-a', rank: 1 }),
        offer({ observedAt: T1, sellerRef: 'ref-b', sellerName: 'B Satıcı', rank: 2 }),
        offer({ observedAt: T2, sellerRef: 'ref-a', rank: 1 }),
      ],
      T2,
    );
    const gone = series.find((s) => s.sellerRef === 'ref-b')!;
    expect(gone.current).toBeNull();
    expect(gone.lastSeenAt).toBe(T1);
  });

  it('orders current offers by rank, then withdrawn sellers most-recently-seen first', () => {
    const series = seriesBySeller(
      [
        offer({ observedAt: T1, sellerRef: 'old-1', sellerName: 'Eski 1' }),
        offer({ observedAt: T2, sellerRef: 'old-2', sellerName: 'Eski 2' }),
        offer({ observedAt: T3, sellerRef: 'now-2', sellerName: 'Şimdi 2', rank: 2 }),
        offer({ observedAt: T3, sellerRef: 'now-1', sellerName: 'Şimdi 1', rank: 1 }),
      ],
      T3,
    );
    expect(series.map((s) => s.sellerRef)).toEqual(['now-1', 'now-2', 'old-2', 'old-1']);
  });

  it('keeps a renamed seller as one row under a stable seller_ref, showing the latest name', () => {
    const series = seriesBySeller(
      [
        offer({ observedAt: T1, sellerName: 'Eski Ünvan' }),
        offer({ observedAt: T2, sellerName: 'Yeni Ünvan' }),
      ],
      T2,
    );
    expect(series).toHaveLength(1);
    expect(series[0]!.sellerName).toBe('Yeni Ünvan');
    expect(series[0]!.unverifiedKey).toBe(false);
  });

  it('falls back to the folded name when the payload carried no seller id, and says so', () => {
    const series = seriesBySeller(
      [
        offer({ observedAt: T1, sellerRef: null, sellerName: 'ILIK Ticaret' }),
        offer({ observedAt: T2, sellerRef: null, sellerName: 'ılık ticaret' }),
      ],
      T2,
    );
    expect(series).toHaveLength(1);
    expect(series[0]!.unverifiedKey).toBe(true);
  });

  it('excludes failed looks from every series — a failure is not an offer of null', () => {
    const series = seriesBySeller(
      [
        offer({ observedAt: T1, price: 10_000n }),
        offer({
          observedAt: T2,
          status: 'parseFailed',
          rank: null,
          sellerName: null,
          sellerRef: null,
          price: null,
        }),
      ],
      T2,
    );
    expect(series[0]!.points).toHaveLength(1);
    // The newest look failed, so nobody has a current offer — not "everyone is at null".
    expect(series[0]!.current).toBeNull();
  });
});

/**
 * 2026-09-03. The offer's seller score, dispatch time and promotion now reach this layer. The
 * failure mode worth pinning is the quiet one: a row stored before the columns existed carries
 * `undefined`, and a screen that read that as `false` would tell an auditor a seller ran no
 * promotion on a look that never recorded whether it did.
 */
describe('the rest of the offer', () => {
  it('carries seller score, dispatch time and promotion onto each point', () => {
    const series = seriesBySeller(
      [
        offer({
          observedAt: T1,
          sellerRating: 8.4,
          dispatchTime: 2,
          hasPromotion: true,
          promotionText: 'Sepette %10',
        }),
      ],
      T1,
    );
    expect(series[0]!.current).toMatchObject({
      sellerRating: 8.4,
      dispatchTime: 2,
      hasPromotion: true,
      promotionText: 'Sepette %10',
    });
  });

  it('reads a row written before the columns existed as unknown, never as "no promotion"', () => {
    const series = seriesBySeller([offer({ observedAt: T1 })], T1);
    expect(series[0]!.current).toMatchObject({
      sellerRating: null,
      dispatchTime: null,
      hasPromotion: null,
      promotionText: null,
    });
  });
});
