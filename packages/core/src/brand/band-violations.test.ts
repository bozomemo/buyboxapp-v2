/**
 * Table-driven, like every decision branch in this package. Amounts are kuruş.
 */
import { describe, expect, it } from 'vitest';
import { evaluateBand, type BrandProductPrices } from './band.js';
import {
  planBandReconcile,
  sameSeller,
  type BandLook,
  type OpenBandViolation,
} from './band-violations.js';

const PSF_100: BrandProductPrices = { referencePrice: 100_00n, minPrice: 80_00n, maxPrice: null };
const NO_MIN: BrandProductPrices = { referencePrice: 100_00n, minPrice: null, maxPrice: null };

const ALI = { sellerRef: '1', sellerName: 'Ali' };
const VELI = { sellerRef: '2', sellerName: 'Veli' };

function offers(price: bigint, seller = ALI, prices: BrandProductPrices = PSF_100, multiplier = 1): BandLook {
  return {
    kind: 'offers',
    buyboxSeller: seller,
    evaluation: evaluateBand(prices, multiplier, { price, finalPrice: null }),
  };
}

function open(kind: 'belowMin' | 'aboveMax', seller = ALI): OpenBandViolation {
  return { id: `${kind}-${seller.sellerRef}`, kind, ...seller };
}

describe('planBandReconcile', () => {
  it.each([
    {
      name: 'in band, nothing open: nothing to do',
      openRows: [],
      look: offers(90_00n),
      expected: { open: [], confirm: [], resolve: [] },
    },
    {
      name: 'below min, nothing open: opens belowMin against the card-level bound',
      openRows: [],
      look: offers(79_99n),
      expected: {
        open: [{ kind: 'belowMin', ...ALI, thresholdApplied: 80_00n, observedPrice: 79_99n, priceSource: 'price' }],
        confirm: [],
        resolve: [],
      },
    },
    {
      name: 'above PSF (no max), nothing open: opens aboveMax',
      openRows: [],
      look: offers(100_01n),
      expected: {
        open: [{ kind: 'aboveMax', ...ALI, thresholdApplied: 100_00n, observedPrice: 100_01n, priceSource: 'price' }],
        confirm: [],
        resolve: [],
      },
    },
    {
      name: '×3 card: threshold applied is the scaled bound',
      openRows: [],
      look: offers(239_99n, ALI, PSF_100, 3),
      expected: {
        open: [{ kind: 'belowMin', ...ALI, thresholdApplied: 240_00n, observedPrice: 239_99n, priceSource: 'price' }],
        confirm: [],
        resolve: [],
      },
    },
    {
      name: 'same seller still below: confirmed, no new row',
      openRows: [open('belowMin')],
      look: offers(70_00n),
      expected: {
        open: [],
        confirm: [{ id: 'belowMin-1', observedPrice: 70_00n, priceSource: 'price' }],
        resolve: [],
      },
    },
    {
      name: 'another seller also below: old resolved buyboxChanged, new opened',
      openRows: [open('belowMin')],
      look: offers(70_00n, VELI),
      expected: {
        open: [{ kind: 'belowMin', ...VELI, thresholdApplied: 80_00n, observedPrice: 70_00n, priceSource: 'price' }],
        confirm: [],
        resolve: [{ id: 'belowMin-1', resolution: 'buyboxChanged' }],
      },
    },
    {
      name: 'same seller back in band: resolved inBand',
      openRows: [open('belowMin')],
      look: offers(85_00n),
      expected: { open: [], confirm: [], resolve: [{ id: 'belowMin-1', resolution: 'inBand' }] },
    },
    {
      name: 'another seller in band: resolved buyboxChanged',
      openRows: [open('aboveMax')],
      look: offers(95_00n, VELI),
      expected: { open: [], confirm: [], resolve: [{ id: 'aboveMax-1', resolution: 'buyboxChanged' }] },
    },
    {
      name: 'min cleared: open belowMin resolves thresholdRemoved',
      openRows: [open('belowMin')],
      look: offers(50_00n, ALI, NO_MIN),
      expected: { open: [], confirm: [], resolve: [{ id: 'belowMin-1', resolution: 'thresholdRemoved' }] },
    },
    {
      name: 'min cleared but price above PSF: belowMin thresholdRemoved, aboveMax opened',
      openRows: [open('belowMin')],
      look: offers(120_00n, ALI, NO_MIN),
      expected: {
        open: [{ kind: 'aboveMax', ...ALI, thresholdApplied: 100_00n, observedPrice: 120_00n, priceSource: 'price' }],
        confirm: [],
        resolve: [{ id: 'belowMin-1', resolution: 'thresholdRemoved' }],
      },
    },
    {
      name: 'same seller jumps from below min to above max: belowMin ends, aboveMax opens',
      openRows: [open('belowMin')],
      look: offers(130_00n),
      expected: {
        open: [{ kind: 'aboveMax', ...ALI, thresholdApplied: 100_00n, observedPrice: 130_00n, priceSource: 'price' }],
        confirm: [],
        resolve: [{ id: 'belowMin-1', resolution: 'inBand' }],
      },
    },
    {
      name: 'nobody selling: every open row resolves noOffers',
      openRows: [open('belowMin'), open('aboveMax')],
      look: { kind: 'noOffers' } as BandLook,
      expected: {
        open: [],
        confirm: [],
        resolve: [
          { id: 'belowMin-1', resolution: 'noOffers' },
          { id: 'aboveMax-1', resolution: 'noOffers' },
        ],
      },
    },
    {
      name: 'offers but no usable price (unknown): nothing changes',
      openRows: [open('belowMin')],
      look: {
        kind: 'offers',
        buyboxSeller: ALI,
        evaluation: evaluateBand(PSF_100, 1, { price: null, finalPrice: null }),
      } as BandLook,
      expected: { open: [], confirm: [], resolve: [] },
    },
  ])('$name', ({ openRows, look, expected }) => {
    expect(planBandReconcile(openRows, look)).toEqual(expected);
  });

  it('finalPrice is judged and recorded as the source', () => {
    const look: BandLook = {
      kind: 'offers',
      buyboxSeller: ALI,
      evaluation: evaluateBand(PSF_100, 1, { price: 90_00n, finalPrice: 75_00n }),
    };
    expect(planBandReconcile([], look).open).toEqual([
      { kind: 'belowMin', ...ALI, thresholdApplied: 80_00n, observedPrice: 75_00n, priceSource: 'finalPrice' },
    ]);
  });
});

describe('sameSeller', () => {
  it.each([
    { name: 'same ref, different name', a: { sellerRef: '1', sellerName: 'A' }, b: { sellerRef: '1', sellerName: 'B' }, expected: true },
    { name: 'different ref, same name', a: { sellerRef: '1', sellerName: 'A' }, b: { sellerRef: '2', sellerName: 'A' }, expected: false },
    { name: 'no refs, same name', a: { sellerRef: null, sellerName: 'A' }, b: { sellerRef: null, sellerName: 'A' }, expected: true },
    { name: 'one ref missing: not provably the same', a: { sellerRef: '1', sellerName: 'A' }, b: { sellerRef: null, sellerName: 'A' }, expected: false },
  ])('$name', ({ a, b, expected }) => {
    expect(sameSeller(a, b)).toBe(expected);
  });
});
