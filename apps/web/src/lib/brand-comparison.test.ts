/**
 * The alignment failure this exists to prevent is silent: two brands with equal-length arrays
 * draw a perfect chart while comparing different days, and nothing on screen says so.
 */
import { describe, expect, it } from 'vitest';
import { alignBrandSeries } from './brand-comparison';

const DAY = 24 * 60 * 60 * 1000;
const D1 = Date.UTC(2026, 8, 1);
const D2 = D1 + DAY;
const D3 = D1 + 2 * DAY;

describe('alignBrandSeries', () => {
  it('puts every brand on one ascending axis of every day any of them has', () => {
    const aligned = alignBrandSeries([
      {
        id: 'a',
        label: 'Bizim',
        points: [
          { dayMs: D3, avgPrice: '300' },
          { dayMs: D1, avgPrice: '100' },
        ],
      },
      { id: 'b', label: 'Rakip', points: [{ dayMs: D2, avgPrice: '200' }] },
    ]);

    expect(aligned.timestamps).toEqual([D1, D2, D3]);
    expect(aligned.brands[0]!.values).toEqual([100n, null, 300n]);
    expect(aligned.brands[1]!.values).toEqual([null, 200n, null]);
  });

  /**
   * The one that would have drawn a plausible, wrong chart: equal lengths, different days.
   * Without alignment brand B's single point would have been plotted against brand A's first.
   */
  it('never lines up two brands by position when their days differ', () => {
    const aligned = alignBrandSeries([
      { id: 'a', label: 'Bizim', points: [{ dayMs: D1, avgPrice: '100' }] },
      { id: 'b', label: 'Rakip', points: [{ dayMs: D3, avgPrice: '300' }] },
    ]);

    expect(aligned.timestamps).toEqual([D1, D3]);
    expect(aligned.brands[0]!.values).toEqual([100n, null]);
    expect(aligned.brands[1]!.values).toEqual([null, 300n]);
  });

  it('leaves a day with no readable price as a gap, never as a zero', () => {
    const aligned = alignBrandSeries([{ id: 'a', label: 'Bizim', points: [{ dayMs: D1, avgPrice: null }] }]);
    expect(aligned.brands[0]!.values).toEqual([null]);
  });

  it('does not carry a price forward into a day the brand has no point for', () => {
    // A missing day usually means nothing moved — but it can equally mean the rotation did not
    // reach that brand, and a flat line would state a price nobody observed.
    const aligned = alignBrandSeries([
      {
        id: 'a',
        label: 'Bizim',
        points: [
          { dayMs: D1, avgPrice: '100' },
          { dayMs: D3, avgPrice: '100' },
        ],
      },
      { id: 'b', label: 'Rakip', points: [{ dayMs: D2, avgPrice: '200' }] },
    ]);
    expect(aligned.brands[0]!.values).toEqual([100n, null, 100n]);
  });

  it('handles a brand with no points at all', () => {
    const aligned = alignBrandSeries([
      { id: 'a', label: 'Bizim', points: [{ dayMs: D1, avgPrice: '100' }] },
      { id: 'b', label: 'Rakip', points: [] },
    ]);
    expect(aligned.brands[1]!.values).toEqual([null]);
  });

  it('returns an empty axis for an empty selection', () => {
    expect(alignBrandSeries([])).toEqual({ timestamps: [], brands: [] });
  });
});
