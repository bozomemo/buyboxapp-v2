import { describe, expect, it } from 'vitest';
import {
  chartScale,
  lineSegments,
  lookAnnotations,
  sellerAsOf,
  snapIndex,
  xPercent,
  yPercent,
} from './price-chart-series';

describe('chartScale', () => {
  it('spans every series at once, so the lines stay comparable', () => {
    const scale = chartScale([
      [100n, 200n],
      [50n, null, 400n],
    ])!;
    expect(scale.lo).toBeLessThan(50);
    expect(scale.lo + scale.span).toBeGreaterThan(400);
  });

  it('gives a flat series a usable span instead of dividing by zero', () => {
    const scale = chartScale([[64_990n, 64_990n, 64_990n]])!;
    expect(scale.span).toBeGreaterThan(0);
    const y = yPercent(64_990n, scale);
    expect(Number.isFinite(y)).toBe(true);
    expect(y).toBeCloseTo(50, 5); // dead centre, not off-canvas
  });

  it('returns null when nothing was observed — the caller shows a message, not an empty plot', () => {
    expect(chartScale([[null, null], []])).toBeNull();
  });

  it('handles a window far longer than the argument limit of Math.min(...values)', () => {
    // 200k looks is past the point where spreading into Math.min overflows the call stack.
    const values = Array.from({ length: 200_000 }, (_, i) => BigInt(1000 + (i % 7)));
    const scale = chartScale([values])!;
    expect(scale.lo).toBeLessThan(1000);
    expect(scale.lo + scale.span).toBeGreaterThan(1006);
  });

  it('ignores gaps rather than reading them as zero', () => {
    const withGap = chartScale([[1000n, null, 1010n]])!;
    const without = chartScale([[1000n, 1010n]])!;
    expect(withGap).toEqual(without);
  });
});

describe('lineSegments', () => {
  const scale = { lo: 0, span: 100 };

  it('breaks the line at a missing observation instead of bridging it', () => {
    const segments = lineSegments([10n, 20n, null, 40n, 50n], scale, 100, 100);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toBe('0,90 25,80');
    expect(segments[1]).toBe('75,60 100,50');
  });

  it('drops a run of one — a lone point has no line, the hover marker shows it', () => {
    expect(lineSegments([10n, null, 30n, null, 50n], scale, 100, 100)).toEqual([]);
  });

  it('draws one segment when nothing is missing', () => {
    expect(lineSegments([10n, 20n, 30n], scale, 100, 100)).toHaveLength(1);
  });
});

describe('snapIndex', () => {
  it('snaps to the nearest look and clamps at both ends', () => {
    expect(snapIndex(0, 5)).toBe(0);
    expect(snapIndex(0.5, 5)).toBe(2);
    expect(snapIndex(1, 5)).toBe(4);
    expect(snapIndex(-0.4, 5)).toBe(0); // dragged off the left edge
    expect(snapIndex(1.8, 5)).toBe(4); // and off the right
  });

  it('never returns NaN when the element has no width yet', () => {
    expect(snapIndex(Number.NaN, 5)).toBe(0);
    expect(snapIndex(Number.POSITIVE_INFINITY, 5)).toBe(0);
  });

  it('holds at the only look of a one-point series', () => {
    expect(snapIndex(0.7, 1)).toBe(0);
    expect(xPercent(0, 1)).toBe(0);
  });
});

describe('lookAnnotations (tracked products)', () => {
  const sellers = [
    {
      sellerName: 'Bepanthol',
      points: [
        { observedAt: 100, rank: 1, price: '64990' },
        { observedAt: 200, rank: 2, price: '65990' },
      ],
    },
    {
      sellerName: 'Rakip A',
      points: [
        { observedAt: 100, rank: 2, price: '66000' },
        { observedAt: 200, rank: 1, price: '65000' },
      ],
    },
    { sellerName: '', points: [{ observedAt: 300, rank: 1, price: '64000' }] },
  ];

  it('names the rank-1 seller of each look, and the rank-2 price beside it', () => {
    const { buyboxSeller, secondPrice } = lookAnnotations(sellers);
    expect(buyboxSeller.get(100)).toBe('Bepanthol');
    expect(buyboxSeller.get(200)).toBe('Rakip A'); // the buybox changed hands
    expect(secondPrice.get(100)).toBe(66_000n);
    expect(secondPrice.get(200)).toBe(65_990n);
  });

  it('falls back to (isimsiz) rather than showing an empty seller', () => {
    expect(lookAnnotations(sellers).buyboxSeller.get(300)).toBe('(isimsiz)');
  });

  it('leaves a look with no rank-1 row unattributed instead of guessing', () => {
    const { buyboxSeller } = lookAnnotations([
      { sellerName: 'Rakip A', points: [{ observedAt: 400, rank: 3, price: '1' }] },
    ]);
    expect(buyboxSeller.has(400)).toBe(false);
  });
});

describe('sellerAsOf (listing chart)', () => {
  const rows = [
    { observedAt: 100, sellerName: 'Nestle' },
    { observedAt: 300, sellerName: 'The Olympus' },
  ];

  it('takes the last seller seen at or before the point, never a later one', () => {
    expect(sellerAsOf(rows, 100)?.sellerName).toBe('Nestle');
    expect(sellerAsOf(rows, 299)?.sellerName).toBe('Nestle');
    expect(sellerAsOf(rows, 300)?.sellerName).toBe('The Olympus');
    expect(sellerAsOf(rows, 5_000)?.sellerName).toBe('The Olympus');
  });

  it('leaves a point older than the first scrape unattributed', () => {
    expect(sellerAsOf(rows, 99)).toBeNull();
    expect(sellerAsOf([], 100)).toBeNull();
  });
});
