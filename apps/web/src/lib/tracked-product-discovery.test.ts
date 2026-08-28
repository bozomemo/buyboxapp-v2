import { describe, expect, it } from 'vitest';
import { discoveryLabel, isBrandNameOnly } from './tracked-product-discovery';

describe('discoveryLabel', () => {
  it.each([
    ['both selectors', { viaBrandRef: true, viaSearchTerm: true }, 'marka id + arama'],
    ['brand id only', { viaBrandRef: true, viaSearchTerm: false }, 'marka id'],
    ['search term only', { viaBrandRef: false, viaSearchTerm: true }, 'sadece arama'],
    ['hand-added', { viaBrandRef: false, viaSearchTerm: false }, 'elle eklendi'],
    [
      'swept but unflagged — predates the flags, still belongs to its brand',
      { viaBrandRef: false, viaSearchTerm: false, watchedBrandId: 'b1' },
      'marka taraması',
    ],
  ])('%s', (_name, row, expected) => {
    expect(discoveryLabel(row)).toBe(expected);
  });

  it('treats absent flags as false rather than throwing', () => {
    expect(discoveryLabel({})).toBe('elle eklendi');
  });
});

describe('isBrandNameOnly', () => {
  it('flags a product the marketplace does not attribute to the brand', () => {
    // The Halı case from the 2026-08-27 Whiskas sweep — the brand-misuse shortlist.
    expect(isBrandNameOnly({ viaBrandRef: false, viaSearchTerm: true })).toBe(true);
  });

  it('does not flag a product both selectors found', () => {
    // The ordinary case. Flagging it would put a warning on the whole catalogue.
    expect(isBrandNameOnly({ viaBrandRef: true, viaSearchTerm: true })).toBe(false);
  });

  it('does not flag a hand-added product', () => {
    expect(isBrandNameOnly({ viaBrandRef: false, viaSearchTerm: false })).toBe(false);
    expect(isBrandNameOnly({})).toBe(false);
  });
});
