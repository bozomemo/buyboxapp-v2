import { describe, expect, it } from 'vitest';
import { EMPTY_MARKET, marketSnapshot, type OfferLike } from './market-stats';

function offer(price: number | null, overrides: Partial<OfferLike> = {}): OfferLike {
  return {
    status: 'ok',
    rank: null,
    sellerName: 'Satıcı',
    price: price === null ? null : String(price),
    ...overrides,
  };
}

describe('marketSnapshot', () => {
  it('summarises a look', () => {
    const m = marketSnapshot([
      offer(150_00, { rank: 3, sellerName: 'C' }),
      offer(90_00, { rank: 2, sellerName: 'A' }),
      offer(120_00, { rank: 1, sellerName: 'B' }),
    ]);
    expect(m.sellerCount).toBe(3);
    expect(m.minPrice).toBe(90_00n);
    expect(m.medianPrice).toBe(120_00n);
    expect(m.maxPrice).toBe(150_00n);
    expect(m.spreadPct).toBeCloseTo((60 / 90) * 100, 6);
  });

  it('reads the buybox off the rank, not off the price', () => {
    // The distinction the whole brand audit rests on: rank 1 is who wins the buybox, which is
    // not who is cheapest. A snapshot that reported the minimum as the buybox price would make
    // "sells below the buybox" impossible to see.
    const m = marketSnapshot([
      offer(90_00, { rank: 2, sellerName: 'Ucuzcu' }),
      offer(120_00, { rank: 1, sellerName: 'Yetkili Bayi' }),
    ]);
    expect(m.buyboxPrice).toBe(120_00n);
    expect(m.buyboxSeller).toBe('Yetkili Bayi');
    expect(m.minPrice).toBe(90_00n);
  });

  it('averages the two middle prices on an even count, in whole kuruş', () => {
    const m = marketSnapshot([offer(100), offer(101), offer(200), offer(300)]);
    // (101 + 200) / 2 = 150.5 → 151. Money is an integer number of kuruş at every layer.
    expect(m.medianPrice).toBe(151n);
    expect(typeof m.medianPrice).toBe('bigint');
  });

  it('leaves the spread unset for a market of one', () => {
    // `null`, not 0: a sole seller has no spread, and reporting zero would file it beside
    // genuinely tight markets when someone sorts by the column.
    const m = marketSnapshot([offer(120_00, { rank: 1 })]);
    expect(m.spreadPct).toBeNull();
    expect(m.sellerCount).toBe(1);
  });

  it('ignores offers with no price and looks that failed', () => {
    const m = marketSnapshot([
      offer(100_00, { rank: 1 }),
      offer(null, { rank: 2 }),
      offer(1_00, { status: 'fetchFailed' }),
    ]);
    expect(m.sellerCount).toBe(1);
    expect(m.minPrice).toBe(100_00n);
  });

  it('says nothing rather than something wrong when there is nothing to read', () => {
    expect(marketSnapshot([])).toEqual(EMPTY_MARKET);
    expect(marketSnapshot([offer(null, { status: 'parseFailed' })])).toEqual(EMPTY_MARKET);
  });

  it('does not divide by a zero price', () => {
    const m = marketSnapshot([offer(0), offer(100_00)]);
    expect(m.spreadPct).toBeNull();
    expect(m.minPrice).toBe(0n);
  });

  it('sorts numerically, not lexicographically', () => {
    // `[9_00, 10_00]` sorts the wrong way as strings, and the prices arrive as strings.
    const m = marketSnapshot([offer(10_00), offer(9_00)]);
    expect(m.minPrice).toBe(9_00n);
    expect(m.maxPrice).toBe(10_00n);
  });

  it('handles kuruş beyond a safe JS integer', () => {
    // Money is `bigint` for this reason; the module must never route a price through `number`.
    const big = 9_007_199_254_740_993n; // 2^53 + 1
    const m = marketSnapshot([{ ...offer(0), price: String(big) }, offer(100)]);
    expect(m.maxPrice).toBe(big);
  });
});
