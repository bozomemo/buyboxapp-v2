/**
 * doc 17 §3.3–§3.5 as a table. Each case is a sentence an operator could say about their file.
 */
import { describe, expect, it } from 'vitest';
import {
  cardKey,
  foldName,
  planBrandProductImport,
  type AmountCell,
  type ExistingCard,
  type ImportContext,
  type ImportRowInput,
  type LinkCell,
} from './import-plan.js';

const amount = (value: bigint): AmountCell => ({ kind: 'amount', value });
const empty: AmountCell = { kind: 'empty' };
const invalid: AmountCell = { kind: 'invalid', text: 'abc' };
const ref = (contentId: string): LinkCell => ({ kind: 'ref', contentId, url: `https://x/p-${contentId}` });
const noLink: LinkCell = { kind: 'empty' };

let line = 0;
function row(overrides: Partial<ImportRowInput> = {}): ImportRowInput {
  line += 1;
  return {
    line,
    name: 'Ton Balıklı 85g',
    referencePrice: amount(49_90n),
    minPrice: empty,
    maxPrice: empty,
    trendyolLink: ref('750104'),
    hepsiburadaLink: noLink,
    barcode: '',
    ...overrides,
  };
}

function context(cards: Record<string, ExistingCard> = {}, names: string[] = []): ImportContext {
  return {
    existingCards: new Map(Object.entries(cards)),
    existingNames: new Set(names.map(foldName)),
  };
}

const primaryOf = (id: string, name: string): ExistingCard => ({
  brandProductId: id,
  brandProductName: name,
  isPrimary: true,
});

function codes(plan: ReturnType<typeof planBrandProductImport>, index = 0): string[] {
  const planned = plan.rows[index]!;
  return planned.kind === 'error' ? planned.errors.map((e) => e.code) : [];
}

describe('planBrandProductImport — matching (§3.3)', () => {
  it('creates a product when neither link is any product’s primary', () => {
    const plan = planBrandProductImport([row()], context());
    expect(plan).toMatchObject({ newProducts: 1, updatedProducts: 0, errorRows: 0, linksToAttach: 1 });
    expect(plan.rows[0]).toMatchObject({
      kind: 'new',
      fields: { name: 'Ton Balıklı 85g', referencePrice: 49_90n, minPrice: null, maxPrice: null },
      links: [{ marketplace: 'trendyol', contentId: '750104' }],
    });
  });

  it('updates the product whose primary the row names', () => {
    const plan = planBrandProductImport(
      [row({ name: 'Yeni ad', referencePrice: amount(59_90n) })],
      context({ [cardKey('trendyol', '750104')]: primaryOf('p1', 'Eski ad') }),
    );
    expect(plan.rows[0]).toMatchObject({
      kind: 'update',
      brandProductId: 'p1',
      fields: { name: 'Yeni ad', referencePrice: 59_90n },
      // The link it matched on is already the primary: a re-import must not churn it.
      links: [],
    });
  });

  it('adds the other marketplace’s link to a product matched by the first', () => {
    const plan = planBrandProductImport(
      [row({ hepsiburadaLink: ref('HBCV1') })],
      context({ [cardKey('trendyol', '750104')]: primaryOf('p1', 'Ürün') }),
    );
    expect(plan.rows[0]).toMatchObject({
      kind: 'update',
      brandProductId: 'p1',
      links: [{ marketplace: 'hepsiburada', contentId: 'HBCV1' }],
    });
  });

  it('refuses a row whose two links belong to different products', () => {
    const plan = planBrandProductImport(
      [row({ hepsiburadaLink: ref('HBCV1') })],
      context({
        [cardKey('trendyol', '750104')]: primaryOf('p1', 'Birinci'),
        [cardKey('hepsiburada', 'HBCV1')]: primaryOf('p2', 'İkinci'),
      }),
    );
    expect(codes(plan)).toEqual(['conflictingProducts']);
  });

  /** A non-primary card is a deliberate extra card; a file must not re-point it silently. */
  it('refuses a link that is somebody’s extra card, and names that product', () => {
    const plan = planBrandProductImport(
      [row()],
      context({
        [cardKey('trendyol', '750104')]: {
          brandProductId: 'p1',
          brandProductName: 'Başka Ürün',
          isPrimary: false,
        },
      }),
    );
    const planned = plan.rows[0]!;
    expect(planned.kind).toBe('error');
    expect(planned.kind === 'error' && planned.errors[0]).toEqual({
      code: 'linkIsSecondaryCard',
      column: 'trendyolLink',
      otherProductName: 'Başka Ürün',
    });
  });

  it('refuses both rows when one link appears twice in the file', () => {
    const plan = planBrandProductImport([row(), row()], context());
    expect(codes(plan, 0)).toEqual(['duplicateLinkInFile']);
    expect(codes(plan, 1)).toEqual(['duplicateLinkInFile']);
    expect(plan.errorRows).toBe(2);
  });
});

describe('planBrandProductImport — the row’s own cells (§3.4, §3.5)', () => {
  it.each([
    { name: 'no name', input: { name: '  ' }, expected: ['missingName'] },
    { name: 'no PSF', input: { referencePrice: empty }, expected: ['missingReferencePrice'] },
    { name: 'unreadable PSF', input: { referencePrice: invalid }, expected: ['unparseableReferencePrice'] },
    { name: 'unreadable min', input: { minPrice: invalid }, expected: ['unparseableMinPrice'] },
    { name: 'zero PSF', input: { referencePrice: amount(0n) }, expected: ['nonPositiveAmount'] },
    {
      name: 'min above the upper bound',
      input: { minPrice: amount(60_00n) },
      expected: ['minAboveUpper'],
    },
    {
      name: 'no link at all',
      input: { trendyolLink: noLink, hepsiburadaLink: noLink },
      expected: ['noLink'],
    },
    {
      name: 'a link in the wrong column',
      input: { trendyolLink: { kind: 'wrongMarketplace' } as LinkCell },
      expected: ['linkWrongColumn'],
    },
    {
      name: 'a Hepsiburada parent-product link',
      input: { hepsiburadaLink: { kind: 'parentProduct' } as LinkCell, trendyolLink: noLink },
      expected: ['linkParentProduct'],
    },
    {
      name: 'an unreadable link',
      input: { trendyolLink: { kind: 'unrecognised' } as LinkCell },
      expected: ['linkUnrecognised'],
    },
  ])('refuses: $name', ({ input, expected }) => {
    expect(codes(planBrandProductImport([row(input)], context()))).toEqual(expected);
  });

  /** An unreadable link already says what is wrong; "no link" on top would be noise. */
  it('does not add "no link" to a row whose only link failed to parse', () => {
    expect(
      codes(
        planBrandProductImport(
          [row({ trendyolLink: { kind: 'unrecognised' } as LinkCell, hepsiburadaLink: noLink })],
          context(),
        ),
      ),
    ).toEqual(['linkUnrecognised']);
  });

  it('clears a min that the file no longer states (§3.4)', () => {
    const plan = planBrandProductImport(
      [row({ minPrice: empty, barcode: '' })],
      context({ [cardKey('trendyol', '750104')]: primaryOf('p1', 'Ürün') }),
    );
    expect(plan.rows[0]).toMatchObject({ kind: 'update', fields: { minPrice: null, barcode: null } });
  });

  it.each([
    {
      name: 'PSF below min',
      input: { minPrice: amount(59_90n), maxPrice: amount(69_90n) },
      warning: 'referenceBelowMin',
    },
    { name: 'PSF above max', input: { maxPrice: amount(39_90n) }, warning: 'referenceAboveMax' },
  ])('accepts and flags: $name', ({ input, warning }) => {
    const plan = planBrandProductImport([row(input)], context());
    expect(plan.rows[0]).toMatchObject({ kind: 'new', warnings: [warning] });
  });

  it('flags a name another row or another product already uses', () => {
    const inFile = planBrandProductImport(
      [row({ trendyolLink: ref('1') }), row({ trendyolLink: ref('2') })],
      context(),
    );
    expect(inFile.rows[0]).toMatchObject({ kind: 'new', warnings: ['duplicateName'] });

    const inCatalogue = planBrandProductImport(
      [row({ name: 'TON BALIKLI 85G' })],
      context({}, ['Ton Balıklı 85g']),
    );
    expect(inCatalogue.rows[0]).toMatchObject({ kind: 'new', warnings: ['duplicateName'] });
  });

  it('collects every problem on a row rather than stopping at the first', () => {
    expect(
      codes(
        planBrandProductImport([row({ name: '', referencePrice: invalid, trendyolLink: noLink })], context()),
      ),
    ).toEqual(['missingName', 'unparseableReferencePrice', 'noLink']);
  });
});

/**
 * The preview and the write must agree. A link to a marketplace this install does not have would
 * fail a foreign key at write time, so it is refused here — per row, so the rest of the file
 * still imports, and visibly, so the preview says it.
 */
describe('planBrandProductImport — marketplaces this install does not have', () => {
  const onlyTrendyol = { ...context(), configuredMarketplaces: new Set(['trendyol']) };

  it('refuses the row whose link names an unknown marketplace', () => {
    const plan = planBrandProductImport(
      [row({ trendyolLink: noLink, hepsiburadaLink: ref('HBCV1') })],
      onlyTrendyol,
    );
    expect(codes(plan)).toEqual(['marketplaceNotConfigured']);
  });

  it('still imports the rows that name a marketplace it does have', () => {
    const plan = planBrandProductImport(
      [row({ trendyolLink: ref('1') }), row({ trendyolLink: noLink, hepsiburadaLink: ref('HBCV1') })],
      onlyTrendyol,
    );
    expect(plan).toMatchObject({ newProducts: 1, errorRows: 1 });
  });

  it('checks nothing when the caller does not say which marketplaces exist', () => {
    const plan = planBrandProductImport([row({ hepsiburadaLink: ref('HBCV1') })], context());
    expect(plan.errorRows).toBe(0);
  });
});

describe('planBrandProductImport — the file as a whole', () => {
  it('counts what a preview has to show (§3.5)', () => {
    const plan = planBrandProductImport(
      [
        row({ trendyolLink: ref('1'), name: 'Yeni' }),
        row({ trendyolLink: ref('2'), hepsiburadaLink: ref('HB2'), name: 'Var olan' }),
        row({ trendyolLink: noLink, hepsiburadaLink: noLink, name: 'Linksiz' }),
      ],
      context({ [cardKey('trendyol', '2')]: primaryOf('p1', 'Var olan') }),
    );
    expect(plan).toMatchObject({
      newProducts: 1,
      updatedProducts: 1,
      errorRows: 1,
      // One for the new product, one Hepsiburada card joining the existing one.
      linksToAttach: 2,
    });
  });
});

describe('foldName', () => {
  it.each([
    ['Ton Balıklı 85g', 'ton balıklı 85g'],
    ['  TON   BALIKLI 85G ', 'ton balıklı 85g'],
    ['İSTANBUL', 'istanbul'],
  ])('%s → %s', (input, expected) => {
    expect(foldName(input)).toBe(expected);
  });
});

describe('planBrandProductImport — barcode cell (2026-09-25)', () => {
  it('refuses a barcode Excel turned into scientific notation', () => {
    const plan = planBrandProductImport([row({ barcode: '8.69E+12' })], context());
    expect(codes(plan)).toEqual(['barcodeScientific']);
  });

  it.each([
    { barcode: '8681002995109', warnings: [] },
    { barcode: '', warnings: [] },
    { barcode: 'ÖZEL-KOD-17', warnings: ['barcodeNotGtin'] },
    { barcode: '8681002995108', warnings: ['barcodeNotGtin'] },
  ])('keeps $barcode with warnings $warnings', ({ barcode, warnings }) => {
    const plan = planBrandProductImport([row({ barcode })], context());
    expect(plan.rows[0]).toMatchObject({ kind: 'new', warnings });
  });
});
