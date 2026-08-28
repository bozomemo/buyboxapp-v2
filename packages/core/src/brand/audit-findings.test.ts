import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AUDIT_THRESHOLDS,
  deriveAuditFindings,
  type AuditFinding,
  type AuditInput,
  type AuditProductFacts,
  type AuditSellerFacts,
  type AuditThresholds,
} from './audit-findings.js';

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function seller(over: Partial<AuditSellerFacts> = {}): AuditSellerFacts {
  return {
    marketplaceCode: 'trendyol',
    sellerRef: '111',
    sellerName: 'Bir Mağaza',
    verdict: 'undefined',
    productCount: 5,
    observationCount: 20,
    cheapestCount: 0,
    avgDeviationPct: 0,
    firstSeenAt: NOW - 90 * DAY,
    lastSeenAt: NOW,
    worstProduct: null,
    avgDeviationPctExcludingWorst: null,
    ...over,
  };
}

function product(over: Partial<AuditProductFacts> = {}): AuditProductFacts {
  return {
    trackedProductId: 'p1',
    label: 'Whiskas Ton Balıklı 85g',
    categoryRef: 'cat-kedi-mamasi',
    categoryName: 'Kedi Maması',
    viaBrandRef: true,
    viaSearchTerm: true,
    ...over,
  };
}

function input(over: Partial<AuditInput> = {}): AuditInput {
  return {
    thresholds: DEFAULT_AUDIT_THRESHOLDS,
    sellers: [],
    products: [],
    categoryProductCounts: new Map([['cat-kedi-mamasi', 400]]),
    totalProductCount: 500,
    hasAuthorisedList: false,
    nowMs: NOW,
    ...over,
  };
}

const kinds = (findings: readonly AuditFinding[]): string[] => findings.map((f) => f.kind);

describe('stated findings', () => {
  it('raises a blocked seller who is selling', () => {
    const found = deriveAuditFindings(input({ sellers: [seller({ verdict: 'blocked' })] }));
    expect(kinds(found)).toEqual(['blockedSellerPresent']);
    expect(found[0]!.basis).toBe('stated');
    expect(found[0]!.thresholdKey).toBeNull();
  });

  it('carries the operator note from the rule that blocked them', () => {
    const found = deriveAuditFindings(
      input({ sellers: [seller({ verdict: 'blocked' })] }),
      new Map([['trendyol::111', 'Distribütörlük 2026-03 itibarıyla sona erdi.']]),
    );
    expect(found[0]).toMatchObject({
      kind: 'blockedSellerPresent',
      note: 'Distribütörlük 2026-03 itibarıyla sona erdi.',
    });
  });

  it('leaves the note null when the operator wrote none', () => {
    const found = deriveAuditFindings(input({ sellers: [seller({ verdict: 'blocked' })] }));
    expect(found[0]).toMatchObject({ note: null });
  });

  /** The definition of done for Faz 6 names this case explicitly. */
  it('does not raise "not on the list" when no authorised list has ever been entered', () => {
    const found = deriveAuditFindings(input({ sellers: [seller()], hasAuthorisedList: false }));
    expect(kinds(found)).toEqual([]);
  });

  it('raises "not on the list" only once a whitelist exists', () => {
    const found = deriveAuditFindings(input({ sellers: [seller()], hasAuthorisedList: true }));
    expect(kinds(found)).toEqual(['notOnAuthorisedList']);
  });

  it('never raises "not on the list" against a seller who is authorised', () => {
    const found = deriveAuditFindings(
      input({ sellers: [seller({ verdict: 'authorised' })], hasAuthorisedList: true }),
    );
    expect(kinds(found)).toEqual([]);
  });

  it('raises only the blocked finding for a blocked seller, not both', () => {
    const found = deriveAuditFindings(
      input({ sellers: [seller({ verdict: 'blocked' })], hasAuthorisedList: true }),
    );
    expect(kinds(found)).toEqual(['blockedSellerPresent']);
  });

  /**
   * The whole point of the two bases. A seller 40% below the market is the more dramatic number
   * and still sorts below a seller someone already wrote a rule about.
   */
  it('ranks a blacklist match above a price deviation, however large the deviation', () => {
    const found = deriveAuditFindings(
      input({
        sellers: [
          seller({ sellerRef: '222', avgDeviationPct: -40 }),
          seller({ sellerRef: '111', verdict: 'blocked' }),
        ],
      }),
    );
    expect(kinds(found)).toEqual(['blockedSellerPresent', 'belowMarketAverage']);
    expect(found.map((f) => f.basis)).toEqual(['stated', 'measured']);
  });
});

describe('minimum observations', () => {
  it('withholds a measured finding from a seller seen too few times', () => {
    const found = deriveAuditFindings(
      input({ sellers: [seller({ observationCount: 2, avgDeviationPct: -40 })] }),
    );
    expect(kinds(found)).toEqual([]);
  });

  it('still raises the stated finding for that same seller', () => {
    const found = deriveAuditFindings(
      input({ sellers: [seller({ observationCount: 1, verdict: 'blocked', avgDeviationPct: -40 })] }),
    );
    expect(kinds(found)).toEqual(['blockedSellerPresent']);
  });
});

describe('belowMarketAverage', () => {
  const cases: { name: string; deviation: number | null; expected: string[] }[] = [
    { name: 'well below the threshold', deviation: -22, expected: ['belowMarketAverage'] },
    { name: 'exactly at the threshold', deviation: -15, expected: ['belowMarketAverage'] },
    { name: 'just inside it', deviation: -14.9, expected: [] },
    { name: 'above the market', deviation: 8, expected: [] },
    { name: 'never comparable', deviation: null, expected: [] },
  ];

  for (const c of cases) {
    it(`${c.name} -> ${c.expected.length} finding(s)`, () => {
      const found = deriveAuditFindings(input({ sellers: [seller({ avgDeviationPct: c.deviation })] }));
      expect(kinds(found)).toEqual(c.expected);
    });
  }

  it('reports the deviation it fired on, so the row can show its own evidence', () => {
    const found = deriveAuditFindings(input({ sellers: [seller({ avgDeviationPct: -22.4 })] }));
    expect(found[0]).toMatchObject({ deviationPct: -22.4, thresholdKey: 'belowMarketPct' });
  });
});

describe('deepDiscountOnOneProduct', () => {
  const deep = { trackedProductId: 'p9', label: 'Whiskas 12x85g', deviationPct: -42 };

  it('fires when one product is far below and the rest are ordinary', () => {
    const found = deriveAuditFindings(
      input({ sellers: [seller({ worstProduct: deep, avgDeviationPctExcludingWorst: -3 })] }),
    );
    expect(kinds(found)).toContain('deepDiscountOnOneProduct');
  });

  /** Otherwise this is just `belowMarketAverage` with a bigger number attached. */
  it('does not fire when the seller is cheap across the board', () => {
    const found = deriveAuditFindings(
      input({ sellers: [seller({ worstProduct: deep, avgDeviationPctExcludingWorst: -25 })] }),
    );
    expect(kinds(found)).not.toContain('deepDiscountOnOneProduct');
  });

  it('does not fire when there is nothing to contrast against', () => {
    const found = deriveAuditFindings(
      input({
        sellers: [seller({ productCount: 1, worstProduct: deep, avgDeviationPctExcludingWorst: null })],
      }),
    );
    expect(kinds(found)).not.toContain('deepDiscountOnOneProduct');
  });

  /** The evidence to open is the product's looks; the seller is one row inside them. */
  it('takes the product as its subject, not the seller', () => {
    const found = deriveAuditFindings(
      input({ sellers: [seller({ worstProduct: deep, avgDeviationPctExcludingWorst: -3 })] }),
    );
    const finding = found.find((f) => f.kind === 'deepDiscountOnOneProduct')!;
    expect(finding.subject).toEqual({ kind: 'product', trackedProductId: 'p9', label: 'Whiskas 12x85g' });
  });
});

describe('persistentUndercut', () => {
  it('fires for a seller who is cheapest in most of their looks across several products', () => {
    const found = deriveAuditFindings(
      input({ sellers: [seller({ productCount: 6, observationCount: 40, cheapestCount: 33 })] }),
    );
    expect(kinds(found)).toContain('persistentUndercut');
  });

  /** One product's price war is not a pattern; the product floor is what says so. */
  it('does not fire when the seller only sells one product, however often they are cheapest', () => {
    const found = deriveAuditFindings(
      input({ sellers: [seller({ productCount: 1, observationCount: 40, cheapestCount: 40 })] }),
    );
    expect(kinds(found)).not.toContain('persistentUndercut');
  });

  it('reports the share it measured', () => {
    const found = deriveAuditFindings(
      input({ sellers: [seller({ productCount: 4, observationCount: 40, cheapestCount: 30 })] }),
    );
    expect(found.find((f) => f.kind === 'persistentUndercut')).toMatchObject({ sharePct: 75 });
  });
});

describe('newSeller', () => {
  it('fires for a seller first seen inside the window', () => {
    const found = deriveAuditFindings(input({ sellers: [seller({ firstSeenAt: NOW - 2 * DAY })] }));
    expect(kinds(found)).toEqual(['newSeller']);
  });

  it('does not fire for one that has been here for months', () => {
    const found = deriveAuditFindings(input({ sellers: [seller({ firstSeenAt: NOW - 120 * DAY })] }));
    expect(kinds(found)).toEqual([]);
  });

  it('sorts the newest first', () => {
    const found = deriveAuditFindings(
      input({
        sellers: [
          seller({ sellerRef: 'older', firstSeenAt: NOW - 6 * DAY }),
          seller({ sellerRef: 'newer', firstSeenAt: NOW - 1 * DAY }),
        ],
      }),
    );
    expect(found.map((f) => (f.subject.kind === 'seller' ? f.subject.sellerRef : ''))).toEqual([
      'newer',
      'older',
    ]);
  });

  /** A clock skew between the scrape host and this one must not manufacture a finding. */
  it('ignores a first-seen timestamp in the future', () => {
    const found = deriveAuditFindings(input({ sellers: [seller({ firstSeenAt: NOW + DAY })] }));
    expect(kinds(found)).toEqual([]);
  });
});

describe('product findings', () => {
  it('raises a product sitting in a category the brand barely occupies', () => {
    const found = deriveAuditFindings(
      input({
        products: [product({ categoryRef: 'cat-oyuncak', categoryName: 'Oyuncak' })],
        categoryProductCounts: new Map([
          ['cat-kedi-mamasi', 400],
          ['cat-oyuncak', 2],
        ]),
        totalProductCount: 500,
      }),
    );
    expect(found[0]).toMatchObject({
      kind: 'unrelatedCategory',
      categoryName: 'Oyuncak',
      categoryProductCount: 2,
    });
  });

  it('leaves the brand’s main category alone', () => {
    const found = deriveAuditFindings(input({ products: [product()] }));
    expect(kinds(found)).toEqual([]);
  });

  /** A small brand: three products in a category of eight is not an unusual placement. */
  it('does not call a category unusual on share alone when the catalogue is small', () => {
    const found = deriveAuditFindings(
      input({
        products: [product({ categoryRef: 'cat-b' })],
        categoryProductCounts: new Map([['cat-b', 3]]),
        totalProductCount: 8,
      }),
    );
    expect(kinds(found)).toEqual([]);
  });

  it('raises a product the search term found but the brand id does not claim', () => {
    const found = deriveAuditFindings(
      input({ products: [product({ viaBrandRef: false, viaSearchTerm: true })] }),
    );
    expect(kinds(found)).toEqual(['brandRefDisagreement']);
  });

  it('says nothing about a product both selectors agree on', () => {
    const found = deriveAuditFindings(
      input({ products: [product({ viaBrandRef: true, viaSearchTerm: true })] }),
    );
    expect(kinds(found)).toEqual([]);
  });

  it('says nothing about a product only the brand id found', () => {
    const found = deriveAuditFindings(
      input({ products: [product({ viaBrandRef: true, viaSearchTerm: false })] }),
    );
    expect(kinds(found)).toEqual([]);
  });
});

describe('thresholds', () => {
  /**
   * The definition of done: no threshold is buried. Moving one has to change the answer, and a
   * caller must be able to move it in either direction.
   */
  it('answers differently when the operator moves the threshold', () => {
    const sellers = [seller({ avgDeviationPct: -12 })];
    const strict: AuditThresholds = { ...DEFAULT_AUDIT_THRESHOLDS, belowMarketPct: 10 };
    const loose: AuditThresholds = { ...DEFAULT_AUDIT_THRESHOLDS, belowMarketPct: 25 };
    expect(kinds(deriveAuditFindings(input({ sellers, thresholds: strict })))).toEqual([
      'belowMarketAverage',
    ]);
    expect(kinds(deriveAuditFindings(input({ sellers, thresholds: loose })))).toEqual([]);
  });

  it('names the threshold that produced each measured finding', () => {
    const found = deriveAuditFindings(
      input({
        sellers: [
          seller({
            avgDeviationPct: -30,
            productCount: 6,
            observationCount: 10,
            cheapestCount: 9,
            firstSeenAt: NOW - DAY,
          }),
        ],
      }),
    );
    const named = found.filter((f) => f.basis === 'measured');
    expect(named.length).toBeGreaterThan(0);
    for (const finding of named) {
      if (finding.kind === 'brandRefDisagreement') continue;
      expect(finding.thresholdKey).not.toBeNull();
      expect(Object.keys(DEFAULT_AUDIT_THRESHOLDS)).toContain(finding.thresholdKey);
    }
  });
});

describe('ordering', () => {
  it('puts every stated finding above every measured one', () => {
    const found = deriveAuditFindings(
      input({
        hasAuthorisedList: true,
        sellers: [
          seller({ sellerRef: 'a', avgDeviationPct: -50 }),
          seller({ sellerRef: 'b', verdict: 'blocked' }),
          seller({ sellerRef: 'c', verdict: 'authorised', avgDeviationPct: -60 }),
        ],
      }),
    );
    const bases = found.map((f) => f.basis);
    expect(bases.lastIndexOf('stated')).toBeLessThan(bases.indexOf('measured'));
  });

  it('is stable between two runs over the same data', () => {
    const args = input({
      sellers: [
        seller({ sellerRef: 'a', avgDeviationPct: -20 }),
        seller({ sellerRef: 'b', avgDeviationPct: -20 }),
        seller({ sellerRef: 'c', avgDeviationPct: -20 }),
      ],
    });
    expect(deriveAuditFindings(args).map((f) => f.id)).toEqual(deriveAuditFindings(args).map((f) => f.id));
  });

  it('gives every finding an id unique within the run', () => {
    const found = deriveAuditFindings(
      input({
        hasAuthorisedList: true,
        sellers: [
          seller({ sellerRef: 'a', avgDeviationPct: -50, firstSeenAt: NOW - DAY }),
          seller({ sellerRef: 'b', avgDeviationPct: -50, firstSeenAt: NOW - DAY }),
        ],
        products: [product({ trackedProductId: 'p1', viaBrandRef: false })],
      }),
    );
    expect(new Set(found.map((f) => f.id)).size).toBe(found.length);
  });
});
